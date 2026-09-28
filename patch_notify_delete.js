const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// 1. Update /notify/:programId
const oldNotifyBody = /for \(const chatId of linkedChats\) \{[\s\S]*?successCount\+\+;[\s\S]*?\}/;
const newNotifyBody = `const notificationsToSave = {};
    for (const chatId of linkedChats) {
      try {
        const msg = await bot.telegram.sendMessage(chatId, \`🔔 <b>Увага!</b>\\n\\nУ розкладі <b>«\${title}»</b> щойно відбулися зміни.\\nБудь ласка, відкрийте програму, щоб переглянути актуальну версію!\`, {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              { text: "📱 Відкрити оновлений розклад", url: \`https://t.me/ProgramLive_bot/app?startapp=\${programId}\` }
            ]]
          }
        });
        notificationsToSave[chatId] = msg.message_id;
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
    
    if (Object.keys(notificationsToSave).length > 0) {
      await db.collection('programs').doc(programId).update({
        activeNotifications: notificationsToSave
      });
    }`;

code = code.replace(oldNotifyBody, newNotifyBody);

// 2. Update socket.on('connection') to auto-delete
const oldInitEmit = "socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now() });";
const newInitEmit = `// --- Auto-delete notifications ---
  if (data.activeNotifications && Object.keys(data.activeNotifications).length > 0) {
    if (bot) {
      for (const [chatId, msgId] of Object.entries(data.activeNotifications)) {
        try {
          await bot.telegram.deleteMessage(chatId, msgId);
        } catch (e) {
          console.error(\`Failed to auto-delete notification in \${chatId}:\`, e.message);
        }
      }
    }
    await db.collection('programs').doc(programId).update({ activeNotifications: require('firebase-admin/firestore').FieldValue.delete() });
  }
  
  socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now() });`;

code = code.replace(oldInitEmit, newInitEmit);

fs.writeFileSync('server.js', code);
console.log("Patched auto-delete notifications.");
