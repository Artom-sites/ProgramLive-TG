const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Fix inline query
const oldInline = `          input_message_content: {
            message_text: \`🗓 <b>\${title}</b>\\n\\nНатисніть кнопку нижче, щоб відкрити розклад:\`,
            parse_mode: 'HTML'
          },
          reply_markup: {
            inline_keyboard: [[
              { text: "📱 Відкрити програму", web_app: { url: \`https://programlive-tg.onrender.com/?id=\${p.id}\` } }
            ]]
          }`;

const newInline = `          input_message_content: {
            message_text: \`🎼 <b>\${title}</b>\\nСлідкуйте за програмою в реальному часі.\`,
            parse_mode: 'HTML'
          },
          reply_markup: {
            inline_keyboard: [[
              { text: "📱 Відкрити програму", url: \`https://t.me/ProgramLive_bot/app?startapp=\${p.id}\` }
            ]]
          }`;
code = code.replace(oldInline, newInline);

// 2. Fix /link command FieldValue
code = code.replace(
  "require('firebase-admin').firestore.FieldValue.arrayUnion(ctx.chat.id)",
  "require('firebase-admin/firestore').FieldValue.arrayUnion(ctx.chat.id)"
);

// 3. Fix /notify security and button
const notifyRegex = /app\.post\('\/notify\/:programId', async \(req, res\) => \{[\s\S]*?res\.status\(500\)\.json\(\{ error: err\.message \}\);\n  \}\n\}\);/;
const newNotify = `app.post('/notify/:programId', express.json(), async (req, res) => {
  const { programId } = req.params;
  const { initData } = req.body;
  
  const user = validateWebAppData(initData, BOT_TOKEN);
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

    for (const chatId of linkedChats) {
      try {
        await bot.telegram.sendMessage(chatId, \`🔔 <b>Увага!</b>\\n\\nУ розкладі <b>«\${title}»</b> щойно відбулися зміни.\\nБудь ласка, відкрийте програму, щоб переглянути актуальну версію!\`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: "📱 Відкрити оновлений розклад", url: \`https://t.me/ProgramLive_bot/app?startapp=\${programId}\` }
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
});`;
code = code.replace(notifyRegex, newNotify);

fs.writeFileSync('server.js', code);
console.log("Patched server.js inline query and notify.");
