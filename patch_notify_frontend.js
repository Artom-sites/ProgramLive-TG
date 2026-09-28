const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const oldFetch = "const res = await fetch(\`/notify/\${programId}\`, { method: 'POST' });";
const newFetch = "const res = await fetch(\`/notify/\${programId}\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg?.initData }) });";

code = code.replace(oldFetch, newFetch);
fs.writeFileSync('public/app.js', code);
console.log("Patched app.js notify fetch.");
