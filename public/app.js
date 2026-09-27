const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
  document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color);
  document.documentElement.style.setProperty('--tg-text', tg.themeParams.text_color);
  document.documentElement.style.setProperty('--tg-hint', tg.themeParams.hint_color);
  document.documentElement.style.setProperty('--tg-btn', tg.themeParams.button_color);
  document.documentElement.style.setProperty('--tg-btn-text', tg.themeParams.button_text_color);
}

const socket = io();

// State
let state = { items: [], isLive: false, activeItemIndex: 0, liveStartTime: null };
let serverTimeOffset = 0;
let isAdmin = false;
let timerInterval = null;
let expandedItems = new Set(); // Track manually expanded cards

// DOM
const els = {
  roleToggle: document.getElementById('roleToggle'),
  liveBadge: document.getElementById('liveBadge'),
  timeline: document.getElementById('timeline'),
  bottomBar: document.getElementById('bottomBar'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnLive: document.getElementById('btnLive'),
  
  contentModal: document.getElementById('contentModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  
  editModal: document.getElementById('editModal'),
  editIndex: document.getElementById('editIndex'),
  editTitle: document.getElementById('editTitle'),
  editAssignee: document.getElementById('editAssignee'),
  editDuration: document.getElementById('editDuration'),
  editSound: document.getElementById('editSound'),
  editMedia: document.getElementById('editMedia'),
  editChords: document.getElementById('editChords'),
  btnSaveEdit: document.getElementById('btnSaveEdit')
};

// Utils
const formatTime = (seconds) => {
  const m = Math.floor(Math.abs(seconds) / 60).toString().padStart(2, '0');
  const s = (Math.abs(seconds) % 60).toString().padStart(2, '0');
  return seconds < 0 ? `-${m}:${s}` : `${m}:${s}`;
};

// Sync
socket.on('stateUpdate', (newState) => {
  state = newState;
  serverTimeOffset = Date.now() - state.serverTime;
  render();
  if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

// Timer Loop
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!state.isLive || !state.liveStartTime) return;
    const activeItem = state.items[state.activeItemIndex];
    if (!activeItem) return;

    const elapsedSeconds = Math.floor((Date.now() - serverTimeOffset - state.liveStartTime) / 1000);
    const remainingSeconds = activeItem.duration - elapsedSeconds;

    const timerEl = document.getElementById(`timer-${activeItem.id}`);
    if (timerEl) {
      timerEl.textContent = formatTime(remainingSeconds);
      if (remainingSeconds < 0) {
        timerEl.classList.add('overtime');
      } else {
        timerEl.classList.remove('overtime');
      }
    }
  }, 1000);
}

