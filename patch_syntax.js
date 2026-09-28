const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldBlock = `    if (Object.keys(notificationsToSave).length > 0) {
      await db.collection('programs').doc(programId).update({
        activeNotifications: notificationsToSave
      });
    } catch (e) {
        console.error("Failed to notify chat", chatId, e.message);
        if (e.message.includes("bot was kicked") || e.message.includes("chat not found")) {
          await db.collection('programs').doc(programId).update({
            linkedChats: require('firebase-admin/firestore').FieldValue.arrayRemove(chatId)
          });
        }
      }
    }`;

const newBlock = `    if (Object.keys(notificationsToSave).length > 0) {
      await db.collection('programs').doc(programId).update({
        activeNotifications: notificationsToSave
      });
    }`;

code = code.replace(oldBlock, newBlock);
fs.writeFileSync('server.js', code);
console.log("Patched syntax error.");
