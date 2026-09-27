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
// MODERN PRO STATE (Clean data, no emojis, no ALL CAPS)
// ─────────────────────────────────────────────
let state = {
  isLive: false,
  items: [
    { id: "1", category: "music", type: "Загальний спів", title: "Великий Бог", note: "Тональність C", active: false },
    { id: "2", category: "prayer", type: "Молитва", title: "Відкриття служіння", note: "Головний мікрофон", active: true },
    { id: "3", category: "choir", type: "Спів гурту", title: "Я піду за Тобою", note: "Мікрофони 1-4", active: false },
    { id: "4", category: "word", type: "Проповідь", title: "Віктор", note: "Презентація", active: false },
    { id: "5", category: "info", type: "Оголошення", title: "Молодіжний табір", note: "Відеоролик", active: false }
  ]
};

io.on('connection', (socket) => {
  socket.emit('stateUpdate', state);
  
  socket.on('setActiveItem', (index) => {
    state.items.forEach((item, i) => item.active = (i === index));
    io.emit('stateUpdate', state);
  });

  socket.on('toggleLive', () => {
    state.isLive = !state.isLive;
    io.emit('stateUpdate', state);
  });

  socket.on('moveItem', ({ index, direction }) => {
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < state.items.length) {
      const temp = state.items[index];
      state.items[index] = state.items[newIndex];
      state.items[newIndex] = temp;
      io.emit('stateUpdate', state);
    }
  });
});

const BOT_TOKEN = process.env.BOT_TOKEN;
if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);
  const WEB_APP_URL = process.env.WEB_APP_URL || "https://your-app.onrender.com";
  bot.command('start', (ctx) => {
    ctx.reply("Вітаю! Відкрийте програму служіння:", {
      reply_markup: { inline_keyboard: [[{ text: "Відкрити програму", web_app: { url: WEB_APP_URL } }]] }
    });
  });
  bot.launch();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 MODERN SERVER RUNNING ON http://localhost:${PORT}`);
});
