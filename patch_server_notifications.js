const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Add requirement for notifications at the top
if (!code.includes("const { verifyBotCanMessage, sendLiveStarted, scheduleProgramChangeNotification, triggerProgramChangeNotification } = require('./services/notifications');")) {
    code = code.replace(
        "const crypto = require('crypto');",
        "const crypto = require('crypto');\nconst { verifyBotCanMessage, sendLiveStarted, scheduleProgramChangeNotification, triggerProgramChangeNotification } = require('./services/notifications');"
    );
}

// 2. Modify toggleLive
code = code.replace(
    "s = await updateProgramState(programId, { isLive: s.isLive, liveStartTime: s.liveStartTime });",
    "s = await updateProgramState(programId, { isLive: s.isLive, liveStartTime: s.liveStartTime });\n    if (s.isLive) {\n      sendLiveStarted(programId, bot, db);\n    }"
);

// 3. Modify moveItem
code = code.replace(
    "s = await updateProgramState(programId, { items: s.items });\n      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });",
    "s = await updateProgramState(programId, { items: s.items });\n      if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);\n      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });"
);

// 4. Modify updateProgramSettings
code = code.replace(
    "s = await updateProgramState(programId, { title: s.title });\n    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });",
    "s = await updateProgramState(programId, { title: s.title });\n    if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);\n    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });"
);

// 5. Modify updateItem
code = code.replace(
    "s = await updateProgramState(programId, { items: s.items });\n    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });",
    "s = await updateProgramState(programId, { items: s.items });\n    if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);\n    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });"
);

// 6. Modify deleteItem
code = code.replace(
    "s = await updateProgramState(programId, { items: s.items, activeItemId: s.activeItemId, liveStartTime: s.liveStartTime });\n      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });",
    "s = await updateProgramState(programId, { items: s.items, activeItemId: s.activeItemId, liveStartTime: s.liveStartTime });\n      if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);\n      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });"
);

// 7. Modify addItem
code = code.replace(
    "s = await updateProgramState(programId, { items: s.items });\n    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });",
    "s = await updateProgramState(programId, { items: s.items });\n    if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);\n    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });"
);

// 8. Replace manual notify logic with call to triggerProgramChangeNotification
const notifyHandlerRegex = /app\.post\('\/notify\/:programId', express\.json\(\), async \(req, res\) => \{[\s\S]*?\}\);/g;
const newNotifyHandler = `app.post('/notify/:programId', express.json(), async (req, res) => {
  const { programId } = req.params;
  const { initData } = req.body;
  
  let user = null;
  if (initData) {
    try {
      const q = new URLSearchParams(initData);
      const hash = q.get('hash');
      if (hash) {
        q.delete('hash');
        const keys = Array.from(q.keys()).sort();
        const dataCheckString = keys.map(k => k + '=' + q.get(k)).join('\\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash === hash) {
          const userStr = q.get('user');
          if (userStr) user = JSON.parse(userStr);
        }
      }
    } catch(e) { }
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

    await triggerProgramChangeNotification(programId, bot, db);
    res.json({ ok: true, sent: 1 });
  } catch (err) {
    console.error("Notify error:", err);
    res.status(500).json({ error: err.message });
  }
});`;

code = code.replace(notifyHandlerRegex, newNotifyHandler);

fs.writeFileSync('server.js', code);
console.log("Patched server.js notifications.");
