const fs = require('fs');

// 1. Fix app.js
let appJs = fs.readFileSync('public/app.js', 'utf8');
appJs = appJs.replace(
  "const socket = io({ query: { programId, initData: tg?.initData || '' } });",
  "const socket = io({ auth: { programId, initData: tg?.initData || '' } });"
);
// Remove the alert debug logic from frontend
appJs = appJs.replace(
  "    if (data.debugValidation !== 'OK') alert('Validation failed: ' + data.debugValidation);",
  ""
);
appJs = appJs.replace(
  "    els.headerTitle.textContent = \"Error: \" + e.message;\n    alert(\"Init Error: \" + e.message + \"\\n\" + e.stack);",
  "    console.error('Init Error:', e);"
);
fs.writeFileSync('public/app.js', appJs);


// 2. Fix server.js
let serverJs = fs.readFileSync('server.js', 'utf8');

// The validateWebAppData function is fine, but we'll add the server-side debug logic.
const newSocketConnect = `io.on('connection', async (socket) => {
  const auth = socket.handshake.auth || {};
  const query = socket.handshake.query || {};
  const programId = auth.programId || query.programId || 'default';
  const initData = auth.initData || '';
  
  // --- SERVER-SIDE DEBUG LOGGING ---
  console.log(\`[Auth Debug] New connection for programId: \${programId}\`);
  console.log(\`[Auth Debug] initData exists: \${!!initData}\`);
  
  let userId = null;
  if (initData) {
    try {
      const q = new URLSearchParams(initData);
      const keys = Array.from(q.keys());
      console.log(\`[Auth Debug] Received parameters: \${keys.join(', ')}\`);
      
      const hash = q.get('hash');
      console.log(\`[Auth Debug] hash exists: \${!!hash}\`);
      
      if (hash) {
        q.delete('hash');
        const sortedKeys = Array.from(q.keys()).sort();
        const dataCheckString = sortedKeys.map(k => k + '=' + q.get(k)).join('\\n');
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        console.log(\`[Auth Debug] calculatedHash === receivedHash: \${calculatedHash === hash}\`);
        
        if (calculatedHash === hash) {
          const userStr = q.get('user');
          if (userStr) {
            const parsedUser = JSON.parse(userStr);
            userId = parsedUser.id;
            console.log(\`[Auth Debug] Validation SUCCESS. User ID: \${userId}\`);
          } else {
            console.log(\`[Auth Debug] Validation failed: 'user' parameter is missing.\`);
          }
        } else {
          console.log(\`[Auth Debug] Validation failed: Hash mismatch.\`);
        }
      } else {
        console.log(\`[Auth Debug] Validation failed: No hash provided.\`);
      }
    } catch (e) {
      console.log(\`[Auth Debug] Validation Exception: \${e.message}\`);
    }
  } else {
    console.log(\`[Auth Debug] Validation skipped: No initData.\`);
  }
  // ---------------------------------

  socket.data.userId = userId;
  socket.join(programId);
  
  let data = await getProgramData(programId);
  
  const isAdmin = userId !== null && (data.admins.includes(userId) || data.admins.length === 0);
  console.log(\`[Auth Debug] Final isAdmin status: \${isAdmin}\\n\`);
  
  socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now() });`;

const oldSocketRegex = /io\.on\('connection', async \(socket\) => \{[\s\S]*?socket\.emit\('init', \{ state: data\.state, isAdmin, serverTime: Date\.now\(\), debugValidation \}\);/g;

// Fallback regex if the debugValidation one isn't there
const oldSocketRegexFallback = /io\.on\('connection', async \(socket\) => \{[\s\S]*?socket\.emit\('init', \{ state: data\.state, isAdmin, serverTime: Date\.now\(\)(, debugValidation)? \}\);/g;

if (serverJs.match(oldSocketRegexFallback)) {
  serverJs = serverJs.replace(oldSocketRegexFallback, newSocketConnect);
}

fs.writeFileSync('server.js', serverJs);
console.log("Patched server.js and app.js");
