const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldSocket = /const user = validateWebAppData\(initData, BOT_TOKEN\);\n  const userId = user \? user\.id : null;/;
const newSocket = `
  let debugValidation = "OK";
  let user = null;
  if (!initData) {
    debugValidation = "No initData provided";
  } else {
    try {
      const q = new URLSearchParams(initData);
      const hash = q.get('hash');
      if (!hash) {
        debugValidation = "No hash in initData";
      } else {
        q.delete('hash');
        const keys = Array.from(q.keys()).sort();
        const dataCheckString = keys.map(k => \`\${k}=\${q.get(k)}\`).join('\\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) {
          debugValidation = "Hash mismatch. Expected: " + hash + " Got: " + calculatedHash;
        } else {
          user = JSON.parse(q.get('user'));
        }
      }
    } catch(e) {
      debugValidation = "Exception: " + e.message;
    }
  }
  const userId = user ? user.id : null;
`;

code = code.replace(oldSocket, newSocket);

code = code.replace(
  "socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now() });",
  "socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now(), debugValidation });"
);

fs.writeFileSync('server.js', code);
console.log("Patched server.js with debugValidation.");
