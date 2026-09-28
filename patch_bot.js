const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const startStr = "if (BOT_TOKEN) {\n  bot = new Telegraf(BOT_TOKEN);";
const endStr = "  } else {\n    bot.telegram.deleteWebhook().then(() => {\n      console.log(\"Development mode: starting long-polling...\");\n      bot.launch({ drop_pending_updates: true }).then(() => { global.botPollingStarted = true; });\n    }).catch(console.error);\n  }\n}";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr, startIndex) + endStr.length;

if (startIndex === -1 || endIndex < startIndex) {
  console.log("Could not find bot block bounds.");
  process.exit(1);
}

const botCodeBlock = code.substring(startIndex, endIndex);

const botModuleCode = `const { DEFAULT_STATE } = require('../programs/programService');

function setupBot(bot, db) {
${botCodeBlock.substring(botCodeBlock.indexOf("  bot.catch("))}
}

module.exports = { setupBot };
`;

fs.writeFileSync('bot/handlers.js', botModuleCode);

const replacement = `if (BOT_TOKEN) {
  bot = new Telegraf(BOT_TOKEN);
  const { setupBot } = require('./bot/handlers');
  setupBot(bot, db);
}`;

const result = code.substring(0, startIndex) + replacement + code.substring(endIndex);
fs.writeFileSync('server.js', result);
console.log("Replaced bot block.");
