require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');

// Firebase Setup
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-key.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const UPLOAD_DIR = path.join(os.tmpdir(), 'programlive_uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use('/files', express.static(UPLOAD_DIR));

// Base Default State for new programs
const DEFAULT_STATE = {
  isLive: false,
  liveStartTime: null,
  activeItemIndex: 0,
  items: [
    { id: "1", type: "prayer", title: "Вступне слово, молитва", duration: 600, assignee: "Служитель", cues: { sound: "Мікрофон кафедра" }, content: null, attachments: [] },
    { id: "2", type: "music", title: "«Пам'ятай шлях»", duration: 600, assignee: "Загальний спів", cues: { media: "Текст пісні" }, content: null, attachments: [] }
  ]
};

// Database Helpers
async function getProgramState(programId) {
  const doc = await db.collection('programs').doc(programId).get();
  if (doc.exists) return doc.data();
  await db.collection('programs').doc(programId).set(DEFAULT_STATE);
  return DEFAULT_STATE;
}

async function updateProgramState(programId, updates) {
  await db.collection('programs').doc(programId).update(updates);
  return await getProgramState(programId);
}

// Upload endpoint
app.post('/upload/:programId/:itemId', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { programId, itemId } = req.params;
  const fileUrl = `/files/${req.file.filename}`;
  const fileName = req.body.customName || req.file.originalname;
  const fileType = req.file.mimetype;

  let state = await getProgramState(programId);
  const itemIndex = state.items.findIndex(i => i.id === itemId);
  if (itemIndex !== -1) {
    if (!state.items[itemIndex].attachments) state.items[itemIndex].attachments = [];
    state.items[itemIndex].attachments.push({ url: fileUrl, name: fileName, type: fileType });
    state = await updateProgramState(programId, { items: state.items });
    io.to(programId).emit('stateUpdate', { ...state, serverTime: Date.now() });
  }
  res.json({ ok: true, url: fileUrl, name: fileName });
});

// Delete file endpoint
app.delete('/upload/:programId/:itemId/:filename', async (req, res) => {
  const { programId, itemId, filename } = req.params;
  let state = await getProgramState(programId);
  const itemIndex = state.items.findIndex(i => i.id === itemId);
  if (itemIndex !== -1 && state.items[itemIndex].attachments) {
    state.items[itemIndex].attachments = state.items[itemIndex].attachments.filter(a => !a.url.includes(filename));
    state = await updateProgramState(programId, { items: state.items });
    try { fs.unlinkSync(path.join(UPLOAD_DIR, filename)); } catch (e) { }
    io.to(programId).emit('stateUpdate', { ...state, serverTime: Date.now() });
  }
  res.json({ ok: true });
});

// Websockets
io.on('connection', async (socket) => {
  const programId = socket.handshake.query.programId || 'default';
  socket.join(programId);
  
  let state = await getProgramState(programId);
  socket.emit('stateUpdate', { ...state, serverTime: Date.now() });
  
  socket.on('setActiveItem', async (index) => {
    let s = await getProgramState(programId);
    s.activeItemIndex = index;
    if (s.isLive) s.liveStartTime = Date.now();
    s = await updateProgramState(programId, { activeItemIndex: s.activeItemIndex, liveStartTime: s.liveStartTime });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('toggleLive', async () => {
    let s = await getProgramState(programId);
    s.isLive = !s.isLive;
    s.liveStartTime = s.isLive ? Date.now() : null;
    s = await updateProgramState(programId, { isLive: s.isLive, liveStartTime: s.liveStartTime });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('moveItem', async ({ index, direction }) => {
    let s = await getProgramState(programId);
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < s.items.length) {
      const temp = s.items[index];
      s.items[index] = s.items[newIndex];
      s.items[newIndex] = temp;
      
      let newActive = s.activeItemIndex;
      if (newActive === index) newActive = newIndex;
      else if (newActive === newIndex) newActive = index;
      
      s = await updateProgramState(programId, { items: s.items, activeItemIndex: newActive });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('updateItem', async ({ index, updatedData }) => {
    let s = await getProgramState(programId);
    if (s.items[index]) {
      s.items[index] = {
        ...s.items[index],
        title: updatedData.title,
        duration: updatedData.duration,
        assignee: updatedData.assignee,
        cues: { ...s.items[index].cues, sound: updatedData.sound, media: updatedData.media },
        content: { ...(s.items[index].content || {}), chords: updatedData.chords }
      };
      s = await updateProgramState(programId, { items: s.items });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('deleteItem', async (index) => {
    let s = await getProgramState(programId);
    if (index >= 0 && index < s.items.length) {
      s.items.splice(index, 1);
      let newActive = s.activeItemIndex;
      if (newActive >= s.items.length) newActive = Math.max(0, s.items.length - 1);
      s = await updateProgramState(programId, { items: s.items, activeItemIndex: newActive });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });
});

const BOT_TOKEN = process.env.BOT_TOKEN;
if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);
  
  bot.command('start', (ctx) => {
    ctx.reply("Привіт! Я ProgramLive Bot.\nВикористовуйте /new щоб створити нову незалежну програму.");
  });

  bot.command('new', async (ctx) => {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    await db.collection('programs').doc(newId).set(DEFAULT_STATE);
    
    let botUsername = "ProgramLiveBot";
    try {
      const botInfo = await bot.telegram.getMe();
      botUsername = botInfo.username;
    } catch(e) {}

    // Telegram Web App direct link format
    const appLink = `https://t.me/${botUsername}/app?startapp=${newId}`;
    
    ctx.reply(`✅ Нова програма створена!\nID програми: ${newId}\n\nНадішліть це посилання учасникам команди або в групу, щоб відкрити цю конкретную програму:\n${appLink}`, {
      reply_markup: { inline_keyboard: [[{ text: "Відкрити Програму", url: appLink }]] }
    });
  });

  bot.launch();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
