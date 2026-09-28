const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldNotify = `    let successCount = 0;

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
        
        await db.collection('programs').doc(programId).update({
          [\`activeNotifications.\${chatId}\`]: msg.message_id
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
    }`;

const newNotify = `    let successCount = 0;
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
    }`;

code = code.replace(oldNotify, newNotify);
fs.writeFileSync('server.js', code);
console.log("Replaced notify loop.");
