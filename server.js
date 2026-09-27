require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ─────────────────────────────────────────────
// FILE UPLOADS (stored in system /tmp — works on Render)
// ─────────────────────────────────────────────
const UPLOAD_DIR = path.join(os.tmpdir(), 'programlive_uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
});

// Serve static app files
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/files', express.static(UPLOAD_DIR));

// Upload endpoint
app.post('/upload/:itemId', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });

  const itemId = req.params.itemId;
  const fileUrl = `/files/${req.file.filename}`;
  const fileName = req.body.customName || req.file.originalname;
  const fileType = req.file.mimetype;

  // Attach file info to matching item in state
  const item = state.items.find(i => i.id === itemId);
  if (item) {
    if (!item.attachments) item.attachments = [];
    item.attachments.push({ url: fileUrl, name: fileName, type: fileType });
    io.emit('stateUpdate', { ...state, serverTime: Date.now() });
  }

  res.json({ ok: true, url: fileUrl, name: fileName });
});

// Delete file attachment endpoint
app.delete('/upload/:itemId/:filename', (req, res) => {
  const { itemId, filename } = req.params;
  const item = state.items.find(i => i.id === itemId);
  if (item && item.attachments) {
    item.attachments = item.attachments.filter(a => !a.url.includes(filename));
    // Try to delete the physical file
    try { fs.unlinkSync(path.join(UPLOAD_DIR, filename)); } catch (e) { /* ignore */ }
    io.emit('stateUpdate', { ...state, serverTime: Date.now() });
  }
  res.json({ ok: true });
});

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let state = {
  isLive: false,
  liveStartTime: null,
  activeItemIndex: 0,
  items: [
    { id: "1", type: "prayer", title: "Вступне слово, молитва", duration: 600, assignee: "Служитель", cues: { sound: "Мікрофон кафедра" }, content: null, attachments: [] },
    { id: "2", type: "music", title: "Пам-ятай шлях", duration: 600, assignee: "Загальний спів", cues: { media: "Текст пісні" }, content: null, attachments: [] },
    { id: "3", type: "music", title: "Симфонічна поема - Мойсей на горі Синай", duration: 1200, assignee: "Симфонічний оркестр", cues: { sound: "Оркестр" }, content: null, attachments: [] },
    { id: "4", type: "word", title: "Слово про служіння видавництва Християнин", duration: 1800, assignee: "Тимофій Кравченко", cues: { sound: "Мікрофон кафедра" }, content: null, attachments: [] },
    { id: "5", type: "info", title: "Свідчення братів, привітання", duration: 1800, assignee: "Брати", cues: { sound: "Радіомікрофони 1,2" }, content: null, attachments: [] },
    { id: "6", type: "choir", title: "Добрі руки з неба", duration: 600, assignee: "Хор та симф. оркестр", cues: { sound: "Мікрофони хор" }, content: null, attachments: [] },
    { id: "7", type: "info", title: "Слайд-презентація про життя братства", duration: 1200, assignee: "Медіа відділ", cues: { media: "Запуск презентації", light: "Приглушити світло" }, content: null, attachments: [] },
    { id: "8", type: "music", title: "Якщо віра склала крила", duration: 300, assignee: "Спів братів", cues: { sound: "Мікрофони 1-4" }, content: null, attachments: [] },
    { id: "9", type: "word", title: "Вірш - Стражденній церкві", duration: 300, assignee: "Читець", cues: { sound: "Мікрофон соло" }, content: null, attachments: [] },
    { id: "10", type: "choir", title: "Кантата-ода - Вірність крізь покоління", duration: 1200, assignee: "Хор та симф. оркестр", cues: {}, content: null, attachments: [] },
    { id: "11", type: "music", title: "Всевишньому слава", duration: 600, assignee: "Загальний спів", cues: { media: "Текст пісні" }, content: null, attachments: [] },
    { id: "12", type: "choir", title: "Наші межі", duration: 600, assignee: "Хор та симф. оркестр", cues: {}, content: null, attachments: [] },
    { id: "13", type: "word", title: "Заключна проповідь", duration: 1200, assignee: "Павло Кригін", cues: { sound: "Мікрофон кафедра" }, content: null, attachments: [] },
    { id: "14", type: "music", title: "Жити з Ісусом", duration: 300, assignee: "Загальний спів", cues: { media: "Текст пісні" }, content: null, attachments: [] },
    { id: "15", type: "music", title: "Бог розтинає море", duration: 300, assignee: "Спів у супроводі дух. ансамблю", cues: { sound: "Духові" }, content: null, attachments: [] },
    { id: "16", type: "prayer", title: "Заключна молитва", duration: 300, assignee: "Служитель", cues: {}, content: null, attachments: [] }
  ]
};

io.on('connection', (socket) => {
  socket.emit('stateUpdate', { ...state, serverTime: Date.now() });
  
  socket.on('setActiveItem', (index) => {
    state.activeItemIndex = index;
    if (state.isLive) state.liveStartTime = Date.now();
    io.emit('stateUpdate', { ...state, serverTime: Date.now() });
  });

  socket.on('toggleLive', () => {
    state.isLive = !state.isLive;
    state.liveStartTime = state.isLive ? Date.now() : null;
    io.emit('stateUpdate', { ...state, serverTime: Date.now() });
  });

  socket.on('moveItem', ({ index, direction }) => {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < state.items.length) {
      const temp = state.items[index];
      state.items[index] = state.items[newIndex];
      state.items[newIndex] = temp;
      if (state.activeItemIndex === index) state.activeItemIndex = newIndex;
      else if (state.activeItemIndex === newIndex) state.activeItemIndex = index;
      io.emit('stateUpdate', { ...state, serverTime: Date.now() });
    }
  });

  socket.on('updateItem', ({ index, updatedData }) => {
    if (state.items[index]) {
      state.items[index] = {
        ...state.items[index],
        title: updatedData.title,
        duration: updatedData.duration,
        assignee: updatedData.assignee,
        cues: { ...state.items[index].cues, sound: updatedData.sound, media: updatedData.media },
        content: { ...(state.items[index].content || {}), chords: updatedData.chords }
      };
      io.emit('stateUpdate', { ...state, serverTime: Date.now() });
    }
  });

  socket.on('deleteItem', (index) => {
    if (index >= 0 && index < state.items.length) {
      state.items.splice(index, 1);
      // Adjust active index if needed
      if (state.activeItemIndex >= state.items.length) {
        state.activeItemIndex = Math.max(0, state.items.length - 1);
      }
      io.emit('stateUpdate', { ...state, serverTime: Date.now() });
    }
  });
});

const BOT_TOKEN = process.env.BOT_TOKEN;
if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);
  const WEB_APP_URL = process.env.WEB_APP_URL || "https://programlive-tg.onrender.com";
  bot.command('start', (ctx) => {
    ctx.reply("Система готова. Відкрийте розклад:", {
      reply_markup: { inline_keyboard: [[{ text: "Відкрити Програму", web_app: { url: WEB_APP_URL } }]] }
    });
  });
  bot.launch();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Running on port ${PORT}`));
