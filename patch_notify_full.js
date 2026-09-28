const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

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

    const linkedChats = data.linkedChats || [];
    if (linkedChats.length === 0) {
      return res.status(400).json({ error: "До цієї програми не прив'язано жодної групи. Спочатку додайте бота в групу і відправте команду /link " + programId });
    }

    const title = data.state?.title || \`Програма \${programId}\`;
    let successCount = 0;

    const notifyTokensToSave = {};
    for (const chatId of linkedChats) {
      try {
        const token = crypto.randomBytes(6).toString('hex');
        const msg = await bot.telegram.sendMessage(chatId, \`🔔 <b>Увага!</b>\\n\\nУ розкладі <b>«\${title}»</b> щойно відбулися зміни.\\nБудь ласка, відкрийте програму, щоб переглянути актуальну версію!\`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: "📱 Відкрити оновлений розклад", url: \`https://t.me/ProgramLive_bot/app?startapp=\${programId}_\${token}\` }
            ]]
          }
        });
        notifyTokensToSave[\`notifyTokens.\${token}\`] = { chatId, messageId: msg.message_id, createdAt: Date.now() };
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
    
    if (Object.keys(notifyTokensToSave).length > 0) {
      await db.collection('programs').doc(programId).update(notifyTokensToSave);
    }

    res.json({ ok: true, sent: successCount, total: linkedChats.length });
  } catch (err) {
    console.error("Notify error:", err);
    res.status(500).json({ error: err.message });
  }
});`;

code = code.replace(notifyHandlerRegex, newNotifyHandler);
fs.writeFileSync('server.js', code);
console.log("Restored full notify handler.");
