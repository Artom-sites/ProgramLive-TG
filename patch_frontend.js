const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const oldSocket = `const urlParams = new URLSearchParams(window.location.search);
const programId = tg?.initDataUnsafe?.start_param || urlParams.get('id') || 'default';
const socket = io({ auth: { programId, initData: tg?.initData || '' } });`;

const newSocket = `const urlParams = new URLSearchParams(window.location.search);
const startParam = tg?.initDataUnsafe?.start_param || urlParams.get('id') || 'default';
let programId = startParam;
let notifyToken = '';
if (startParam.includes('_')) {
  const parts = startParam.split('_');
  programId = parts[0];
  notifyToken = parts[1];
}
const socket = io({ auth: { programId, initData: tg?.initData || '', notifyToken } });`;

code = code.replace(oldSocket, newSocket);
fs.writeFileSync('public/app.js', code);
console.log("Patched app.js.");
