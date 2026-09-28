const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  "console.log('calculatedHash', calculatedHash, 'hash', hash);\\n    if (calculatedHash === hash) {",
  "console.log('calculatedHash', calculatedHash, 'hash', hash);\n    if (calculatedHash === hash) {"
);

fs.writeFileSync('server.js', code);
