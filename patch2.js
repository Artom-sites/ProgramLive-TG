const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
  "content: { ...(s.items[index].content || {}), chords: updatedData.chords }",
  "content: { ...(s.items[index].content || {}), chords: updatedData.chords }, attachments: updatedData.attachments || s.items[index].attachments || []"
);

code = code.replace(
  "const newItem = { id: Date.now().toString(),",
  "const newItem = { id: Date.now().toString(), attachments: itemData.attachments || [],"
);

fs.writeFileSync('server.js', code);
console.log("Patched server.js sockets successfully.");
