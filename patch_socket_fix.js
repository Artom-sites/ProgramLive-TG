const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const oldSocketRegex = /io\.on\('connection', async \(socket\) => \{[\s\S]*?io\.to\(programId\)\.emit\('stateUpdate', \{ \.\.\.s, serverTime: Date\.now\(\) \}\);\n  \}\);\n\}\);/;
const newSocket = `io.on('connection', async (socket) => {
  const programId = socket.handshake.query.programId || 'default';
  const initData = socket.handshake.query.initData || '';
  
  // VALIDATE INIT DATA
  const user = validateWebAppData(initData, BOT_TOKEN);
  const userId = user ? user.id : null;
  socket.data.userId = userId;
  
  socket.join(programId);
  
  let data = await getProgramData(programId);
  
  // MUST HAVE VALID USER AND BE IN ADMINS TO HAVE WRITE PERMISSIONS
  const isAdmin = userId !== null && (data.admins.includes(userId) || data.admins.length === 0);
  
  socket.emit('init', { state: data.state, isAdmin, serverTime: Date.now() });
  
  socket.on('setActiveItem', async (itemId) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    s.activeItemId = itemId;
    if (s.isLive) s.liveStartTime = Date.now();
    s = await updateProgramState(programId, { activeItemId: s.activeItemId, liveStartTime: s.liveStartTime });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('toggleLive', async () => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    s.isLive = !s.isLive;
    s.liveStartTime = s.isLive ? Date.now() : null;
    s = await updateProgramState(programId, { isLive: s.isLive, liveStartTime: s.liveStartTime });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('moveItem', async ({ index, direction }) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    const newIndex = index + direction;
    if (newIndex >= 0 && newIndex < s.items.length) {
      const temp = s.items[index];
      s.items[index] = s.items[newIndex];
      s.items[newIndex] = temp;
      s = await updateProgramState(programId, { items: s.items });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('updateProgramSettings', async (newSettings) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    s.title = newSettings.title;
    s = await updateProgramState(programId, { title: s.title });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });

  socket.on('updateItem', async ({ index, updatedData }) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    if (s.items[index]) {
      s.items[index] = {
        ...s.items[index],
        type: updatedData.type || s.items[index].type || 'standard',
        title: updatedData.title,
        duration: updatedData.duration,
        assignee: updatedData.assignee,
        cues: { ...s.items[index].cues, sound: updatedData.sound, media: updatedData.media },
        content: { ...(s.items[index].content || {}), chords: updatedData.chords }, attachments: updatedData.attachments || s.items[index].attachments || []
      };
      s = await updateProgramState(programId, { items: s.items });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('deleteItem', async (index) => {
    if (!isAdmin) return;
    let s = (await getProgramData(programId)).state;
    if (index >= 0 && index < s.items.length) {
      const deletedItem = s.items[index];
      s.items.splice(index, 1);
      
      let newActiveId = s.activeItemId;
      if (s.activeItemId === deletedItem.id) {
        if (s.items[index]) {
          newActiveId = s.items[index].id;
        } else if (s.items[index - 1]) {
          newActiveId = s.items[index - 1].id;
        } else {
          newActiveId = null;
        }
      }
      s = await updateProgramState(programId, { items: s.items, activeItemId: newActiveId });
      io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
    }
  });

  socket.on('addItem', async (itemData) => {
    if (!isAdmin) return;
    const crypto = require('crypto');
    const newItem = { id: crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36), attachments: itemData.attachments || [], ...itemData };
    let s = (await getProgramData(programId)).state;
    s.items.push(newItem);
    s = await updateProgramState(programId, { items: s.items });
    io.to(programId).emit('stateUpdate', { ...s, serverTime: Date.now() });
  });
});`;

// Replace the block
code = code.replace(oldSocketRegex, newSocket);
fs.writeFileSync('server.js', code);
console.log("Patched server.js socket.io.");
