const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const shutdownCode = `
// Graceful shutdown to prevent 409 Conflict polling errors on Render
process.once('SIGINT', () => {
  if (bot) bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  if (bot) bot.stop('SIGTERM');
  process.exit(0);
});
`;

if (!code.includes("bot.stop('SIGTERM')")) {
  code = code.replace(
    "if (BOT_TOKEN) {\n  bot = new Telegraf(BOT_TOKEN);",
    "if (BOT_TOKEN) {\n  bot = new Telegraf(BOT_TOKEN);\n" + shutdownCode
  );
  fs.writeFileSync('server.js', code);
  console.log("Patched shutdown.");
}
