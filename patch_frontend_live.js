const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

// 1. Connection auth: pass initData instead of userId
code = code.replace(
  "const userId = tg?.initDataUnsafe?.user?.id || 0;\nconst socket = io({ query: { programId, userId } });",
  "const socket = io({ query: { programId, initData: tg?.initData || '' } });"
);

// 2. Initial state
code = code.replace(
  "let state = { items: [], isLive: false, activeItemIndex: 0, liveStartTime: null };",
  "let state = { items: [], isLive: false, activeItemId: null, liveStartTime: null };"
);

// 3. startTimerLoop
code = code.replace(
  "const activeItem = state.items[state.activeItemIndex];",
  "const activeItem = state.items.find(i => i.id === state.activeItemId);"
);

// 4. render
code = code.replace(
  "els.btnPrev.disabled = state.activeItemIndex <= 0;\n  els.btnNext.disabled = state.activeItemIndex >= state.items.length - 1;",
  "const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);\n  els.btnPrev.disabled = currentIndex <= 0;\n  els.btnNext.disabled = currentIndex === -1 || currentIndex >= state.items.length - 1;"
);

code = code.replace(
  "const isCurrent = index === state.activeItemIndex;\n    const isPast = index < state.activeItemIndex;",
  "const isCurrent = item.id === state.activeItemId;\n    const isPast = currentIndex !== -1 && index < currentIndex;"
);

code = code.replace(
  "actionsHTML += \`<button class=\"btn-small\" onclick=\"socket.emit('setActiveItem', \${index})\">Зробити активним</button>\`;",
  "actionsHTML += \`<button class=\"btn-small\" onclick=\"socket.emit('setActiveItem', '\${item.id}')\">Зробити активним</button>\`;"
);

// 5. controls
const oldControls = `els.btnPrev.onclick = () => socket.emit('setActiveItem', state.activeItemIndex - 1);
els.btnNext.onclick = () => socket.emit('setActiveItem', state.activeItemIndex + 1);`;

const newControls = `els.btnPrev.onclick = () => {
  const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);
  if (currentIndex > 0) socket.emit('setActiveItem', state.items[currentIndex - 1].id);
};
els.btnNext.onclick = () => {
  const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);
  if (currentIndex !== -1 && currentIndex < state.items.length - 1) socket.emit('setActiveItem', state.items[currentIndex + 1].id);
  else if (currentIndex === -1 && state.items.length > 0) socket.emit('setActiveItem', state.items[0].id);
};`;

code = code.replace(oldControls, newControls);

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js Live Mode and Auth.");
