const { DEFAULT_STATE } = require('../programs/programService');

function generateState(numItems) {
  const state = JSON.parse(JSON.stringify(DEFAULT_STATE));
  state.title = 'Test Program ' + numItems;
  state.isLive = true;
  state.activeItemId = 'item-5';
  state.liveStartTime = Date.now();
  
  for (let i = 0; i < numItems; i++) {
    state.items.push({
      id: 'item-' + i,
      type: 'song',
      title: 'Пісня номер ' + i + ' з довгою назвою для тесту',
      subtitle: 'Альбом Тест ' + i,
      attachment: i % 2 === 0 ? {
        type: 'application/pdf',
        name: 'partitatura_' + i + '.pdf',
        url: '/download/telegram/fake_file_id_' + i
      } : null,
      expanded: false
    });
  }
  return state;
}

for (const num of [20, 50, 100]) {
  const st = generateState(num);
  const size = Buffer.byteLength(JSON.stringify(st), 'utf8');
  console.log(`\n--- STATE: ${num} items ---`);
  console.log(`Size: ${size} bytes (~${(size / 1024).toFixed(2)} KB)`);
  console.log(`Broadcast to 100 users: ${(size * 100 / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Broadcast to 300 users: ${(size * 300 / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Broadcast to 500 users: ${(size * 500 / 1024 / 1024).toFixed(2)} MB`);
}
