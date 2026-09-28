const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const oldShare = /els\.btnShare\.onclick = \(\) => \{[\s\S]*?\n\};/;
const newShare = `els.btnShare.onclick = () => {
  // Use Telegram deep link to force chat selection for inline queries
  const shareUrl = \`https://t.me/ProgramLive_bot?inline=\${encodeURIComponent(programId)}\`;
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
};`;

code = code.replace(oldShare, newShare);
fs.writeFileSync('public/app.js', code);
console.log("Patched share button to use deep link.");
