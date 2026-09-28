const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Declare bot at the top
code = code.replace(
  "const { Telegraf } = require('telegraf');",
  "const { Telegraf } = require('telegraf');\nlet bot = null;"
);

// Remove the local declaration
code = code.replace(
  "if (BOT_TOKEN) {\n  const bot = new Telegraf(BOT_TOKEN);",
  "if (BOT_TOKEN) {\n  bot = new Telegraf(BOT_TOKEN);"
);

fs.writeFileSync('server.js', code);
console.log("Patched bot scope.");
