const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const oldShare = /els\.btnShare\.onclick = \(\) => \{[\s\S]*?\n\};/;
const newShare = `els.btnShare.onclick = () => {
  if (!programId) return;

  if (tg && tg.switchInlineQuery) {
    tg.switchInlineQuery(String(programId), ['users', 'groups', 'channels']);
  } else {
    console.error('Telegram WebApp switchInlineQuery is not available');
    if (tg && tg.showAlert) tg.showAlert('Ця функція не підтримується на вашому пристрої. Оновіть Telegram.');
  }
};`;

code = code.replace(oldShare, newShare);
fs.writeFileSync('public/app.js', code);
console.log("Patched app.js with strict switchInlineQuery.");
