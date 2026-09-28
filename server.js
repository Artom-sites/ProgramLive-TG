require('dotenv').config();
const BOT_TOKEN = process.env.BOT_TOKEN;
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Telegraf } = require('telegraf');
let bot = null;
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { verifyBotCanMessage, sendLiveStarted, scheduleProgramChangeNotification, triggerProgramChangeNotification } = require('./services/notifications');
const { sendDocumentWithRetry } = require('./services/telegramUpload');
const { validateTelegramInitData } = require('./services/telegramAuth');


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
app.post('/upload/telegram', (req, res, next) => {
  upload.single('file')(req, res, function (err) {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Файл завеликий. Максимальний розмір — 20 МБ.' });
      }
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  if (!bot) {
    return res.status(503).json({ error: 'Telegram bot is not initialized' });
  }

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  
  const customName = req.body.customName || req.file.originalname;
  const userId = req.body.userId;
  const fileType = req.file.mimetype;
  
  if (!userId) return res.status(400).json({ error: "No userId provided" });

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB limit
  if (req.file.size > MAX_FILE_SIZE) {
    return res.status(413).json({ error: 'Файл завеликий. Максимальний розмір — 20 МБ.' });
  }

  try {
    const caption = `📁 <b>Файл завантажено в систему!</b>\n\nНазва: ${customName}\n<i>Він тепер прикріплений до вашої програми. Ви можете видалити це повідомлення.</i>`;
    
    const msg = await sendDocumentWithRetry(
      bot, 
      userId, 
      req.file.buffer, 
      customName, 
      fileType, 
      caption
    );

    const file_id = msg.document.file_id;
    
    res.json({ 
      ok: true, 
      file_id, 
      name: customName, 
      type: fileType,
      url: `/download/telegram/${file_id}?name=${encodeURIComponent(customName)}`
    });
  } catch (err) {
    console.error("Upload route error:", err.message);
    if (err.isUserFriendly) {
      res.status(err.statusCode || 500).json({ error: err.message });
    } else {
      res.status(500).json({ error: "Failed to upload to Telegram" });
    }
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
  
  let user = validateTelegramInitData(initData, BOT_TOKEN, false);
  const userId = user ? user.id : null;

  if (!userId) return res.status(403).json({ error: "Unauthorized" });

  try {
    const doc = await db.collection('programs').doc(programId).get();
    if (!doc.exists) return res.status(404).json({ error: "Програму не знайдено" });
    
    const data = doc.data();
    if (!data.admins.includes(userId) && data.admins.length > 0) {
      return res.status(403).json({ error: "Тільки адміністратор може надсилати сповіщення" });
    }

    await triggerProgramChangeNotification(programId, bot, db);
    res.json({ ok: true, sent: 1 });
  } catch (err) {
    console.error("Notify error:", err);
    res.status(500).json({ error: err.message });
  }
});


// Websockets
io.on('connection', async (socket) => {
  const auth = socket.handshake.auth || {};
  const query = socket.handshake.query || {};
  const programId = auth.programId || query.programId || 'default';
  const initData = auth.initData || '';
  
  // --- SERVER-SIDE DEBUG LOGGING ---
  console.log(`[Auth Debug] New connection for programId: ${programId}`);
  
  let userId = null;
  const parsedUser = validateTelegramInitData(initData, BOT_TOKEN, true);
  if (parsedUser) {
    userId = parsedUser.id;
    socket.data.firstName = parsedUser.first_name || 'Користувач';
  }
  // ---------------------------------

  socket.data.userId = userId;
  socket.join(programId);
  
  let data = await getProgramData(programId);
  
  const isAdmin = userId !== null && (data.admins.includes(userId) || data.admins.length === 0);
  console.log(`[Auth Debug] Final isAdmin status: ${isAdmin}\n`);
  
  // --- Auto-delete specific notification if token is provided ---
  const notifyToken = auth.notifyToken || '';
  if (notifyToken && data.notifyTokens && data.notifyTokens[notifyToken]) {
    if (bot) {
      const { chatId, messageId } = data.notifyTokens[notifyToken];
      if (chatId == userId) {
        try {
        await bot.telegram.deleteMessage(chatId, messageId);
      } catch (e) {
        console.error(`Failed to delete notification ${messageId} in ${chatId}:`, e.message);
        }
      }
    }
    try {
      await db.collection('programs').doc(programId).update({
        [`notifyTokens.${notifyToken}`]: require('firebase-admin/firestore').FieldValue.delete()
      });
    } catch (err) {
      console.error("Error removing notifyToken from DB:", err);
    }
  }
  
  const isSubscribed = (data.privateSubscribers || []).includes(userId);
  const linkedChats = data.linkedChats || [];
  const linkedChatsMeta = data.linkedChatsMeta || {};
  const privateSubscribersCount = (data.privateSubscribers || []).length;
  socket.emit('init', { 
    state: data.state, 
    isAdmin, 
    isSubscribed,
    linkedChats,
    linkedChatsMeta,
    privateSubscribers: data.privateSubscribers || [],
    privateSubscribersMeta: data.privateSubscribersMeta || {},
    serverTime: Date.now() 
  });
  
  socket.on('toggleSubscription', async (callback) => {
    const uid = socket.data.userId;
    const firstName = socket.data.firstName || 'Користувач';
    if (!uid) return callback({error: "Unauthorized"});

    let pData = await getProgramData(programId);
    let subs = pData.privateSubscribers || [];
    let isSubbed = subs.includes(uid);

    console.log(`[Subscription Debug]\nprogramId: ${programId}\nuserId: ${uid}\nbefore: ${isSubbed ? 'subscribed' : 'unsubscribed'}`);

    const { FieldValue } = require('firebase-admin/firestore');

    if (isSubbed) {
      await db.collection('programs').doc(programId).update({ 
        privateSubscribers: FieldValue.arrayRemove(uid),
        [`privateSubscribersMeta.${uid}`]: FieldValue.delete()
      });
      console.log(`[Subscription Debug] after: unsubscribed`);
      
      const afterDocUnsub = await db.collection('programs').doc(programId).get();
      io.to(programId).emit('recipientsUpdate', {
         linkedChats: afterDocUnsub.data().linkedChats || [],
         linkedChatsMeta: afterDocUnsub.data().linkedChatsMeta || {},
         privateSubscribers: afterDocUnsub.data().privateSubscribers || [],
         privateSubscribersMeta: afterDocUnsub.data().privateSubscribersMeta || {}
      });
      callback({ subscribed: false });

    } else {
      const canMsg = await verifyBotCanMessage(bot, uid);
      if (!canMsg) return callback({ error: "BOT_BLOCKED" });
      await db.collection('programs').doc(programId).update({ 
        privateSubscribers: FieldValue.arrayUnion(uid),
        [`privateSubscribersMeta.${uid}`]: firstName
      });
      
      const afterDoc = await db.collection('programs').doc(programId).get();
      console.log(`[Subscription Debug] after: subscribed (total count: ${(afterDoc.data().privateSubscribers || []).length})`);
      
      io.to(programId).emit('recipientsUpdate', {
         linkedChats: afterDoc.data().linkedChats || [],
         linkedChatsMeta: afterDoc.data().linkedChatsMeta || {},
         privateSubscribers: afterDoc.data().privateSubscribers || [],
         privateSubscribersMeta: afterDoc.data().privateSubscribersMeta || {}
      });
      callback({ subscribed: true });
    }
  });

  socket.on('toggleLive', async () => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    s.isLive = !s.isLive;
    s.liveStartTime = s.isLive ? Date.now() : null;
    
    if (s.isLive && (!s.activeItemId || !s.items.some(i => i.id === s.activeItemId)) && s.items.length > 0) {
      s.activeItemId = s.items[0].id;
    }
    
    s = await updateProgramState(programId, { isLive: s.isLive, liveStartTime: s.liveStartTime, activeItemId: s.activeItemId });
    if (s.isLive) {
      sendLiveStarted(programId, bot, db);
    }
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('resetProgramSchedule', async () => {
    if (!isAdmin) return;
    let pData = await getProgramData(programId);
    if (pData.state.isLive) return; // double check server side
    
    pData.state.items = [];
    pData.state.activeItemId = null;
    pData.state.isLive = false;
    pData.state.liveStartTime = null;
    
    await updateProgramState(programId, {
      items: [],
      activeItemId: null,
      isLive: false,
      liveStartTime: null
    });
    
    const { FieldValue } = require('firebase-admin/firestore');
    await db.collection('programs').doc(programId).update({
       activeGroupNotifications: FieldValue.delete(),
       activePrivateNotifications: FieldValue.delete(),
       notifyTokens: FieldValue.delete()
    });
    
    console.log(`[Reset Debug] Program ${programId} reset for new cycle. Recipients kept.`);
    io.to(programId).emit('stateUpdate', { ...pData.state, serverTime: Date.now() });
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
      
      const current = await getProgramData(programId);
      const isLive = current.state.isLive === true;
      
      console.log(`[Notify Debug] reorder received\nprogramId: ${programId}\nisAdmin: ${isAdmin}\nisLive: ${isLive}\nitems changed: true`);
      
      if (isLive) {
        scheduleProgramChangeNotification(programId, bot, db);
      }
      
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('updateProgramSettings', async (newSettings) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    s.title = newSettings.title;
    s = await updateProgramState(programId, { title: s.title });
    if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);
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
      if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);
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
      if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);
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
    if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });
});


if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);
  
  bot.catch((err, ctx) => {
    console.error(`[Telegram] Update handling error\nupdateType: ${ctx.updateType}\nerror: ${err.message}`);
  });

  const webhookPath = '/telegram/webhook';
  // Ensure express parses JSON before Telegraf
    // Use express.json() specifically for the webhook route
  app.use(webhookPath, express.json());
  
  app.post(webhookPath, (req, res, next) => {
    bot.webhookCallback(webhookPath)(req, res, next);
  });
  
  app.get('/telegram/status', async (req, res) => {
    try {
      const info = await bot.telegram.getWebhookInfo();
      res.json({ ok: true, info });
    } catch(e) {
      res.json({ ok: false, error: e.message });
    }
  });

