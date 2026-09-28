const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

// Declare state variables
code = code.replace(
  'let isSubscribed = false;',
  'let isSubscribed = false;\nlet linkedChats = [];\nlet linkedChatsMeta = {};\nlet privateSubscribersCount = 0;'
);

// Update init handler to store them
const oldInitVars = 'isSubscribed = !!d.isSubscribed;';
const newInitVars = `isSubscribed = !!d.isSubscribed;
  linkedChats = d.linkedChats || [];
  linkedChatsMeta = d.linkedChatsMeta || {};
  privateSubscribersCount = d.privateSubscribersCount || 0;`;
code = code.replace(oldInitVars, newInitVars);

// Replace linkCommandText assignment
code = code.replace(
  "document.getElementById('linkCommandText').innerText = `/link ${programId}`;",
  `document.getElementById('linkedChatsCount').innerText = linkedChats.length;
  document.getElementById('privateSubscribersCount').innerText = privateSubscribersCount;
  
  const listEl = document.getElementById('linkedChatsList');
  listEl.innerHTML = '';
  linkedChats.forEach(chatId => {
    const title = linkedChatsMeta[chatId] || ('Група ' + chatId);
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.background = 'var(--bg-color)';
    item.style.padding = '8px 12px';
    item.style.borderRadius = '6px';
    item.style.fontSize = '13px';
    item.style.color = 'var(--tg-text)';
    
    const titleSpan = document.createElement('span');
    titleSpan.innerText = title;
    titleSpan.style.overflow = 'hidden';
    titleSpan.style.textOverflow = 'ellipsis';
    titleSpan.style.whiteSpace = 'nowrap';
    titleSpan.style.maxWidth = '60%';
    
    const unlinkBtn = document.createElement('button');
    unlinkBtn.innerText = 'Від\\'єднати';
    unlinkBtn.className = 'btn-secondary';
    unlinkBtn.style.padding = '4px 8px';
    unlinkBtn.style.fontSize = '12px';
    unlinkBtn.onclick = () => {
      if (confirm('Від\\'єднати цю групу?')) {
        socket.emit('unlinkGroup', chatId);
        linkedChats = linkedChats.filter(id => id !== chatId);
        openSettingsModal(); // refresh
      }
    };
    
    item.appendChild(titleSpan);
    item.appendChild(unlinkBtn);
    listEl.appendChild(item);
  });`
);

// Replace btnNotifyGroups block
const oldBtnNotify = /document\.getElementById\('btnNotifyGroups'\)\.onclick = async \(\) => \{[\s\S]*?tg\.showAlert\("Помилка: " \+ err\.message\);\n  \}\n\};/;
const newBtnDeepLink = `document.getElementById('btnDeepLinkGroup').onclick = () => {
  if (tg) {
    tg.openTelegramLink('https://t.me/ProgramLive_bot?startgroup=' + programId);
  }
};`;

code = code.replace(oldBtnNotify, newBtnDeepLink);

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js UI logic.");
