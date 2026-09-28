const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// For updateItem and addItem, it has indentation
code = code.replace(
    /s = await updateProgramState\(programId, \{ items: s\.items \}\);\s*io\.to\(programId\)\.emit\('stateUpdate', \{ \.\.\.s, serverTime: Date\.now\(\) \}\);/g,
    "s = await updateProgramState(programId, { items: s.items });\n      if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);\n      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });"
);

fs.writeFileSync('server.js', code);
console.log("Patched missing notifications in server.js.");
