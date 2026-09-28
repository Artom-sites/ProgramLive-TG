const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Remove cleanup function and setInterval
code = code.replace(/async function cleanupExpiredFiles\(\) \{[\s\S]*?setInterval\(cleanupExpiredFiles, 12 \* 60 \* 60 \* 1000\);/g, '');

// Remove bucket init
code = code.replace("const bucket = getStorage().bucket();", "");

fs.writeFileSync('server.js', code);
console.log("Patched server.js cleanup logic successfully.");
