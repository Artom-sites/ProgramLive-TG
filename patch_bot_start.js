const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldBotStart = /bot\.start\(async \(ctx\) => \{[\s\S]*?\}\);/;

const newBotStart = `bot.start(async (ctx) => {
  if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
    const payload = ctx.payload;
    if (payload) {
      try {
        const doc = await db.collection('programs').doc(payload).get();
        if (!doc.exists) {
          return ctx.reply("❌ Програму не знайдено.");
        }
        const data = doc.data();
        const userId = ctx.from.id;
        if (!data.admins.includes(userId)) {
          return ctx.reply("❌ У вас немає прав адміністратора для цієї програми.");
        }
        
        await db.collection('programs').doc(payload).update({
          linkedChats: require('firebase-admin/firestore').FieldValue.arrayUnion(ctx.chat.id),
          [\`linkedChatsMeta.\${ctx.chat.id}\`]: ctx.chat.title || 'Група'
        });
        
        return ctx.reply(\`✅ Групу успішно прив'язано до розкладу <b>\${data.state?.title || payload}</b>!\\nТепер сюди автоматично надходитимуть сповіщення під час Live-режиму.\`, { parse_mode: 'HTML' });
      } catch (e) {
        console.error("Link error via startgroup:", e);
        return ctx.reply("❌ Помилка прив'язки.");
      }
    }
    return;
  }

  const mainMenu = {
    keyboard: [
      [{ text: "📂 Мої програми" }, { text: "➕ Створити програму" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
  await ctx.reply("👋 Вітаємо! Скористайтеся меню нижче:", { reply_markup: mainMenu }).catch(console.error);
});`;

code = code.replace(oldBotStart, newBotStart);

// Update init emit to send link data
const oldInit = "const isSubscribed = (data.privateSubscribers || []).includes(userId);\n  socket.emit('init', { state: data.state, isAdmin, isSubscribed, serverTime: Date.now() });";
const newInit = `const isSubscribed = (data.privateSubscribers || []).includes(userId);
  const linkedChats = data.linkedChats || [];
  const linkedChatsMeta = data.linkedChatsMeta || {};
  const privateSubscribersCount = (data.privateSubscribers || []).length;
  socket.emit('init', { 
    state: data.state, 
    isAdmin, 
    isSubscribed,
    linkedChats,
    linkedChatsMeta,
    privateSubscribersCount,
    serverTime: Date.now() 
  });`;
code = code.replace(oldInit, newInit);

fs.writeFileSync('server.js', code);
console.log("Patched bot.start and init.");
