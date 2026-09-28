const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldCode = `  socket.on('setActiveItem', async (itemId) => {`;

const newCode = `  socket.on('toggleSubscription', async (callback) => {
    const uid = socket.data.userId;
    if (!uid) return callback({error: "Unauthorized"});

    let pData = await getProgramData(programId);
    let subs = pData.privateSubscribers || [];
    let isSubbed = subs.includes(uid);

    if (isSubbed) {
      await db.collection('programs').doc(programId).update({ privateSubscribers: require('firebase-admin/firestore').FieldValue.arrayRemove(uid) });
      callback({ subscribed: false });
    } else {
      const canMsg = await verifyBotCanMessage(bot, uid);
      if (!canMsg) return callback({ error: "BOT_BLOCKED" });
      await db.collection('programs').doc(programId).update({ privateSubscribers: require('firebase-admin/firestore').FieldValue.arrayUnion(uid) });
      callback({ subscribed: true });
    }
  });

  socket.on('setActiveItem', async (itemId) => {`;

code = code.replace(oldCode, newCode);

// Add isSubscribed to emit init
const oldInit = `socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now() });`;
const newInit = `const isSubscribed = (data.privateSubscribers || []).includes(userId);
  socket.emit('init', { state: data.state, isAdmin, isSubscribed, serverTime: Date.now() });`;
code = code.replace(oldInit, newInit);

fs.writeFileSync('server.js', code);
console.log("Patched toggleSubscription.");
