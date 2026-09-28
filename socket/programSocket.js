const { validateTelegramInitData } = require('../services/telegramAuth');
const { getProgramData, updateProgramState, getUserPrograms, generateId } = require('../programs/programService');
const { verifyBotCanMessage, sendLiveStarted, scheduleProgramChangeNotification } = require('../services/notifications');
const crypto = require('crypto');

function setupSockets(io, bot, db, BOT_TOKEN) {
io.on('connection', async (socket) => {
  const auth = socket.handshake.auth || {};
  const query = socket.handshake.query || {};
  const rawProgramId = auth.programId || query.programId;
  const programId = (rawProgramId && rawProgramId !== 'null' && rawProgramId !== 'undefined') ? rawProgramId : null;
  const initData = auth.initData || '';
  
  // --- SERVER-SIDE DEBUG LOGGING ---
  console.log(`[Auth Debug] New connection for programId: ${programId || 'HOME_MODE'}`);
  
  let userId = null;
  const parsedUser = validateTelegramInitData(initData, BOT_TOKEN, true);
  if (parsedUser) {
    userId = parsedUser.id;
    socket.data.firstName = parsedUser.first_name || 'Користувач';
  }
  // ---------------------------------
  socket.data.userId = userId;
  
  if (!programId) {
    // HOME MODE
    socket.on('getMyPrograms', async (callback) => {
      try {
        const programs = await getUserPrograms(userId);
        callback({ success: true, programs });
      } catch(e) {
        callback({ success: false, error: e.message });
      }
    });
    
    socket.on('createNewProgram', async (title, callback) => {
      try {
        if (!userId) return callback({ success: false, error: "Unauthorized" });
        const { createProgram } = require('../programs/programService');
        const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
        await createProgram(newId, userId, title);
        callback({ success: true, programId: newId });
      } catch(e) {
        callback({ success: false, error: e.message });
      }
    });
    return;
  }

  let data = await getProgramData(programId);
  if (!data) {
    socket.emit('programError', 'PROGRAM_NOT_FOUND');
    return;
  }
  
  socket.join(programId);
  const isAdmin = userId !== null && (data.admins.includes(userId) || data.admins.length === 0);
  console.log(`[Auth Debug] Final isAdmin status: ${isAdmin}\n`);
  
  // --- Auto-delete specific notification if token is provided ---
  const notifyToken = auth.notifyToken || '';
  if (notifyToken && data.notifyTokens && data.notifyTokens[notifyToken]) {
    if (bot) {
      const { chatId, messageId } = data.notifyTokens[notifyToken];
      if (chatId == userId) {
        try {
        await bot.telegram.deleteMessage(chatId, messageId);
      } catch (e) {
        console.error(`Failed to delete notification ${messageId} in ${chatId}:`, e.message);
        }
      }
    }
    try {
      await db.collection('programs').doc(programId).update({
        [`notifyTokens.${notifyToken}`]: require('firebase-admin/firestore').FieldValue.delete()
      });
    } catch (err) {
      console.error("Error removing notifyToken from DB:", err);
    }
  }
  
  const isSubscribed = (data.privateSubscribers || []).includes(userId);
  const linkedChats = data.linkedChats || [];
  const linkedChatsMeta = data.linkedChatsMeta || {};
  const privateSubscribersCount = (data.privateSubscribers || []).length;
  socket.emit('init', { 
    state: data.state, 
    isAdmin, 
    isSubscribed,
    linkedChats,
    linkedChatsMeta,
    privateSubscribers: data.privateSubscribers || [],
    privateSubscribersMeta: data.privateSubscribersMeta || {},
    serverTime: Date.now() 
  });
  
  socket.on('toggleSubscription', async (callback) => {
    const uid = socket.data.userId;
    const firstName = socket.data.firstName || 'Користувач';
    if (!uid) return callback({error: "Unauthorized"});

    let pData = await getProgramData(programId); if(!pData) return;
    let subs = pData.privateSubscribers || [];
    let isSubbed = subs.includes(uid);

    console.log(`[Subscription Debug]\nprogramId: ${programId}\nuserId: ${uid}\nbefore: ${isSubbed ? 'subscribed' : 'unsubscribed'}`);

    const { FieldValue } = require('firebase-admin/firestore');

    if (isSubbed) {
      await db.collection('programs').doc(programId).update({ 
        privateSubscribers: FieldValue.arrayRemove(uid),
        [`privateSubscribersMeta.${uid}`]: FieldValue.delete()
      });
      console.log(`[Subscription Debug] after: unsubscribed`);
      
      const afterDocUnsub = await db.collection('programs').doc(programId).get();
      io.to(programId).emit('recipientsUpdate', {
         linkedChats: afterDocUnsub.data().linkedChats || [],
         linkedChatsMeta: afterDocUnsub.data().linkedChatsMeta || {},
         privateSubscribers: afterDocUnsub.data().privateSubscribers || [],
         privateSubscribersMeta: afterDocUnsub.data().privateSubscribersMeta || {}
      });
      callback({ subscribed: false });

    } else {
      const canMsg = await verifyBotCanMessage(bot, uid);
      if (!canMsg) return callback({ error: "BOT_BLOCKED" });
      await db.collection('programs').doc(programId).update({ 
        privateSubscribers: FieldValue.arrayUnion(uid),
        [`privateSubscribersMeta.${uid}`]: firstName
      });
      
      const afterDoc = await db.collection('programs').doc(programId).get();
      console.log(`[Subscription Debug] after: subscribed (total count: ${(afterDoc.data().privateSubscribers || []).length})`);
      
      io.to(programId).emit('recipientsUpdate', {
         linkedChats: afterDoc.data().linkedChats || [],
         linkedChatsMeta: afterDoc.data().linkedChatsMeta || {},
         privateSubscribers: afterDoc.data().privateSubscribers || [],
         privateSubscribersMeta: afterDoc.data().privateSubscribersMeta || {}
      });
      callback({ subscribed: true });
    }
  });

  socket.on('toggleLive', async (tz) => {
    if (!isAdmin) return;
    let pData = await getProgramData(programId); if(!pData) return; if(!pData) return; let s = pData.state;
    s.isLive = !s.isLive;
    s.liveStartTime = s.isLive ? Date.now() : null;
    
    if (s.isLive) {
      s.adminTimeZone = tz || 'Europe/Kyiv';
    }
    
    if (s.isLive && (!s.activeItemId || !s.items.some(i => i.id === s.activeItemId)) && s.items.length > 0) {
      s.activeItemId = s.items[0].id;
    }
    
    s = await updateProgramState(programId, { 
      isLive: s.isLive, 
      liveStartTime: s.liveStartTime, 
      activeItemId: s.activeItemId,
      adminTimeZone: s.adminTimeZone
    });
    if (s.isLive) {
      sendLiveStarted(programId, bot, db);
    }
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('setActiveItem', async (itemId) => {
    if (!isAdmin) return;
    let pData = await getProgramData(programId); if(!pData) return; if(!pData) return; let s = pData.state;
    if (s.activeItemId === itemId) return;
    
    if (!s.items.some(item => item.id === itemId)) return;
    
    s.activeItemId = itemId;
    if (s.isLive) {
      s.liveStartTime = Date.now();
    }
    
    s = await updateProgramState(programId, { 
      activeItemId: s.activeItemId, 
      liveStartTime: s.liveStartTime 
    });
    
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('resetProgramSchedule', async () => {
    if (!isAdmin) return;
    let pData = await getProgramData(programId); if(!pData) return;
    if (pData.state.isLive) return; // double check server side
    
    pData.state.items = [];
    pData.state.activeItemId = null;
    pData.state.isLive = false;
    pData.state.liveStartTime = null;
    
    await updateProgramState(programId, {
      items: [],
      activeItemId: null,
      isLive: false,
      liveStartTime: null
    });
    
    const { FieldValue } = require('firebase-admin/firestore');
    await db.collection('programs').doc(programId).update({
       activeGroupNotifications: FieldValue.delete(),
       activePrivateNotifications: FieldValue.delete(),
       notifyTokens: FieldValue.delete()
    });
    
    console.log(`[Reset Debug] Program ${programId} reset for new cycle. Recipients kept.`);
    io.to(programId).emit('stateUpdate', { ...pData.state, serverTime: Date.now() });
  });

  socket.on('reorderItem', async ({ fromIndex, toIndex }) => {
    if (!isAdmin) return;
    let pData = await getProgramData(programId); if(!pData) return; if(!pData) return; let s = pData.state;
    
    if (fromIndex >= 0 && fromIndex < s.items.length && toIndex >= 0 && toIndex < s.items.length) {
      const item = s.items.splice(fromIndex, 1)[0];
      s.items.splice(toIndex, 0, item);
      
      s = await updateProgramState(programId, { items: s.items });
      
      console.log(`[Notify Debug] reorder received\nprogramId: ${programId}\nisAdmin: ${isAdmin}\nisLive: ${s.isLive}\nitems changed: true`);
      
      if (s.isLive) {
        scheduleProgramChangeNotification(programId, bot, db);
      }
      
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('updateProgramSettings', async (newSettings) => {
    if (!isAdmin) return;
    let pData = await getProgramData(programId); if(!pData) return; if(!pData) return; let s = pData.state;
    s.title = newSettings.title;
    s = await updateProgramState(programId, { title: s.title });
    if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('updateItem', async ({ index, updatedData }) => {
    if (!isAdmin) return;
    let pData = await getProgramData(programId); if(!pData) return; if(!pData) return; let s = pData.state;
    if (s.items[index]) {
      s.items[index] = {
        ...s.items[index],
        type: updatedData.type || s.items[index].type || 'standard',
        title: updatedData.title,
        duration: updatedData.duration,
        assignee: updatedData.assignee,
        cues: { ...s.items[index].cues, sound: updatedData.sound, media: updatedData.media },
        content: { ...(s.items[index].content || {}), chords: updatedData.chords }, attachments: updatedData.attachments || s.items[index].attachments || []
      };
      s = await updateProgramState(programId, { items: s.items });
      if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('deleteItem', async (index) => {
    if (!isAdmin) return;
    let pData = await getProgramData(programId); if(!pData) return; if(!pData) return; let s = pData.state;
    if (index >= 0 && index < s.items.length) {
      const deletedItem = s.items[index];
      s.items.splice(index, 1);
      
      let newActiveId = s.activeItemId;
      if (s.activeItemId === deletedItem.id) {
        if (s.items[index]) {
          newActiveId = s.items[index].id;
        } else if (s.items[index - 1]) {
          newActiveId = s.items[index - 1].id;
        } else {
          newActiveId = null;
        }
      }
      s = await updateProgramState(programId, { items: s.items, activeItemId: newActiveId });
      if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('addItem', async (itemData) => {
    if (!isAdmin) return;
    const crypto = require('crypto');
    const newItem = { id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36), attachments: itemData.attachments || [], ...itemData };
    let pData = await getProgramData(programId); if(!pData) return; if(!pData) return; let s = pData.state;
    s.items.push(newItem);
    s = await updateProgramState(programId, { items: s.items });
    if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });
  socket.on('unlinkGroup', async (chatId) => {
    if (!isAdmin) return;
    const { FieldValue } = require('firebase-admin/firestore');
    await db.collection('programs').doc(programId).update({
      linkedChats: FieldValue.arrayRemove(chatId),
      [`linkedChatsMeta.${chatId}`]: FieldValue.delete()
    });
  });

  socket.on('unlinkPrivate', async (uid) => {
    if (!isAdmin) return;
    const { FieldValue } = require('firebase-admin/firestore');
    await db.collection('programs').doc(programId).update({
      privateSubscribers: FieldValue.arrayRemove(uid),
      [`privateSubscribersMeta.${uid}`]: FieldValue.delete()
    });
  });
});

}

module.exports = { setupSockets };
