// Smoke Test Runner
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("🔥 Starting Smoke Tests...\n");

const filesToCheck = [
  'server.js',
  'public/app.js',
  'services/notifications.js',
  'services/telegramUpload.js',
  'services/telegramAuth.js',
  'programs/programService.js',
  'bot/handlers.js',
  'socket/programSocket.js',
  'config/firebase.js'
];

let failed = false;

for (const file of filesToCheck) {
  const filePath = path.join(process.cwd(), file);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${file}`);
    failed = true;
    continue;
  }
  
  try {
    execSync(`node -c "${filePath}"`, { stdio: 'pipe' });
    console.log(`✅ Syntax OK: ${file}`);
  } catch (e) {
    console.error(`❌ Syntax Error in ${file}:\n${e.stderr.toString()}`);
    failed = true;
  }
}

console.log("\n" + (failed ? "❌ SMOKE TESTS FAILED" : "✅ ALL SMOKE TESTS PASSED"));
process.exit(failed ? 1 : 0);