// Graceful shutdown
process.once('SIGINT', () => {
  if (bot && global.botPollingStarted) bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  if (bot && global.botPollingStarted) bot.stop('SIGTERM');
  process.exit(0);
});

  
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
  if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
    console.log(`[Group Link Debug] /start received\nchatType: ${ctx.chat.type}\nchatId: ${ctx.chat.id}\nuserId: ${ctx.from.id}\npayload: ${ctx.payload}\ntext: ${ctx.message?.text}`);
    const payload = ctx.payload;
    if (payload) {
      try {
        const doc = await db.collection('programs').doc(payload).get();
        if (!doc.exists) return ctx.reply("❌ Програму не знайдено.");
        const data = doc.data();
        const userId = ctx.from.id;
        
        const isProgramAdmin = data.admins && data.admins.includes(userId);
        console.log(`[Group Link Debug] program admin = ${!!isProgramAdmin}`);
        if (!isProgramAdmin) return ctx.reply("❌ У вас немає прав адміністратора для цієї програми.");
        
        let isGroupAdmin = false;
        try {
          const member = await ctx.telegram.getChatMember(ctx.chat.id, userId);
          isGroupAdmin = (member.status === 'administrator' || member.status === 'creator');
        } catch(e) {
          console.error("[Group Link Debug] Group admin check API failed:", e.message);
          return ctx.reply("❌ Помилка перевірки прав. Переконайтеся, що ви адміністратор цієї групи і бот має права адміністратора.");
        }
        
        console.log(`[Group Link Debug] telegram group admin = ${isGroupAdmin}`);
        if (!isGroupAdmin) return ctx.reply("❌ Ви повинні бути адміністратором цієї групи, щоб прив'язати її.");
        
        try {
          const botMember = await ctx.telegram.getChatMember(ctx.chat.id, ctx.botInfo.id);
          console.log(`[Group Link Debug] bot permissions - status: ${botMember.status}, can_delete: ${botMember.can_delete_messages}`);
        } catch(e) { console.error("[Group Link Debug] Bot perm check err", e.message); }
        
        console.log(`[Group Link Debug] linking\nprogramId: ${payload}\nchatId: ${ctx.chat.id}\nchatTitle: ${ctx.chat.title}`);
        
        await db.collection('programs').doc(payload).update({
          linkedChats: require('firebase-admin/firestore').FieldValue.arrayUnion(ctx.chat.id),
          [`linkedChatsMeta.${ctx.chat.id}`]: ctx.chat.title || 'Група'
        });
        
        const afterDoc = await db.collection('programs').doc(payload).get();
        const afterData = afterDoc.data();
        console.log(`[Group Link Debug] linked successfully\n[Group Link Debug] Firestore recipients after link\nlinkedChats count: ${afterData.linkedChats ? afterData.linkedChats.length : 0}`);
        
        io.to(payload).emit('recipientsUpdate', { 
           linkedChats: afterData.linkedChats || [],
           linkedChatsMeta: afterData.linkedChatsMeta || {},
           privateSubscribers: afterData.privateSubscribers || [],
           privateSubscribersMeta: afterData.privateSubscribersMeta || {}
        });
        
        const cardText = `🎼 <b>Програма «${data.state?.title || payload}»</b>\n\nСлідкуйте за програмою в реальному часі.`;
        return ctx.reply(cardText, { 
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити програму", url: `https://t.me/ProgramLive_bot/app?startapp=${payload}` } ]] }
        });
      } catch (e) {
        console.error("[Group Link Debug] Link error via startgroup:", e);
        return ctx.reply("❌ Помилка прив'язки.");
      }
    }
    return;
  }

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
      
      try {
        const member = await ctx.getChatMember(ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
          return ctx.reply("❌ Ви повинні бути адміністратором цієї групи, щоб прив'язати її.");
        }
      } catch(e) {
        console.error("Group admin check failed:", e);
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
    await ctx.reply("Введіть назву для нової програми:", {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "Наприклад: Недільне служіння"
      }
    });
  });

  bot.on('text', async (ctx, next) => {
    // Якщо це звичайний текст, перевіряємо чи це відповідь на наш запит
    if (ctx.message?.reply_to_message?.text === "Введіть назву для нової програми:") {
      const programName = ctx.message.text.trim();
      const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const userId = ctx.from.id;
      
      const newState = JSON.parse(JSON.stringify(DEFAULT_STATE));
      newState.title = programName || "Нова програма";

      await db.collection('programs').doc(newId).set({
        ownerId: userId,
        admins: [userId],
        state: newState
      });
      
      await ctx.reply(`✅ Програму «${newState.title}» успішно створено!\nНатисніть кнопку нижче, щоб додати пункти розкладу.`, {
        reply_markup: {
          inline_keyboard: [[
            { text: "📱 Відкрити програму", web_app: { url: `https://programlive-tg.onrender.com/?id=${newId}` } }
          ]]
        }
      }).catch(()=>null);
    } else {
      return next();
    }
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

  
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
  if (isProduction) {
    const webhookUrl = `https://programlive-tg.onrender.com/telegram/webhook`;
    bot.telegram.setWebhook(webhookUrl, {
      allowed_updates: ['message', 'inline_query', 'chosen_inline_result', 'callback_query'],
      }).then(() => {
      console.log(`Telegram webhook configured\nWebhook URL: ${webhookUrl}`);
      bot.telegram.getWebhookInfo().then(info => {
        console.log(`Webhook info:\nconfigured: true\npending_update_count: ${info.pending_update_count}\nlast_error_message: ${info.last_error_message || 'none'}`);
      });
    }).catch(console.error);
  } else {
    bot.telegram.deleteWebhook().then(() => {
      console.log("Development mode: starting long-polling...");
      bot.launch({ drop_pending_updates: true }).then(() => { global.botPollingStarted = true; });
    }).catch(console.error);
  }
}

// Background cleanup task (runs daily)
// Deletes files older than 48 hours to save storage and keep things clean


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
