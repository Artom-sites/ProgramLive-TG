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
  const { FieldValue } = require('firebase-admin/firestore');
  const doc = await db.collection('programs').doc(programId).get();
  if (!doc.exists) return;
  const data = doc.data();
  const title = data.state?.title || `Програма ${programId}`;

  const groups = data.linkedChats || [];
  const users = data.privateSubscribers || [];

  const newActiveGroupNotifications = {};
  const newActivePrivateNotifications = {};
  const notifyTokensToSave = {};

  const tz = data.state?.adminTimeZone || 'Europe/Kyiv';
  const timeStr = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const text = `🔴 <b>Програма розпочалася!</b>\n\n<b>«${title}»</b> зараз у прямому ефірі.\nПриєднуйтесь, щоб слідкувати за ходом програми!\n\n<i>Оновлено: ${timeStr}</i>`;

  // Broadcast to groups
  for (const chatId of groups) {
    try {
      const msg = await bot.telegram.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити програму", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}` } ]] }
      });
      newActiveGroupNotifications[chatId] = msg.message_id;
      console.log(`[Notify Debug] group notification sent successfully\nprogramId: ${programId}\nchatId: ${chatId}\nmessageId: ${msg.message_id}`);
    } catch(e) {
      console.error(`[Notify Debug] group notification send failed\nprogramId: ${programId}\nchatId: ${chatId}\ntelegramErrorCode: ${e.code || 'unknown'}\ndescription: ${e.description || e.message}`);
      if (e.message.includes('bot was kicked') || e.message.includes('chat not found')) {
        await db.collection('programs').doc(programId).update({ linkedChats: FieldValue.arrayRemove(chatId) });
      }
    }
  }

  // Broadcast to private users
  for (const userId of users) {
    try {
      const token = require('crypto').randomBytes(6).toString('hex');
      const msg = await bot.telegram.sendMessage(userId, text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити програму", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}_${token}` } ]] }
      });
      notifyTokensToSave[`notifyTokens.${token}`] = { chatId: userId, messageId: msg.message_id, createdAt: Date.now() };
      newActivePrivateNotifications[userId] = { messageId: msg.message_id, token };
    } catch (e) {
      console.error(`[Notify Debug] private notification send failed\nprogramId: ${programId}\nchatId: ${userId}\ntelegramErrorCode: ${e.code || 'unknown'}\ndescription: ${e.description || e.message}`);
      if (e.message.includes('bot was blocked') || e.message.includes('chat not found') || e.message.includes("bot can't initiate")) {
        await db.collection('programs').doc(programId).update({ privateSubscribers: FieldValue.arrayRemove(userId) });
      }
    }
  }
  
  const updates = {};
  if (Object.keys(newActiveGroupNotifications).length > 0) updates.activeGroupNotifications = newActiveGroupNotifications;
  if (Object.keys(newActivePrivateNotifications).length > 0) updates.activePrivateNotifications = newActivePrivateNotifications;
  Object.assign(updates, notifyTokensToSave);

  if (Object.keys(updates).length > 0) {
    await db.collection('programs').doc(programId).update(updates);
  }
}

function scheduleProgramChangeNotification(programId, bot, db) {
  console.log(`[Notify Debug] scheduling program change notification\nprogramId: ${programId}`);
  if (debounceTimers.has(programId)) {
    console.log('[Notify Debug] debounce reset');
    clearTimeout(debounceTimers.get(programId));
  }
  debounceTimers.set(programId, setTimeout(async () => {
    try {
      await triggerProgramChangeNotification(programId, bot, db);
    } catch (err) {
      console.error('[Notify Debug] trigger failed:', err);
    }
    debounceTimers.delete(programId);
  }, 20000));
  console.log(`[Notify Debug] debounce scheduled\nprogramId: ${programId}\ndelay: 20000`);
}

