require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────
// RICH STATE (All PCO Features)
// ─────────────────────────────────────────────
let state = {
  isLive: false,
  liveStartTime: null, // When the current item started (timestamp)
  activeItemIndex: 1, // Currently active item
  items: [
    { 
      id: "1", 
      type: "music", 
      title: "Великий Бог", 
      duration: 300, // 5 mins in seconds
      assignee: "Група прославлення",
      cues: { sound: "Всі мікрофони", media: "Текст (Фон 1)", light: "Яскраве біле" },
      content: { chords: "Тональність: C\nКуплет 1:\nC G Am F...", text: null }
    },
    { 
      id: "2", 
      type: "prayer", 
      title: "Молитва за служіння", 
      duration: 180, // 3 mins
      assignee: "Пастор Віктор",
      cues: { sound: "Мікрофон 1 (Соло)", media: "Заставка 'Молитва'", light: "Приглушене" },
      content: null
    },
    { 
      id: "3", 
      type: "choir", 
      title: "Я піду за Тобою (Хор)", 
      duration: 240, 
      assignee: "Молодіжний Хор",
      cues: { sound: "Стійки 1-6 + Фонограма", media: "Текст", light: "Заливка сцени" },
      content: { chords: null, text: "Я піду за Тобою..." }
    },
    { 
      id: "4", 
      type: "word", 
      title: "Проповідь: Сила віри", 
      duration: 1800, // 30 mins
      assignee: "Брат Олексій",
      cues: { sound: "Гарнітура 1", media: "Презентація (Слайд 1-15)", light: "Фокус на кафедру" },
      content: null
    },
    { 
      id: "5", 
      type: "info", 
      title: "Оголошення та збір", 
      duration: 300, 
      assignee: "Брат Сергій",
      cues: { sound: "Мікрофон 2 + Відео", media: "Відеоролик 'Табір 2024'", light: "Стандартне" },
      content: null
    }
  ]
};

io.on('connection', (socket) => {
  // Send current state and server time offset
  socket.emit('stateUpdate', { ...state, serverTime: Date.now() });
  
  socket.on('setActiveItem', (index) => {
    state.activeItemIndex = index;
    if (state.isLive) state.liveStartTime = Date.now(); // Reset timer if live
    io.emit('stateUpdate', { ...state, serverTime: Date.now() });
  });

  socket.on('toggleLive', () => {
    state.isLive = !state.isLive;
    if (state.isLive) {
      state.liveStartTime = Date.now();
    } else {
      state.liveStartTime = null;
    }
    io.emit('stateUpdate', { ...state, serverTime: Date.now() });
  });

  socket.on('moveItem', ({ index, direction }) => {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < state.items.length) {
      const temp = state.items[index];
      state.items[index] = state.items[newIndex];
      state.items[newIndex] = temp;
      
      // Update active index if moved
      if (state.activeItemIndex === index) state.activeItemIndex = newIndex;
      else if (state.activeItemIndex === newIndex) state.activeItemIndex = index;

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
server.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
