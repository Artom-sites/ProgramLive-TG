const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const anchor = `const uniqueId = fileInfo.uniqueId;`;
const newMock = `    if (process.env.LOAD_TEST_MODE === 'true' && fileId.startsWith('TEST_CACHE_')) {
      fileInfo = {
        href: 'https://programlive-staging-219872362299.europe-west1.run.app/download/telegram/TEST_5MB',
        uniqueId: 'mock_uid_' + fileId,
        time: Date.now()
      };
    }
    
    const uniqueId = fileInfo.uniqueId;`;

code = code.replace(anchor, newMock);
fs.writeFileSync('server.js', code);
