const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

code = code.replace(
  "tg.switchInlineQuery(programId); // Opens chat selection with specific program",
  "tg.switchInlineQuery(programId, ['users', 'groups', 'channels']); // Forces chat selection dialog"
);

fs.writeFileSync('public/app.js', code);
console.log("Patched share button targeting.");
