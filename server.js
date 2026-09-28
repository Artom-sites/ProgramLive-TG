require('dotenv').config();
const BOT_TOKEN = process.env.BOT_TOKEN;
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

function validateWebAppData(initData, token) {
  if (!initData) return null;
  try {
    const q = new URLSearchParams(initData);
    const hash = q.get('hash');
    if (!hash) return null;
    q.delete('hash');
    const keys = Array.from(q.keys()).sort();
    const dataCheckString = keys.map(k => k + '=' + q.get(k)).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token.trim()).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calculatedHash === hash) {
      const userStr = q.get('user');
      if (userStr) return JSON.parse(userStr);
    }
  } catch (e) {}
  return null;
}


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
  activeItemId: null,
  items: []
};

// Database Helpers
async function getProgramData(programId) {
  const doc = await db.collection('programs').doc(programId).get();
  let data = null;
  if (doc.exists) {
    data = doc.data();
    if (data.items && !data.state) {
      data = { ownerId: null, admins: [], state: { title: "Програма", ...data } };
    }
    if (!data.state.title) data.state.title = "Програма";
  } else {
    data = { ownerId: null, admins: [], state: DEFAULT_STATE };
    await db.collection('programs').doc(programId).set(data);
  }

  let changed = false;
  if (data.state && data.state.items) {
    data.state.items.forEach(item => {
      if (!item.id) {
        item.id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
        changed = true;
      }
    });

    if (data.state.activeItemIndex !== undefined && data.state.activeItemId === undefined) {
      const idx = data.state.activeItemIndex;
      if (data.state.items[idx]) {
        data.state.activeItemId = data.state.items[idx].id;
      } else {
        data.state.activeItemId = null;
      }
      delete data.state.activeItemIndex;
      changed = true;
    }
  }

  if (changed) {
    await db.collection('programs').doc(programId).set(data);
  }

  return data;
}

async function updateProgramState(programId, stateUpdates) {
  const data = await getProgramData(programId);
  const newState = { ...data.state, ...stateUpdates };
  await db.collection('programs').doc(programId).update({ state: newState });
  return newState;
}

// Upload endpoint

// Upload file directly to Telegram and return file_id
app.post('/upload/telegram', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  const customName = req.body.customName || req.file.originalname;
  const userId = req.body.userId;
  const fileType = req.file.mimetype;
  
  if (!userId) return res.status(400).json({ error: "No userId provided" });

  try {
    const msg = await bot.telegram.sendDocument(userId, {
      source: req.file.buffer,
      filename: customName
    }, {
      caption: `📁 <b>Файл завантажено в систему!</b>\n\nНазва: ${customName}\n<i>Він тепер прикріплений до вашої програми. Ви можете видалити це повідомлення.</i>`,
      parse_mode: 'HTML'
    });

    const file_id = msg.document.file_id;
    
    res.json({ 
      ok: true, 
      file_id, 
      name: customName, 
      type: fileType,
      url: `/download/telegram/${file_id}?name=${encodeURIComponent(customName)}`
    });
  } catch (err) {
    console.error("Telegram Upload error:", err);
    res.status(500).json({ error: err.message || "Failed to upload to Telegram" });
  }
});

// Download file via Telegram file_id
const https = require('https');
app.get('/download/telegram/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const originalName = req.query.name || 'file';
    
    const link = await bot.telegram.getFileLink(fileId);
    
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
    
    https.get(link.href, (stream) => {
      stream.pipe(res);
    }).on('error', (err) => {
      console.error("Stream error:", err);
      res.status(500).send('Error downloading file');
    });
  } catch (err) {
    console.error("Download proxy error:", err);
    res.status(500).send('Error downloading file');
  }
});

