// Setup Telegram WebApp Theme
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
  document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color);
  document.documentElement.style.setProperty('--tg-text', tg.themeParams.text_color);
  document.documentElement.style.setProperty('--tg-hint', tg.themeParams.hint_color);
}

const socket = io();

// State
let state = { items: [], isLive: false, activeItemIndex: 0, liveStartTime: null };
let serverTimeOffset = 0;
let isAdmin = false;
let timerInterval = null;

// DOM
const els = {
  roleToggle: document.getElementById('roleToggle'),
  liveBadge: document.getElementById('liveBadge'),
  timeline: document.getElementById('timeline'),
  bottomBar: document.getElementById('bottomBar'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnLive: document.getElementById('btnLive'),
  modal: document.getElementById('contentModal'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  btnCloseModal: document.getElementById('btnCloseModal')
};

// Formatting helpers
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

    const card = document.createElement('div');
    card.className = `item-card ${isCurrent ? 'is-active' : ''} ${isPast ? 'is-past' : ''}`;
    
    if (isAdmin) {
      card.style.cursor = 'pointer';
      card.onclick = (e) => {
        // Prevent click if clicking a button inside
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
          socket.emit('setActiveItem', index);
        }
      };
    }

    // Format duration for display
    const durMins = Math.floor(item.duration / 60);

    // Build Cues
    let cuesHTML = '';
    if (item.cues) {
      if (item.cues.sound) cuesHTML += `<div class="cue-row"><span class="cue-label l-sound">ЗВУК</span><span class="cue-val">${item.cues.sound}</span></div>`;
      if (item.cues.media) cuesHTML += `<div class="cue-row"><span class="cue-label l-media">МЕДІА</span><span class="cue-val">${item.cues.media}</span></div>`;
      if (item.cues.light) cuesHTML += `<div class="cue-row"><span class="cue-label l-light">СВІТЛО</span><span class="cue-val">${item.cues.light}</span></div>`;
    }

    // Attachments
    let attachHTML = '';
    if (item.content) {
      if (item.content.chords) {
        attachHTML += `<button class="btn-attach" onclick="openModal('${item.title}', \`${item.content.chords}\`)">🎼 Акорди</button>`;
      }
      if (item.content.text) {
        attachHTML += `<button class="btn-attach" onclick="openModal('${item.title}', \`${item.content.text}\`)">📝 Текст</button>`;
      }
    }

    // Admin Reorder
    let adminHTML = '';
    if (isAdmin) {
      adminHTML = `
        <div class="admin-actions">
          <button class="btn-move" onclick="event.stopPropagation(); socket.emit('moveItem', {index: ${index}, direction: -1})" ${index===0?'disabled':''}>▲</button>
          <button class="btn-move" onclick="event.stopPropagation(); socket.emit('moveItem', {index: ${index}, direction: 1})" ${index===state.items.length-1?'disabled':''}>▼</button>
        </div>
      `;
    }

    card.innerHTML = `
      <div id="timer-${item.id}" class="item-timer">${formatTime(item.duration)}</div>
      
      <div class="item-meta">
        <div class="meta-left">
          <span class="item-num">${String(index + 1).padStart(2, '0')}</span>
          <span class="item-type">${item.type}</span>
        </div>
        <div class="item-duration">${durMins} хв</div>
      </div>
      
      <div class="item-title">${item.title}</div>
      <div class="item-assignee">👤 ${item.assignee}</div>
      
      <div class="item-cues">${cuesHTML}</div>
      <div class="attachments">${attachHTML}</div>
      ${adminHTML}
    `;
    
    els.timeline.appendChild(card);
  });

  startTimerLoop();
}

// Modals
window.openModal = (title, content) => {
  els.modalTitle.textContent = title;
  els.modalBody.textContent = content;
  els.modal.classList.add('open');
};
els.btnCloseModal.onclick = () => els.modal.classList.remove('open');

// Interactions
els.roleToggle.onclick = () => {
  isAdmin = !isAdmin;
  els.roleToggle.textContent = isAdmin ? "АДМІН" : "ГЛЯДАЧ";
  els.roleToggle.classList.toggle('admin-active', isAdmin);
  
  if (isAdmin) {
    els.bottomBar.classList.remove('hidden');
    if(tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  } else {
    els.bottomBar.classList.add('hidden');
  }
  render();
};

els.btnPrev.onclick = () => socket.emit('setActiveItem', state.activeItemIndex - 1);
els.btnNext.onclick = () => socket.emit('setActiveItem', state.activeItemIndex + 1);
els.btnLive.onclick = () => socket.emit('toggleLive');
