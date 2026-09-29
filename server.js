const { validateLoadTestEnvironment } = require('./services/loadTestGuard');
validateLoadTestEnvironment();
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


const { db } = require('./config/firebase');


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
    const caption = `📁 <b>Файл завантажено в систему!</b>\n\nНазва: ${customName}`;
    
    const msg = await sendDocumentWithRetry(
      bot, 
      userId, 
      req.file.buffer, 
      customName, 
      fileType, 
      caption
    );

    const file_id = msg.document.file_id;
    
    // Auto-delete the message so it doesn't clutter the user's chat
    try {
      await bot.telegram.deleteMessage(userId, msg.message_id);
    } catch (e) {
      console.error("Could not auto-delete upload message:", e.message);
    }
    
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
const telegramFileCache = new Map();

app.get('/download/telegram/:fileId', async (req, res) => {
  const startTime = Date.now();
  try {
    const fileId = req.params.fileId;

    if (process.env.LOAD_TEST_MODE === 'true' && process.env.K_SERVICE === 'programlive-staging') {
      if (fileId === 'TEST_1MB') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(Buffer.alloc(1024 * 1024, 'A')); // 1MB fake
        return;
      }
      if (fileId === 'TEST_5MB') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', '5242880');
        res.setHeader('Cache-Control', 'no-store');
        
        const { Readable } = require('stream');
        const totalSize = 5242880;
        const chunkSize = 65536;
        let bytesSent = 0;
        
        const stream = new Readable({
          read() {
            if (bytesSent >= totalSize) {
              this.push(null);
            } else {
              const toSend = Math.min(chunkSize, totalSize - bytesSent);
              this.push(Buffer.alloc(toSend, 'A'));
              bytesSent += toSend;
            }
          }
        });
        
        stream.pipe(res);
        return;
      }
    }

    const originalName = req.query.name || 'file';
    
    let linkStr = telegramFileCache.get(fileId)?.href;
    const cacheTime = telegramFileCache.get(fileId)?.time || 0;
    
    if (!linkStr || Date.now() - cacheTime > 30 * 60 * 1000) {
      const t1 = Date.now();
      const link = await bot.telegram.getFileLink(fileId);
      console.log(`[PDF Proxy Perf] getFile metadata: ${Date.now() - t1}ms`);
      linkStr = link.href;
      telegramFileCache.set(fileId, { href: linkStr, time: Date.now() });
    }
    
    const t2 = Date.now();
    https.get(linkStr, (telegramRes) => {
      console.log(`[PDF Proxy Perf] Telegram first response: ${Date.now() - t2}ms`);
      let contentType = telegramRes.headers['content-type'] || 'application/octet-stream';
      if (originalName.toLowerCase().endsWith('.pdf')) {
        contentType = 'application/pdf';
      }
      
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(originalName)}"`);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      
      telegramRes.pipe(res);
      telegramRes.on('end', () => {
        console.log(`[PDF Proxy Perf] proxy completed: ${Date.now() - startTime}ms`);
      });
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

if (process.env.LOAD_TEST_MODE === 'true') {
  console.log("⚠️ LOAD_TEST_MODE IS ACTIVE");
  const { monitorEventLoopDelay } = require('perf_hooks');
  const h = monitorEventLoopDelay({ resolution: 20 });
  h.enable();
  setInterval(() => {
    const mem = process.memoryUsage();
    const rss = Math.round(mem.rss / 1024 / 1024);
    const heap = Math.round(mem.heapUsed / 1024 / 1024);
    const sockets = io.engine.clientsCount;
    
    const p50 = Math.round(h.percentile(50) / 1e6);
    const p95 = Math.round(h.percentile(95) / 1e6);
    const max = Math.round(h.max / 1e6);
    
    console.log(`[LoadMetrics] Sockets: ${sockets} | RAM: ${rss}MB (Heap: ${heap}MB) | EL_Lag(ms): p50=${p50} p95=${p95} max=${max}`);
    h.reset();
  }, 5000);
}

server.listen(PORT, () => console.log(`🚀 RUNNING ON PORT ${PORT}`));
  
