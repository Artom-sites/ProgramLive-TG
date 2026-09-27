require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

let serviceAccount;
try {
  if (fs.existsSync(path.join(__dirname, 'firebase-key.json'))) {
    serviceAccount = require('./firebase-key.json');
    console.log("Firebase key loaded from ./firebase-key.json");
  } else if (fs.existsSync('/etc/secrets/firebase-key.json')) {
    serviceAccount = require('/etc/secrets/firebase-key.json');
    console.log("Firebase key loaded from /etc/secrets/firebase-key.json");
  } else if (process.env.FIREBASE_CREDENTIALS) {
    serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    console.log("Firebase key loaded from environment variables");
  } else {
    throw new Error("Cannot find firebase-key.json file or FIREBASE_CREDENTIALS env var");
  }
} catch (err) {
  console.error("FATAL ERROR loading Firebase key:", err.message);
  process.exit(1);
}

initializeApp({ 
  credential: cert(serviceAccount),
  storageBucket: serviceAccount.project_id + '.appspot.com' 
});
const db = getFirestore();
const bucket = getStorage().bucket();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const upload = multer({ 
  storage: multer.memoryStorage(), 
  limits: { fileSize: 20 * 1024 * 1024 } 
});

app.use(express.static(path.join(__dirname, 'public')));

// Base Default State for new programs
const DEFAULT_STATE = {
  title: "Нова програма",
  isLive: false,
  liveStartTime: null,
  activeItemIndex: 0,
  items: [
    { id: "1", type: "prayer", title: "Вступне слово, молитва", duration: 600, assignee: "Служитель", cues: { sound: "Мікрофон кафедра" }, content: null, attachments: [] },
    { id: "2", type: "music", title: "«Пам'ятай шлях»", duration: 600, assignee: "Загальний спів", cues: { media: "Текст пісні" }, content: null, attachments: [] }
  ]
};

// Database Helpers
async function getProgramData(programId) {
  const doc = await db.collection('programs').doc(programId).get();
  if (doc.exists) {
    const data = doc.data();
    if (data.items && !data.state) {
      return { ownerId: null, admins: [], state: { title: "Програма", ...data } };
    }
    if (!data.state.title) data.state.title = "Програма";
    return data;
  }
  
  const newData = { ownerId: null, admins: [], state: DEFAULT_STATE };
  await db.collection('programs').doc(programId).set(newData);
  return newData;
}

async function updateProgramState(programId, stateUpdates) {
  const data = await getProgramData(programId);
  const newState = { ...data.state, ...stateUpdates };
  await db.collection('programs').doc(programId).update({ state: newState });
  return newState;
}

// Upload endpoint
app.post('/upload/:programId/:itemId', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  const { programId, itemId } = req.params;
  const fileName = req.body.customName || req.file.originalname;
  const fileType = req.file.mimetype;
  const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const ext = path.extname(req.file.originalname);
  const storagePath = `programs/${programId}/${itemId}/${uniqueId}${ext}`;

  try {
    const fileRef = bucket.file(storagePath);
    await fileRef.save(req.file.buffer, {
      metadata: { contentType: fileType }
    });
    // Make file public to get a direct URL (or get a signed URL if bucket doesn't allow public access).
    // Using makePublic() is easier for Telegram Mini Apps viewing public chords.
    await fileRef.makePublic();
    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

    let data = await getProgramData(programId);
    let state = data.state;
    const itemIndex = state.items.findIndex(i => i.id === itemId);
    if (itemIndex !== -1) {
      if (!state.items[itemIndex].attachments) state.items[itemIndex].attachments = [];
      state.items[itemIndex].attachments.push({ url: fileUrl, storagePath, name: fileName, type: fileType });
      state = await updateProgramState(programId, { items: state.items });
      io.to(programId).emit('stateUpdate', { ...state, serverTime: Date.now() });
    }
    res.json({ ok: true, url: fileUrl, name: fileName });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload" });
  }
});

// Delete file endpoint
app.delete('/upload/:programId/:itemId/:filename', async (req, res) => {
  const { programId, itemId } = req.params;
  // Note: we can't easily rely on filename anymore if it's a full URL.
  // The frontend passes the URL or filename. Let's look up the storagePath.
  const queryFilename = req.params.filename; 

  let data = await getProgramData(programId);
  let state = data.state;
  const itemIndex = state.items.findIndex(i => i.id === itemId);
  
  if (itemIndex !== -1 && state.items[itemIndex].attachments) {
    const attachment = state.items[itemIndex].attachments.find(a => a.url.includes(queryFilename) || (a.storagePath && a.storagePath.includes(queryFilename)));
    
    if (attachment) {
      state.items[itemIndex].attachments = state.items[itemIndex].attachments.filter(a => a !== attachment);
      state = await updateProgramState(programId, { items: state.items });
      io.to(programId).emit('stateUpdate', { ...state, serverTime: Date.now() });
      
      if (attachment.storagePath) {
        try { await bucket.file(attachment.storagePath).delete(); } catch(e) { console.error("Firebase delete error:", e); }
      }
    }
  }
  res.json({ ok: true });
});

