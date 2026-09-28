const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const startStr = "// Websockets\nio.on('connection', async (socket) => {";
const endStr = "  });\n});\n";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr, startIndex) + endStr.length;

const socketCodeBlock = code.substring(startIndex, endIndex);

const socketModuleCode = `const { validateTelegramInitData } = require('../services/telegramAuth');
const { getProgramData, updateProgramState, generateId } = require('../programs/programService');
const { verifyBotCanMessage, sendLiveStarted, scheduleProgramChangeNotification } = require('../services/notifications');
const crypto = require('crypto');

function setupSockets(io, bot, db, BOT_TOKEN) {
${socketCodeBlock.replace("// Websockets\n", "")}
}

module.exports = { setupSockets };
`;

fs.writeFileSync('socket/programSocket.js', socketModuleCode);

const replacement = `// Websockets
const { setupSockets } = require('./socket/programSocket');
setupSockets(io, bot, db, BOT_TOKEN);
`;

const result = code.substring(0, startIndex) + replacement + code.substring(endIndex);
fs.writeFileSync('server.js', result);
console.log("Replaced socket block.");
