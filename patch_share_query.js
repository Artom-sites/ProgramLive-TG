const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

code = code.replace(
  "tg.switchInlineQuery(''); // This opens the chat selection and inserts @ProgramLive_bot",
  "tg.switchInlineQuery(programId); // Opens chat selection with specific program"
);

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js to pass programId.");
