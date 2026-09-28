const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const botStartCheck = `const userId = ctx.from.id;
        if (!data.admins.includes(userId)) {
          return ctx.reply("❌ У вас немає прав адміністратора для цієї програми.");
        }`;
        
const botStartCheckNew = `const userId = ctx.from.id;
        if (!data.admins.includes(userId)) {
          return ctx.reply("❌ У вас немає прав адміністратора для цієї програми.");
        }
        
        try {
          const member = await ctx.getChatMember(userId);
          if (member.status !== 'administrator' && member.status !== 'creator') {
            return ctx.reply("❌ Ви повинні бути адміністратором цієї групи, щоб прив'язати її.");
          }
        } catch(e) {
          console.error("Group admin check failed:", e);
        }`;

code = code.replace(botStartCheck, botStartCheckNew);

const botLinkCheck = `const data = doc.data();
      if (!data.admins.includes(ctx.from.id)) {
        return ctx.reply("❌ Тільки адміністратор програми може прив'язувати її до груп.");
      }`;

const botLinkCheckNew = `const data = doc.data();
      if (!data.admins.includes(ctx.from.id)) {
        return ctx.reply("❌ Тільки адміністратор програми може прив'язувати її до груп.");
      }
      
      try {
        const member = await ctx.getChatMember(ctx.from.id);
        if (member.status !== 'administrator' && member.status !== 'creator') {
          return ctx.reply("❌ Ви повинні бути адміністратором цієї групи, щоб прив'язати її.");
        }
      } catch(e) {
        console.error("Group admin check failed:", e);
      }`;

code = code.replace(botLinkCheck, botLinkCheckNew);

fs.writeFileSync('server.js', code);
console.log("Patched admin checks.");
