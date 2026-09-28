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

const { getProgramData, updateProgramState, DEFAULT_STATE } = require('./programs/programService');

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


if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);
  const { setupBot } = require('./bot/handlers');
  setupBot(bot, db, app, express, io);
}

// Websockets
const { setupSockets } = require('./socket/programSocket');
setupSockets(io, bot, db, BOT_TOKEN);

// Background cleanup task (runs daily)
// Deletes files older than 48 hours to save storage and keep things clean


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
