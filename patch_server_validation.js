const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldValid = /function validateWebAppData[\s\S]*?return null;\n\}/;
const newValid = `function validateWebAppData(initData, token) {
  if (!initData) return null;
  try {
    const q = new URLSearchParams(initData);
    const hash = q.get('hash');
    if (!hash) return null;
    q.delete('hash');
    const keys = Array.from(q.keys()).sort();
    const dataCheckString = keys.map(k => k + '=' + q.get(k)).join('\\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token.trim()).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (calculatedHash === hash) {
      const userStr = q.get('user');
      if (userStr) return JSON.parse(userStr);
    }
  } catch (e) {}
  return null;
}`;

code = code.replace(oldValid, newValid);
fs.writeFileSync('server.js', code);
console.log("Patched validation.");
