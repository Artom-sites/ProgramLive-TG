const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const oldShare = `els.btnShare.onclick = () => {
  const url = \`https://t.me/ProgramLive_bot/app?startapp=\${programId}\`;
  const text = state.title || "Програма Служіння";
  const shareUrl = \`https://t.me/share/url?url=\${encodeURIComponent(url)}&text=\${encodeURIComponent(text)}\`;
  
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
};`;

const newShare = `els.btnShare.onclick = () => {
  if (tg && tg.switchInlineQuery) {
    tg.switchInlineQuery(''); // This opens the chat selection and inserts @ProgramLive_bot
  } else {
    const url = \`https://t.me/ProgramLive_bot/app?startapp=\${programId}\`;
    const text = state.title || "Програма Служіння";
    const shareUrl = \`https://t.me/share/url?url=\${encodeURIComponent(url)}&text=\${encodeURIComponent(text)}\`;
    if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
    else window.open(shareUrl, '_blank');
  }
};`;
code = code.replace(oldShare, newShare);
fs.writeFileSync('public/app.js', code);
console.log("Patched app.js share button.");
