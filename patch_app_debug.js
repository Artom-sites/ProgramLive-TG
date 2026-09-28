const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

code = code.replace(
  "serverTimeOffset = Date.now() - data.serverTime;",
  "serverTimeOffset = Date.now() - data.serverTime;\n    if (data.debugValidation !== 'OK') alert('Validation failed: ' + data.debugValidation);"
);

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js with alert for debugValidation.");