// Websockets
io.on('connection', async (socket) => {
  const programId = socket.handshake.query.programId || 'default';
  const userId = parseInt(socket.handshake.query.userId) || 0;
  socket.join(programId);
  
  let data = await getProgramData(programId);
  
  // You are admin if you are in the admins list, or if the program is public/legacy (admins empty)
  const isAdmin = data.admins.includes(userId) || data.admins.length === 0;
  
  socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now() });
  
  socket.on('setActiveItem', async (index) => {
    let s = (await getProgramData(programId)).state;
    s.activeItemIndex = index;
    if (s.isLive) s.liveStartTime = Date.now();
    s = await updateProgramState(programId, { activeItemIndex: s.activeItemIndex, liveStartTime: s.liveStartTime });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('toggleLive', async () => {
    let s = (await getProgramData(programId)).state;
    s.isLive = !s.isLive;
    s.liveStartTime = s.isLive ? Date.now() : null;
    s = await updateProgramState(programId, { isLive: s.isLive, liveStartTime: s.liveStartTime });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('moveItem', async ({ index, direction }) => {
    let s = (await getProgramData(programId)).state;
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

  socket.on('updateProgramSettings', async (newSettings) => {
    let s = (await getProgramData(programId)).state;
    s.title = newSettings.title;
    s = await updateProgramState(programId, { title: s.title });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('updateItem', async ({ index, updatedData }) => {
    let s = (await getProgramData(programId)).state;
    if (s.items[index]) {
      s.items[index] = {
        ...s.items[index],
        type: updatedData.type || s.items[index].type || 'standard',
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
    let s = (await getProgramData(programId)).state;
    if (index >= 0 && index < s.items.length) {
      s.items.splice(index, 1);
      let newActive = s.activeItemIndex;
      if (newActive >= s.items.length) newActive = Math.max(0, s.items.length - 1);
      s = await updateProgramState(programId, { items: s.items, activeItemIndex: newActive });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('addItem', async (newItem) => {
    let s = (await getProgramData(programId)).state;
    newItem.id = Math.random().toString(36).substring(2, 9);
    if (!s.items) s.items = [];
    s.items.push(newItem);
    s = await updateProgramState(programId, { items: s.items });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });
});

const BOT_TOKEN = process.env.BOT_TOKEN;
if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);
  
  async function sendDashboard(ctx, isEdit = false) {
    const userId = ctx.from.id;
    const snapshot = await db.collection('programs').where('admins', 'array-contains', userId).get();
    
    let programs = [];
    snapshot.forEach(doc => {
      programs.push({ id: doc.id, ...doc.data() });
    });

    const text = programs.length === 0 
      ? "Привіт! У вас ще немає жодної програми.\nНатисніть кнопку нижче, щоб створити першу."
      : "🎛 **Ваші програми:**\nОберіть програму для керування або створіть нову:";

    let buttons = programs.map(p => {
      const title = p.state?.title || `Програма ${p.id}`;
      return [{ text: `📂 ${title}`, web_app: { url: `https://programlive-tg.onrender.com/?id=${p.id}` } }];
    });
    buttons.push([{ text: "➕ Створити нову", callback_data: "create_program" }]);

    const extra = { parse_mode: "Markdown", reply_markup: { inline_keyboard: buttons } };

    if (isEdit) {
      await ctx.editMessageText(text, extra).catch(console.error);
    } else {
      // Remove old keyboard with a ghost message
      const msg = await ctx.reply("⏳ Завантаження...", { reply_markup: { remove_keyboard: true } });
      await ctx.deleteMessage(msg.message_id).catch(() => {});
      // Send real dashboard
      await ctx.reply(text, extra);
    }
  }

  bot.start(async (ctx) => {
    await sendDashboard(ctx, false);
  });

  bot.action("create_program", async (ctx) => {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const userId = ctx.from.id;
    await db.collection('programs').doc(newId).set({
      ownerId: userId,
      admins: [userId],
      state: DEFAULT_STATE
    });
    
    await ctx.answerCbQuery("✅ Програму створено!");
    await sendDashboard(ctx, true);
  });

  // Catch old keyboard button if it's stuck
  bot.hears("➕ Створити нову програму", async (ctx) => {
    await sendDashboard(ctx, false);
  });

  bot.launch();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