// Render
function render() {
  // Header
  if (state.isLive) {
    els.liveBadge.classList.remove('hidden');
    els.btnLive.classList.add('active');
    els.btnLive.textContent = "STOP LIVE";
  } else {
    els.liveBadge.classList.add('hidden');
    els.btnLive.classList.remove('active');
    els.btnLive.textContent = "START LIVE";
  }

  els.btnPrev.disabled = state.activeItemIndex <= 0;
  els.btnNext.disabled = state.activeItemIndex >= state.items.length - 1;

  // Timeline
  els.timeline.innerHTML = '';
  state.items.forEach((item, index) => {
    const isCurrent = index === state.activeItemIndex;
    const isPast = index < state.activeItemIndex;
    const isExpanded = expandedItems.has(item.id) || isCurrent;

    const card = document.createElement('div');
    card.className = `item-card ${isCurrent ? 'is-active' : ''} ${isPast ? 'is-past' : ''} ${isExpanded ? 'expanded' : ''}`;
    
    // Toggle expand on click
    card.onclick = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      if (!isCurrent) { // Only toggle non-active items, active is always expanded
        if (expandedItems.has(item.id)) expandedItems.delete(item.id);
        else expandedItems.add(item.id);
        render(); // fast re-render
      }
    };

    // Details Content
    let detailsHTML = `
      <div class="detail-row"><span class="detail-label">Хто:</span><span class="detail-val">${item.assignee || '—'}</span></div>
      ${item.cues?.sound ? `<div class="detail-row"><span class="detail-label">Звук:</span><span class="detail-val">${item.cues.sound}</span></div>` : ''}
      ${item.cues?.media ? `<div class="detail-row"><span class="detail-label">Медіа:</span><span class="detail-val">${item.cues.media}</span></div>` : ''}
    `;

    // Action Buttons
    let actionsHTML = '';
    if (item.content?.chords) {
      actionsHTML += `<button class="btn-small" onclick="openContent('${item.title}', \`${item.content.chords}\`)">Акорди/Текст</button>`;
    }
    if (isAdmin) {
      actionsHTML += `<button class="btn-small primary" onclick="openEdit(${index})">Редагувати</button>`;
      
      if (!isCurrent) {
        actionsHTML += `<button class="btn-small" onclick="socket.emit('setActiveItem', ${index})">Зробити активним</button>`;
      }
      
      actionsHTML += `
        <div style="flex:1"></div>
        <button class="btn-small" onclick="socket.emit('moveItem', {index: ${index}, direction: -1})" ${index===0?'disabled':''}>▲</button>
        <button class="btn-small" onclick="socket.emit('moveItem', {index: ${index}, direction: 1})" ${index===state.items.length-1?'disabled':''}>▼</button>
      `;
    }

    card.innerHTML = `
      <div class="item-main">
        <div class="item-left">
          <span class="item-num">${index + 1}</span>
          <span class="item-title">${item.title}</span>
        </div>
        <div class="item-right">
          <span id="timer-${item.id}" class="item-timer">${isCurrent && state.isLive ? formatTime(item.duration) : Math.floor(item.duration/60) + ' хв'}</span>
        </div>
      </div>
      <div class="item-details">
        ${detailsHTML}
        <div class="item-actions-row">${actionsHTML}</div>
      </div>
    `;
    
    els.timeline.appendChild(card);
  });

  startTimerLoop();
}

// Modals
window.openContent = (title, content) => {
  els.modalTitle.textContent = title;
  els.modalBody.style.fontFamily = 'monospace';
  els.modalBody.style.whiteSpace = 'pre-wrap';
  els.modalBody.textContent = content;
  els.contentModal.classList.add('open');
};

window.openEdit = (index) => {
  const item = state.items[index];
  if (!item) return;
  els.editIndex.value = index;
  els.editTitle.value = item.title || '';
  els.editAssignee.value = item.assignee || '';
  els.editDuration.value = Math.floor(item.duration / 60);
  els.editSound.value = item.cues?.sound || '';
  els.editMedia.value = item.cues?.media || '';
  els.editChords.value = item.content?.chords || '';
  els.editModal.classList.add('open');
};

els.btnSaveEdit.onclick = () => {
  const index = parseInt(els.editIndex.value);
  const updatedData = {
    title: els.editTitle.value,
    assignee: els.editAssignee.value,
    duration: parseInt(els.editDuration.value) * 60,
    sound: els.editSound.value,
    media: els.editMedia.value,
    chords: els.editChords.value
  };
  socket.emit('updateItem', { index, updatedData });
  els.editModal.classList.remove('open');
  if(tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
};

// Interactions
els.roleToggle.onclick = () => {
  isAdmin = !isAdmin;
  els.roleToggle.textContent = isAdmin ? "АДМІН" : "ГЛЯДАЧ";
  els.roleToggle.classList.toggle('admin-active', isAdmin);
  
  if (isAdmin) els.bottomBar.classList.remove('hidden');
  else els.bottomBar.classList.add('hidden');
  
  render();
};

els.btnPrev.onclick = () => socket.emit('setActiveItem', state.activeItemIndex - 1);
els.btnNext.onclick = () => socket.emit('setActiveItem', state.activeItemIndex + 1);
els.btnLive.onclick = () => socket.emit('toggleLive');
