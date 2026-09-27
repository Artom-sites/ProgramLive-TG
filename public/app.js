// Telegram WebApp Setup
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
}

const socket = io();

// STATE & DOM
let state = { isLive: false, items: [] };
let isAdmin = false;

// SVG Icons Dictionary
const icons = {
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  prayer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  choir: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
  word: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

const els = {
  roleToggleBtn: document.getElementById('roleToggleBtn'),
  liveBadge: document.getElementById('liveBadge'),
  syncStatus: document.getElementById('syncStatus'),
  
  heroIconWrap: document.getElementById('heroIconWrap'),
  heroType: document.getElementById('heroType'),
  heroCounter: document.getElementById('heroCounter'),
  heroTitle: document.getElementById('heroTitle'),
  heroNote: document.getElementById('heroNote'),
  
  adminControls: document.getElementById('adminControls'),
  prevBtn: document.getElementById('prevBtn'),
  nextBtn: document.getElementById('nextBtn'),
  
  floatingToolbar: document.getElementById('floatingToolbar'),
  toggleLiveBtn: document.getElementById('toggleLiveBtn'),
  toggleLiveText: document.getElementById('toggleLiveText'),
  
  itemsContainer: document.getElementById('itemsContainer')
};

// SOCKET LISTENERS
socket.on('stateUpdate', (newState) => {
  state = newState;
  render();
  if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

// RENDER ENGINE
function render() {
  const activeIndex = state.items.findIndex(i => i.active);
  const activeItem = activeIndex !== -1 ? state.items[activeIndex] : state.items[0];
  const activeDisplayIndex = activeIndex !== -1 ? activeIndex : 0;

  // 1. Render Hero
  if (activeItem) {
    els.heroIconWrap.innerHTML = icons[activeItem.category] || icons.info;
    els.heroType.textContent = activeItem.type;
    els.heroCounter.textContent = `${activeDisplayIndex + 1} з ${state.items.length}`;
    els.heroTitle.textContent = activeItem.title || activeItem.type;
    els.heroNote.textContent = activeItem.note || "";
  }

  // Admin Controls
  els.prevBtn.disabled = activeIndex <= 0;
  els.nextBtn.innerHTML = activeIndex === state.items.length - 1 
    ? `<span>Завершити</span>` 
    : `<span>Наступний пункт</span> <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

  // Live State
  if (state.isLive) {
    els.liveBadge.classList.remove('hidden');
    els.syncStatus.textContent = "В ефірі";
    els.syncStatus.style.color = "var(--accent-red)";
    els.toggleLiveText.textContent = "Зупинити ефір";
  } else {
    els.liveBadge.classList.add('hidden');
    els.syncStatus.textContent = "Оновлено щойно";
    els.syncStatus.style.color = "var(--text-secondary)";
    els.toggleLiveText.textContent = "Почати служіння";
  }

  // 2. Render List
  els.itemsContainer.innerHTML = '';
  state.items.forEach((item, index) => {
    const isPast = index < activeIndex;
    const isCurrent = index === activeIndex;

    const row = document.createElement('div');
    row.className = `list-item ${isCurrent ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`;
    
    if (isAdmin) {
      row.style.cursor = 'pointer';
      row.onclick = () => socket.emit('setActiveItem', index);
    }

    let adminHTML = '';
    if (isAdmin) {
      adminHTML = `
        <div class="item-actions">
          <button class="action-btn" onclick="event.stopPropagation(); socket.emit('moveItem', {index: ${index}, direction: -1})" ${index===0?'disabled':''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
          <button class="action-btn" onclick="event.stopPropagation(); socket.emit('moveItem', {index: ${index}, direction: 1})" ${index===state.items.length-1?'disabled':''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="item-index">${index + 1}</div>
      <div class="item-icon-wrap">
        ${icons[item.category] || icons.info}
      </div>
      <div class="item-content">
        <div class="item-type">${item.type}</div>
        <div class="item-title">${item.title || item.note || ''}</div>
      </div>
      ${adminHTML}
    `;
    els.itemsContainer.appendChild(row);
  });
}

// EVENT LISTENERS
els.roleToggleBtn.addEventListener('click', () => {
  isAdmin = !isAdmin;
  els.roleToggleBtn.textContent = isAdmin ? "Редагування" : "Глядач";
  els.roleToggleBtn.classList.toggle('is-admin', isAdmin);
  
  if (isAdmin) {
    els.adminControls.classList.remove('hidden');
    els.floatingToolbar.classList.remove('hidden');
    if(tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  } else {
    els.adminControls.classList.add('hidden');
    els.floatingToolbar.classList.add('hidden');
  }
  render();
});

els.nextBtn.addEventListener('click', () => {
  const idx = state.items.findIndex(i => i.active);
  if (idx < state.items.length - 1) {
    socket.emit('setActiveItem', idx + 1);
    if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
  }
});

els.prevBtn.addEventListener('click', () => {
  const idx = state.items.findIndex(i => i.active);
  if (idx > 0) {
    socket.emit('setActiveItem', idx - 1);
    if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
  }
});

els.toggleLiveBtn.addEventListener('click', () => {
  socket.emit('toggleLive');
  if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');
});