async function triggerProgramChangeNotification(programId, bot, db) {
  const doc = await db.collection('programs').doc(programId).get();
  if (!doc.exists) return;
  const data = doc.data();
  const title = data.state?.title || `Програма ${programId}`;

  const groups = data.linkedChats || [];
  const users = data.privateSubscribers || [];
  
  console.log(`[Notify Debug] trigger fired\nprogramId: ${programId}\ngroups: ${groups.length}\nprivateSubscribers: ${users.length}`);

  const activeGroupNotifications = data.activeGroupNotifications || {};
  const activePrivateNotifications = data.activePrivateNotifications || {};

  const newActiveGroupNotifications = {};
  const newActivePrivateNotifications = {};
  const notifyTokensToSave = {};

  // Group Notifications
  const tz = data.state?.adminTimeZone || 'Europe/Kyiv';
  const timeStr = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const text = `🔔 <b>У програмі відбулися зміни</b>\n\n<b>«${title}»</b>\nВідкрийте актуальну версію програми.\n\n<i>Оновлено: ${timeStr}</i>`;

  for (const chatId of groups) {
    let oldMsgId = activeGroupNotifications[chatId];
    let msgIdToSave = null;
    let success = false;
    
    if (oldMsgId) {
      try {
        console.log(`[Notify Debug] editing existing group notification\nprogramId: ${programId}\nchatId: ${chatId}\nmessageId: ${oldMsgId}`);
        await bot.telegram.editMessageText(chatId, oldMsgId, undefined, text, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити оновлений розклад", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}` } ]] }
        });
        console.log(`[Notify Debug] group notification updated successfully\nprogramId: ${programId}\nchatId: ${chatId}\nmessageId: ${oldMsgId}`);
        msgIdToSave = oldMsgId;
        success = true;
      } catch (e) {
        console.error(`[Notify Debug] group notification edit failed\nchatId: ${chatId}\nmessageId: ${oldMsgId}\nerror: ${e.description || e.message}`);
      }
    }
    
    if (!success) {
      try {
        console.log(`[Notify Debug] sending new group notification\nprogramId: ${programId}\nchatId: ${chatId}`);
        const msg = await bot.telegram.sendMessage(chatId, text, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити оновлений розклад", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}` } ]] }
        });
        console.log(`[Notify Debug] group notification sent successfully\nprogramId: ${programId}\nchatId: ${chatId}\nmessageId: ${msg.message_id}`);
        msgIdToSave = msg.message_id;
      } catch(e) {
        console.error(`[Notify Debug] group notification send failed\nprogramId: ${programId}\nchatId: ${chatId}\ntelegramErrorCode: ${e.code || 'unknown'}\ndescription: ${e.description || e.message}`);
        if (e.message.includes('bot was kicked') || e.message.includes('chat not found')) {
          await db.collection('programs').doc(programId).update({ linkedChats: FieldValue.arrayRemove(chatId) });
        }
      }
    }
    
    if (msgIdToSave) {
      newActiveGroupNotifications[chatId] = msgIdToSave;
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
      console.log(`[Notify Debug] sending private notification\nuserId: ${userId}`);
      const token = crypto.randomBytes(6).toString('hex');
      const msg = await bot.telegram.sendMessage(userId, `🔔 <b>У програмі відбулися зміни</b>\n\n<b>«${title}»</b>\nВідкрийте актуальну версію програми.`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[ { text: "📱 Відкрити оновлений розклад", url: `https://t.me/ProgramLive_bot/app?startapp=${programId}_${token}` } ]] }
      });
      notifyTokensToSave[`notifyTokens.${token}`] = { chatId: userId, messageId: msg.message_id, createdAt: Date.now() };
      newActivePrivateNotifications[userId] = { messageId: msg.message_id, token };
    } catch (e) {
      console.error(`[Notify Debug] Telegram send failed\nrecipientType: private\nrecipientId: ${userId}\nerror: ${e.message}`);
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
