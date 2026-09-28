const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldCode = `      await ctx.reply(\`✅ Програму «\${newState.title}» успішно створено!\`).catch(()=>null);
      await sendDashboard(ctx, 0, 'view', false);`;

const newCode = `      await ctx.reply(\`✅ Програму «\${newState.title}» успішно створено!\\nНатисніть кнопку нижче, щоб додати пункти розкладу.\`, {
        reply_markup: {
          inline_keyboard: [[
            { text: "📱 Відкрити програму", web_app: { url: \`https://programlive-tg.onrender.com/?id=\${newId}\` } }
          ]]
        }
      }).catch(()=>null);`;

code = code.replace(oldCode, newCode);
fs.writeFileSync('server.js', code);
console.log("Patched server.js for creation flow.");
