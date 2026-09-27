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
    { id: "1", type: "prayer", title: "Вступне слово, молитва", duration: 600, assignee: "Служитель", cues: { sound: "Мікрофон кафедра" }, content: null },
    { id: "2", type: "music", title: "«Пам'ятай шлях»", duration: 600, assignee: "Загальний спів", cues: { media: "Текст пісні" }, content: null },
    { id: "3", type: "music", title: "Симфонічна поема «Мойсей на горі Синай»", duration: 1200, assignee: "Симфонічний оркестр", cues: { sound: "Оркестр" }, content: null },
    { id: "4", type: "word", title: "Слово про служіння видавництва «Християнин»", duration: 1800, assignee: "Тимофій Кравченко", cues: { sound: "Мікрофон кафедра" }, content: null },
    { id: "5", type: "info", title: "Свідчення братів, привітання", duration: 1800, assignee: "Брати", cues: { sound: "Радіомікрофони 1,2" }, content: null },
    { id: "6", type: "choir", title: "«Добрі руки з неба»", duration: 600, assignee: "Хор та симф. оркестр", cues: { sound: "Мікрофони хор" }, content: null },
    { id: "7", type: "info", title: "Слайд-презентація про життя братства", duration: 1200, assignee: "Медіа відділ", cues: { media: "Запуск презентації", light: "Приглушити світло" }, content: null },
    { id: "8", type: "music", title: "«Якщо віра склала крила»", duration: 300, assignee: "Спів братів", cues: { sound: "Мікрофони 1-4" }, content: null },
    { id: "9", type: "word", title: "Вірш «Стражденній церкві»", duration: 300, assignee: "Читець", cues: { sound: "Мікрофон соло" }, content: null },
    { id: "10", type: "choir", title: "Кантата-ода «Вірність крізь покоління»", duration: 1200, assignee: "Хор та симф. оркестр", cues: {}, content: null },
    { id: "11", type: "music", title: "«Всевишньому слава»", duration: 600, assignee: "Загальний спів", cues: { media: "Текст пісні" }, content: null },
    { id: "12", type: "choir", title: "«Наші межі»", duration: 600, assignee: "Хор та симф. оркестр", cues: {}, content: null },
    { id: "13", type: "word", title: "Заключна проповідь", duration: 1200, assignee: "Павло Кригін", cues: { sound: "Мікрофон кафедра" }, content: null },
    { id: "14", type: "music", title: "«Жити з Ісусом»", duration: 300, assignee: "Загальний спів", cues: { media: "Текст пісні" }, content: null },
    { id: "15", type: "music", title: "«Бог розтинає море»", duration: 300, assignee: "Спів у супроводі дух. ансамблю", cues: { sound: "Духові" }, content: null },
    { id: "16", type: "prayer", title: "Заключна молитва", duration: 300, assignee: "Служитель", cues: {}, content: null }
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
