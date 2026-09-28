const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(
    /const \{ chatId, messageId \} = data\.notifyTokens\[notifyToken\];\n      try \{/g,
    "const { chatId, messageId } = data.notifyTokens[notifyToken];\n      if (chatId == userId) {\n        try {"
);

code = code.replace(
    /        console\.error\(\`Failed to delete notification \$\{messageId\} in \$\{chatId\}:\`, e\.message\);\n      \}\n    \}/g,
    "        console.error(`Failed to delete notification ${messageId} in ${chatId}:`, e.message);\n        }\n      }\n    }"
);

fs.writeFileSync('server.js', code);
