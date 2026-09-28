const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldInline = /bot\.on\('inline_query', async \(ctx\) => \{[\s\S]*?await ctx\.answerInlineQuery\(results, \{ cache_time: 0 \}\);\n    \} catch \(e\)/;
const newInline = `bot.on('inline_query', async (ctx) => {
    try {
      const userId = ctx.from.id;
      const query = ctx.inlineQuery.query.trim();
      const snapshot = await db.collection('programs').where('admins', 'array-contains', userId).get();
      
      let results = snapshot.docs.map(doc => {
        const p = { id: doc.id, ...doc.data() };
        const title = p.state?.title || \`Програма \${p.id}\`;
        return {
          type: 'article',
          id: p.id,
          title: title,
          description: 'Надіслати цей розклад у чат',
          input_message_content: {
            message_text: \`🎼 <b>\${title}</b>\\nСлідкуйте за програмою в реальному часі.\\n\\n<a href="https://t.me/ProgramLive_bot/app?startapp=\${p.id}">Відкрити програму</a>\`,
            parse_mode: 'HTML'
          },
          reply_markup: {
            inline_keyboard: [[
              { text: "📱 Відкрити програму", url: \`https://t.me/ProgramLive_bot/app?startapp=\${p.id}\` }
            ]]
          }
        };
      });

      if (query) {
        results = results.filter(r => r.id === query || r.title.toLowerCase().includes(query.toLowerCase()));
      }

      await ctx.answerInlineQuery(results, { cache_time: 0 });
    } catch (e)`;

code = code.replace(oldInline, newInline);
fs.writeFileSync('server.js', code);
console.log("Patched server.js inline query filter.");
