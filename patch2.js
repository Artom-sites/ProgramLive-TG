const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const anchor1 = `    let fileInfo = telegramFileCache.get(fileId);`;
const anchor2 = `    if (!fileInfo || Date.now() - fileInfo.time > 30 * 60 * 1000) {`;

code = code.replace(anchor1, anchor1 + `
    if (process.env.LOAD_TEST_MODE === 'true' && fileId.startsWith('TEST_CACHE_')) {
      fileInfo = {
        href: 'https://programlive-staging-219872362299.europe-west1.run.app/download/telegram/TEST_5MB',
        uniqueId: 'mock_uid_' + fileId,
        time: Date.now()
      };
      telegramFileCache.set(fileId, fileInfo);
    }
`);

// Remove the old mock
const oldMock = `    if (process.env.LOAD_TEST_MODE === 'true' && fileId.startsWith('TEST_CACHE_')) {
      fileInfo = {
        href: 'https://programlive-staging-219872362299.europe-west1.run.app/download/telegram/TEST_5MB',
        uniqueId: 'mock_uid_' + fileId,
        time: Date.now()
      };
    }`;
code = code.replace(oldMock, '');

fs.writeFileSync('server.js', code);
