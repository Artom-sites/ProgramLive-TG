const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

// Declare elements
code = code.replace(
    /btnLive: document\.getElementById\('btnLive'\),/g,
    'btnLive: document.getElementById(\'btnLive\'),\n  btnSubscribe: document.getElementById(\'btnSubscribe\'),\n  iconBell: document.getElementById(\'iconBell\'),'
);

// Add isSubscribed state
code = code.replace(
    /let isAdmin = false;/g,
    'let isAdmin = false;\nlet isSubscribed = false;'
);

const subscribeLogic = `
function updateSubscribeUI() {
  if (isSubscribed) {
    if (els.btnSubscribe) els.btnSubscribe.style.color = 'var(--tg-hint, #999)';
    if (els.iconBell) els.iconBell.innerHTML = \`<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><line x1="2" y1="2" x2="22" y2="22"></line>\`;
  } else {
    if (els.btnSubscribe) els.btnSubscribe.style.color = 'var(--tg-text, #000)';
    if (els.iconBell) els.iconBell.innerHTML = \`<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>\`;
  }
}

if (els.btnSubscribe) {
  els.btnSubscribe.onclick = () => {
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    els.btnSubscribe.style.opacity = '0.5';
    socket.emit('toggleSubscription', (res) => {
      els.btnSubscribe.style.opacity = '1';
      if (res.error) {
        if (res.error === 'BOT_BLOCKED') {
          if (tg) tg.showAlert("Щоб отримувати особисті сповіщення, спочатку відкрийте @ProgramLive_bot і натисніть Start.");
        } else {
          if (tg) tg.showAlert("Помилка підписки.");
        }
        return;
      }
      isSubscribed = res.subscribed;
      updateSubscribeUI();
      if (tg) {
        tg.showPopup({ 
          title: isSubscribed ? "Сповіщення увімкнені" : "Сповіщення вимкнені", 
          message: isSubscribed ? "Ви будете отримувати повідомлення про зміни." : "Ви більше не будете отримувати сповіщення." 
        });
      }
    });
  };
}
`;

code = code + "\n" + subscribeLogic;

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js with subscription logic part 3.");
