const fs = require('fs');
let code = fs.readFileSync('bot/handlers.js', 'utf8');
code = code.replace("}\n}\n\nmodule.exports", "}\n\nmodule.exports");
fs.writeFileSync('bot/handlers.js', code);
