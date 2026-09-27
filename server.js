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
// STATE
// ─────────────────────────────────────────────
let state = {
  isLive: false,
  liveStartTime: null,
  activeItemIndex: 0,
  items: [
    { 
      id: "1", type: "music", title: "Великий Бог", duration: 300, 
      assignee: "Група прославлення",
      cues: { sound: "Всі мікрофони", media: "Текст (Фон 1)", light: "Яскраве біле" },
      content: { chords: "Тональність: C\nКуплет 1:\nC G Am F...", text: null }
    },
    { 
      id: "2", type: "prayer", title: "Молитва за служіння", duration: 180, 
      assignee: "Пастор Віктор",
      cues: { sound: "Мікрофон 1 (Соло)", media: "Заставка 'Молитва'", light: "Приглушене" },
      content: { chords: null, text: null }
    }
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

  // NEW: Update Item (Edit feature)
  socket.on('updateItem', ({ index, updatedData }) => {
    if (state.items[index]) {
      // Merge old data with new data
      state.items[index] = { 
        ...state.items[index], 
        title: updatedData.title,
        duration: updatedData.duration,
        assignee: updatedData.assignee,
        cues: { ...state.items[index].cues, sound: updatedData.sound, media: updatedData.media },
        content: { ...state.items[index].content, chords: updatedData.chords }
      };
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
