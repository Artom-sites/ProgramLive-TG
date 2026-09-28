const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Patch the notify logic
const oldNotifyBlock = /const notificationsToSave = \{\};[\s\S]*?if \(Object\.keys\(notificationsToSave\)\.length > 0\) \{[\s\S]*?activeNotifications: notificationsToSave[\s\S]*?\}\n    \}/;

const newNotifyBlock = `const notifyTokensToSave = {};
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
    }`;

code = code.replace(oldNotifyBlock, newNotifyBlock);

// 2. Patch the auto-delete logic in socket connection
const oldAutoDeleteBlock = /  \/\/ --- Auto-delete notifications ---[\s\S]*?activeNotifications: require\('firebase-admin\/firestore'\)\.FieldValue\.delete\(\) \}\);\n  \}/;

const newAutoDeleteBlock = `  const notifyToken = auth.notifyToken || '';
  
  // --- Auto-delete specific notification if token is provided ---
  if (notifyToken && data.notifyTokens && data.notifyTokens[notifyToken]) {
    if (bot) {
      const { chatId, messageId } = data.notifyTokens[notifyToken];
      try {
        await bot.telegram.deleteMessage(chatId, messageId);
      } catch (e) {
        console.error(\`Failed to delete notification \${messageId} in \${chatId}:\`, e.message);
      }
    }
    try {
      await db.collection('programs').doc(programId).update({
        [\`notifyTokens.\${notifyToken}\`]: require('firebase-admin/firestore').FieldValue.delete()
      });
    } catch (err) {
      console.error("Error removing notifyToken from DB:", err);
    }
  }`;

code = code.replace(oldAutoDeleteBlock, newAutoDeleteBlock);

fs.writeFileSync('server.js', code);
console.log("Patched server.js auto-delete.");
