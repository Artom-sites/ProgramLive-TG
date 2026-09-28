const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
    /s = await updateProgramState\(programId, \{ items: s\.items, activeItemId: newActiveId \}\);\s*io\.to\(programId\)\.emit\('stateUpdate', \{ \.\.\.s, serverTime: Date\.now\(\) \}\);/g,
    "s = await updateProgramState(programId, { items: s.items, activeItemId: newActiveId });\n      if (s.isLive) scheduleProgramChangeNotification(programId, bot, db);\n      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });"
);

fs.writeFileSync('server.js', code);
console.log("Patched deleteItem.");
