const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');

const debounceTimers = new Map();

async function verifyBotCanMessage(bot, userId) {
  try {
    await bot.telegram.sendChatAction(userId, 'typing');
    return true;
  } catch(e) {
    return false;
  }
}

async function sendLiveStarted(programId, bot, db) {
  const doc = await db.collection('programs').doc(programId).get();
  if (!doc.exists) return;
  const data = doc.data();
  const title = data.state?.title || `Програма ${programId}`;

  const groups = data.linkedChats || [];
  const users = data.privateSubscribers || [];

  // Broadcast to groups
  for (const chatId of groups) {
    try {
      await bot.telegram.sendMessage(chatId, `🔴 <b>Програма розпочалася!</b>\n\n<b>«${title}»</b> зараз у прямому ефірі.\nПриєднуйтесь, щоб слідкувати за ходом програми!`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити програму", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}` } ]] }
      });
    } catch(e) {
      console.error(`Group start live notify error: ${e.message}`);
      if (e.message.includes('bot was kicked') || e.message.includes('chat not found')) {
        await db.collection('programs').doc(programId).update({ linkedChats: FieldValue.arrayRemove(chatId) });
      }
    }
  }

  // Broadcast to private users
  const notifyTokensToSave = {};
  for (const userId of users) {
    try {
      const token = crypto.randomBytes(6).toString('hex');
      const msg = await bot.telegram.sendMessage(userId, `🔴 <b>Програма розпочалася!</b>\n\n<b>«${title}»</b> зараз у прямому ефірі.\nПриєднуйтесь, щоб слідкувати за ходом програми!`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити програму", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}_${token}` } ]] }
      });
      notifyTokensToSave[`notifyTokens.${token}`] = { chatId: userId, messageId: msg.message_id, createdAt: Date.now() };
    } catch (e) {
      console.error(`Private start live notify error: ${e.message}`);
      if (e.message.includes('bot was blocked') || e.message.includes('chat not found') || e.message.includes("bot can't initiate")) {
        await db.collection('programs').doc(programId).update({ privateSubscribers: FieldValue.arrayRemove(userId) });
      }
    }
  }
  
  if (Object.keys(notifyTokensToSave).length > 0) {
    await db.collection('programs').doc(programId).update(notifyTokensToSave);
  }
}

function scheduleProgramChangeNotification(programId, bot, db) {
  if (debounceTimers.has(programId)) {
    clearTimeout(debounceTimers.get(programId));
  }
  debounceTimers.set(programId, setTimeout(() => {
    triggerProgramChangeNotification(programId, bot, db);
    debounceTimers.delete(programId);
  }, 20000));
}

async function triggerProgramChangeNotification(programId, bot, db) {
  const doc = await db.collection('programs').doc(programId).get();
  if (!doc.exists) return;
  const data = doc.data();
  const title = data.state?.title || `Програма ${programId}`;

  const groups = data.linkedChats || [];
  const users = data.privateSubscribers || [];

  const activeGroupNotifications = data.activeGroupNotifications || {};
  const activePrivateNotifications = data.activePrivateNotifications || {};

  const newActiveGroupNotifications = {};
  const newActivePrivateNotifications = {};
  const notifyTokensToSave = {};

  // Group Notifications
  for (const chatId of groups) {
    if (activeGroupNotifications[chatId]) {
       try { await bot.telegram.deleteMessage(chatId, activeGroupNotifications[chatId]); } catch(e) {}
    }
    try {
      const msg = await bot.telegram.sendMessage(chatId, `🔔 <b>У програмі відбулися зміни</b>\n\n<b>«${title}»</b>\nВідкрийте актуальну версію програми.`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити оновлений розклад", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}` } ]] }
      });
      newActiveGroupNotifications[chatId] = msg.message_id;
    } catch(e) {
      if (e.message.includes('bot was kicked') || e.message.includes('chat not found')) {
        await db.collection('programs').doc(programId).update({ linkedChats: FieldValue.arrayRemove(chatId) });
      }
    }
  }

  // Private Notifications
  for (const userId of users) {
    if (activePrivateNotifications[userId]) {
       try {
         await bot.telegram.deleteMessage(userId, activePrivateNotifications[userId].messageId);
         notifyTokensToSave[`notifyTokens.${activePrivateNotifications[userId].token}`] = FieldValue.delete();
       } catch(e) {}
    }
    try {
      const token = crypto.randomBytes(6).toString('hex');
      const msg = await bot.telegram.sendMessage(userId, `🔔 <b>У програмі відбулися зміни</b>\n\n<b>«${title}»</b>\nВідкрийте актуальну версію програми.`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити оновлений розклад", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}_${token}` } ]] }
      });
      notifyTokensToSave[`notifyTokens.${token}`] = { chatId: userId, messageId: msg.message_id, createdAt: Date.now() };
      newActivePrivateNotifications[userId] = { messageId: msg.message_id, token };
    } catch (e) {
      if (e.message.includes('bot was blocked') || e.message.includes('chat not found') || e.message.includes("bot can't initiate")) {
        await db.collection('programs').doc(programId).update({ privateSubscribers: FieldValue.arrayRemove(userId) });
      }
    }
  }

  const updates = {};
  if (Object.keys(newActiveGroupNotifications).length > 0 || Object.keys(activeGroupNotifications).length > 0) {
      updates.activeGroupNotifications = newActiveGroupNotifications;
  }
  if (Object.keys(newActivePrivateNotifications).length > 0 || Object.keys(activePrivateNotifications).length > 0) {
      updates.activePrivateNotifications = newActivePrivateNotifications;
  }
  Object.assign(updates, notifyTokensToSave);

  if (Object.keys(updates).length > 0) {
     await db.collection('programs').doc(programId).update(updates);
  }
}

module.exports = {
  verifyBotCanMessage,
  sendLiveStarted,
  scheduleProgramChangeNotification,
  triggerProgramChangeNotification
};
