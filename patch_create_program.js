const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldCodeRegex = /bot\.hears\("➕ Створити програму", async \(ctx\) => \{[\s\S]*?await sendDashboard\(ctx, 0, 'view', false\);\n  \}\);/;

const newCode = `bot.hears("➕ Створити програму", async (ctx) => {
    await ctx.reply("Введіть назву для нової програми:", {
      reply_markup: {
        force_reply: true,
        input_field_placeholder: "Наприклад: Недільне служіння"
      }
    });
  });

  bot.on('text', async (ctx, next) => {
    // Якщо це звичайний текст, перевіряємо чи це відповідь на наш запит
    if (ctx.message?.reply_to_message?.text === "Введіть назву для нової програми:") {
      const programName = ctx.message.text.trim();
      const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const userId = ctx.from.id;
      
      const newState = JSON.parse(JSON.stringify(DEFAULT_STATE));
      newState.title = programName || "Нова програма";

      await db.collection('programs').doc(newId).set({
        ownerId: userId,
        admins: [userId],
        state: newState
      });
      
      await ctx.reply(\`✅ Програму «\${newState.title}» успішно створено!\`).catch(()=>null);
      await sendDashboard(ctx, 0, 'view', false);
    } else {
      return next();
    }
  });`;

code = code.replace(oldCodeRegex, newCode);
fs.writeFileSync('server.js', code);
console.log("Patched create program logic.");
