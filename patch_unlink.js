const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const unlinkCode = `
  socket.on('unlinkGroup', async (chatId) => {
    if (!isAdmin) return;
    try {
      await db.collection('programs').doc(programId).update({
        linkedChats: require('firebase-admin/firestore').FieldValue.arrayRemove(chatId),
        [\`linkedChatsMeta.\${chatId}\`]: require('firebase-admin/firestore').FieldValue.delete()
      });
      // push update so admin UI refreshes if needed, or they just refresh manually
    } catch(e) {}
  });

  socket.on('setActiveItem', async (itemId) => {`;

code = code.replace("  socket.on('setActiveItem', async (itemId) => {", unlinkCode);
fs.writeFileSync('server.js', code);
console.log("Patched unlink.");
