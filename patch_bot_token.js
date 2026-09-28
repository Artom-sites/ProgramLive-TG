const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace("const BOT_TOKEN = process.env.BOT_TOKEN;", "");
code = code.replace("require('dotenv').config();", "require('dotenv').config();\nconst BOT_TOKEN = process.env.BOT_TOKEN;");

fs.writeFileSync('server.js', code);
console.log("Moved BOT_TOKEN to top.");
