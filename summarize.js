const fs = require('fs');

const files = [
  'server.js', 
  'public/app.js', 
  'services/notifications.js', 
  'services/telegramUpload.js'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file, 'utf8');
  console.log(`\n=== FILE: ${file} ===`);
  const lines = content.split('\n');
  const summary = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^class\s/) || line.match(/^(async\s+)?function\s/) || line.match(/app\.(post|get)/) || line.match(/bot\.(on|command|action|hears)/) || line.match(/io\.on/) || line.match(/socket\.on/)) {
      summary.push(line.trim());
    }
  }
  console.log(summary.join('\n'));
}