// Notify linked groups endpoint
app.post('/notify/:programId', express.json(), async (req, res) => {
  const { programId } = req.params;
  const { initData } = req.body;
  
  
  let debugValidation = "OK";
  let user = null;
  if (!initData) {
    debugValidation = "No initData provided";
  } else {
    try {
      const q = new URLSearchParams(initData);
      const hash = q.get('hash');
      if (!hash) {
        debugValidation = "No hash in initData";
      } else {
        q.delete('hash');
        const keys = Array.from(q.keys()).sort();
        const dataCheckString = keys.map(k => `${k}=${q.get(k)}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) {
          debugValidation = "Hash mismatch. Expected: " + hash + " Got: " + calculatedHash;
        } else {
          user = JSON.parse(q.get('user'));
        }
      }
    } catch(e) {
      debugValidation = "Exception: " + e.message;
    }
  }
  const userId = user ? user.id : null;

  if (!userId) return res.status(403).json({ error: "Unauthorized" });

  try {
    const doc = await db.collection('programs').doc(programId).get();
    if (!doc.exists) return res.status(404).json({ error: "Програму не знайдено" });
    
    const data = doc.data();
    if (!data.admins.includes(userId) && data.admins.length > 0) {
      return res.status(403).json({ error: "Тільки адміністратор може надсилати сповіщення" });
    }

    const linkedChats = data.linkedChats || [];
    if (linkedChats.length === 0) {
      return res.status(400).json({ error: "До цієї програми не прив'язано жодної групи. Спочатку додайте бота в групу і відправте команду /link " + programId });
    }

    const title = data.state?.title || `Програма ${programId}`;
    let successCount = 0;

    for (const chatId of linkedChats) {
      try {
        await bot.telegram.sendMessage(chatId, `🔔 <b>Увага!</b>\n\nУ розкладі <b>«${title}»</b> щойно відбулися зміни.\nБудь ласка, відкрийте програму, щоб переглянути актуальну версію!`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: "📱 Відкрити оновлений розклад", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}` }
            ]]
          }
        });
        successCount++;
      } catch (e) {
        console.error("Failed to notify chat", chatId, e.message);
        if (e.message.includes("bot was kicked") || e.message.includes("chat not found")) {
          await db.collection('programs').doc(programId).update({
            linkedChats: require('firebase-admin/firestore').FieldValue.arrayRemove(chatId)
          });
        }
      }
    }

    res.json({ ok: true, sent: successCount, total: linkedChats.length });
  } catch (err) {
    console.error("Notify error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Websockets
io.on('connection', async (socket) => {
  const programId = socket.handshake.query.programId || 'default';
  const initData = socket.handshake.query.initData || '';
  
  // VALIDATE INIT DATA
  const user = validateWebAppData(initData, BOT_TOKEN);
  const userId = user ? user.id : null;
  socket.data.userId = userId;
  
  socket.join(programId);
  
  let data = await getProgramData(programId);
  
  // MUST HAVE VALID USER AND BE IN ADMINS TO HAVE WRITE PERMISSIONS
  const isAdmin = userId !== null && (data.admins.includes(userId) || data.admins.length === 0);
  
  socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now(), debugValidation });
  
  socket.on('setActiveItem', async (itemId) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    s.activeItemId = itemId;
    if (s.isLive) s.liveStartTime = Date.now();
    s = await updateProgramState(programId, { activeItemId: s.activeItemId, liveStartTime: s.liveStartTime });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('toggleLive', async () => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    s.isLive = !s.isLive;
    s.liveStartTime = s.isLive ? Date.now() : null;
    s = await updateProgramState(programId, { isLive: s.isLive, liveStartTime: s.liveStartTime });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('moveItem', async ({ index, direction }) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < s.items.length) {
      const temp = s.items[index];
      s.items[index] = s.items[newIndex];
      s.items[newIndex] = temp;
      s = await updateProgramState(programId, { items: s.items });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('updateProgramSettings', async (newSettings) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    s.title = newSettings.title;
    s = await updateProgramState(programId, { title: s.title });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('updateItem', async ({ index, updatedData }) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    if (s.items[index]) {
      s.items[index] = {
        ...s.items[index],
        type: updatedData.type || s.items[index].type || 'standard',
        title: updatedData.title,
        duration: updatedData.duration,
        assignee: updatedData.assignee,
        cues: { ...s.items[index].cues, sound: updatedData.sound, media: updatedData.media },
        content: { ...(s.items[index].content || {}), chords: updatedData.chords }, attachments: updatedData.attachments || s.items[index].attachments || []
      };
      s = await updateProgramState(programId, { items: s.items });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('deleteItem', async (index) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    if (index >= 0 && index < s.items.length) {
      const deletedItem = s.items[index];
      s.items.splice(index, 1);
      
      let newActiveId = s.activeItemId;
      if (s.activeItemId === deletedItem.id) {
        if (s.items[index]) {
          newActiveId = s.items[index].id;
        } else if (s.items[index - 1]) {
          newActiveId = s.items[index - 1].id;
        } else {
          newActiveId = null;
        }
      }
      s = await updateProgramState(programId, { items: s.items, activeItemId: newActiveId });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('addItem', async (itemData) => {
    if (!isAdmin) return;
    const crypto = require('crypto');
    const newItem = { id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36), attachments: itemData.attachments || [], ...itemData };
    let s = (await getProgramData(programId)).state;
    s.items.push(newItem);
    s = await updateProgramState(programId, { items: s.items });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });
});


if (BOT_TOKEN) {
  const bot = new Telegraf(BOT_TOKEN);
  
  async function sendDashboard(ctx, page = 0, mode = 'view', isEdit = false) {
    try {
      const userId = ctx.from.id;
      const snapshot = await db.collection('programs').where('admins', 'array-contains', userId).get();
      
      let programs = [];
      snapshot.forEach(doc => {
        programs.push({ id: doc.id, ...doc.data() });
      });
      programs.reverse(); // Show newest first (roughly)

      const perPage = 5;
      const totalPages = Math.ceil(programs.length / perPage) || 1;
      page = Math.min(Math.max(0, page), totalPages - 1);
      
      const pagePrograms = programs.slice(page * perPage, (page + 1) * perPage);

      let text = mode === 'view' 
        ? "🎛 <b>Ваші програми:</b>\nОберіть програму для відкриття:" 
        : "🗑 <b>Режим видалення:</b>\nНатисніть на програму, щоб назавжди її видалити:";
      
      if (programs.length === 0) text = "Привіт! У вас ще немає жодної програми.";

      let buttons = [];
      
      pagePrograms.forEach(p => {
        const title = p.state?.title || `Програма ${p.id}`;
        if (mode === 'view') {
          buttons.push([{ text: `📂 ${title}`, web_app: { url: `https://programlive-tg.onrender.com/?id=${p.id}` } }]);
        } else {
          buttons.push([{ text: `❌ Видалити "${title}"`, callback_data: `del_${p.id}_${page}` }]);
        }
      });

      // Pagination row
      let navRow = [];
      if (page > 0) navRow.push({ text: "⬅️", callback_data: `dash_${page - 1}_${mode}` });
      if (totalPages > 1) navRow.push({ text: `${page + 1}/${totalPages}`, callback_data: "ignore" });
      if (page < totalPages - 1) navRow.push({ text: "➡️", callback_data: `dash_${page + 1}_${mode}` });
      if (navRow.length > 0) buttons.push(navRow);

      // Contextual action buttons
      if (mode === 'view') {
        if (programs.length > 0) {
          buttons.push([{ text: "⚙️ Видалити програму", callback_data: `dash_${page}_edit` }]);
        }
      } else {
        buttons.push([{ text: "🔙 Готово", callback_data: `dash_${page}_view` }]);
      }

      const extra = { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } };

      if (isEdit) {
        await ctx.editMessageText(text, extra).catch(console.error);
      } else {
        await ctx.reply(text, extra).catch(console.error);
      }
    } catch (err) {
      console.error("Dashboard error:", err);
      await ctx.reply(`⚠️ Помилка завантаження меню: ${err.message}`).catch(()=>null);
    }
  }

  bot.start(async (ctx) => {
    const mainMenu = {
      keyboard: [
        [{ text: "📂 Мої програми" }, { text: "➕ Створити програму" }]
      ],
      resize_keyboard: true,
      is_persistent: true
    };
    await ctx.reply("👋 Вітаємо! Скористайтеся меню нижче:", { reply_markup: mainMenu }).catch(console.error);
  });

  bot.command('link', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
      return ctx.reply("⚠️ Будь ласка, вкажіть ID програми. Формат: /link ID_ПРОГРАМИ");
    }
    const programId = args[1].trim();
    
    if (ctx.chat.type === 'private') {
      return ctx.reply("⚠️ Цю команду потрібно використовувати безпосередньо в групі, яку ви хочете прив'язати.");
    }

    try {
      const docRef = db.collection('programs').doc(programId);
      const doc = await docRef.get();
      
      if (!doc.exists) {
        return ctx.reply("❌ Програму з таким ID не знайдено.");
      }
      
      const data = doc.data();
      if (!data.admins.includes(ctx.from.id)) {
        return ctx.reply("❌ Тільки адміністратор програми може прив'язувати її до груп.");
      }

      await docRef.update({
        linkedChats: require('firebase-admin/firestore').FieldValue.arrayUnion(ctx.chat.id)
      });
      
      await ctx.reply(`✅ Групу успішно прив'язано до розкладу <b>${data.state.title || programId}</b>!\nТепер ви зможете надсилати сюди сповіщення прямо з додатка.`, { parse_mode: 'HTML' });
    } catch (e) {
      console.error("Link error:", e);
      await ctx.reply("❌ Сталася помилка при прив'язці.");
    }
  });

  bot.action(/^dash_(\d+)_(\w+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const mode = ctx.match[2];
    await sendDashboard(ctx, page, mode, true);
    await ctx.answerCbQuery();
  });

  bot.action(/^create_(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1]);
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const userId = ctx.from.id;

    const today = new Date();
    const dateStr = today.toLocaleDateString('uk-UA');
    const newState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    newState.title = `Програма ${dateStr}`;

    await db.collection('programs').doc(newId).set({
      ownerId: userId,
      admins: [userId],
      state: newState
    });
    
    await ctx.answerCbQuery("✅ Програму створено!");
    await sendDashboard(ctx, 0, 'view', true);
  });

  bot.action(/^del_([A-Z0-9]+)_(\d+)$/, async (ctx) => {
    const progId = ctx.match[1];
    const page = parseInt(ctx.match[2]);
    await db.collection('programs').doc(progId).delete();
    await ctx.answerCbQuery("🗑 Програму видалено");
    await sendDashboard(ctx, page, 'edit', true);
  });

  bot.action("ignore", (ctx) => ctx.answerCbQuery());

  // Menu Keyboard actions
  bot.hears("📂 Мої програми", async (ctx) => {
    await sendDashboard(ctx, 0, 'view', false);
  });
  
  bot.hears("⚙️ Видалити програму", async (ctx) => {
    await sendDashboard(ctx, 0, 'edit', false);
  });

  bot.hears("➕ Створити програму", async (ctx) => {
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const userId = ctx.from.id;
    
    // Create a dynamic title based on date
    const today = new Date();
    const dateStr = today.toLocaleDateString('uk-UA');
    const newState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    newState.title = `Програма ${dateStr}`;

    await db.collection('programs').doc(newId).set({
      ownerId: userId,
      admins: [userId],
      state: newState
    });
    await ctx.reply("✅ Програму створено!").catch(()=>null);
    await sendDashboard(ctx, 0, 'view', false);
  });

  // Inline Mode for sharing to groups
  bot.on('inline_query', async (ctx) => {
    try {
      const userId = ctx.from.id;
      const query = ctx.inlineQuery.query.trim();
      const snapshot = await db.collection('programs').where('admins', 'array-contains', userId).get();
      
      let results = snapshot.docs.map(doc => {
        const p = { id: doc.id, ...doc.data() };
        const title = p.state?.title || `Програма ${p.id}`;
        return {
          type: 'article',
          id: p.id,
          title: title,
          description: 'Надіслати цей розклад у чат',
          input_message_content: {
            message_text: `🎼 <b>${title}</b>\nСлідкуйте за програмою в реальному часі.\n\n<a href="https://t.me/ProgramLive_bot/app?startapp=${p.id}">Відкрити програму</a>`,
            parse_mode: 'HTML'
          },
          reply_markup: {
            inline_keyboard: [[
              { text: "📱 Відкрити програму", url: `https://t.me/ProgramLive_bot/app?startapp=${p.id}` }
            ]]
          }
        };
      });

      if (query) {
        results = results.filter(r => r.id === query || r.title.toLowerCase().includes(query.toLowerCase()));
      }

      await ctx.answerInlineQuery(results, { cache_time: 0 });
    } catch (e) {
      console.error("Inline query error:", e);
    }
  });

  // Catch old keyboard button if it's stuck
  bot.hears("➕ Створити нову програму", async (ctx) => {
    await sendDashboard(ctx, 0, 'view', false);
  });

  // Delete webhook and use long-polling. Free Render instances sleep, causing webhooks to timeout and fail.
  // We use drop_pending_updates to minimize the "double process" overlap on restarts.
  bot.telegram.deleteWebhook().then(() => {
    console.log("Webhook deleted, starting long-polling...");
    bot.launch({ drop_pending_updates: true });
  }).catch(console.error);
}

// Background cleanup task (runs daily)
// Deletes files older than 48 hours to save storage and keep things clean


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
