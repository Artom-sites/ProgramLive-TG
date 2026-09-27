// Telegram WebApp Setup
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();
  document.documentElement.style.setProperty('--tg-bg', tg.themeParams.bg_color);
  document.documentElement.style.setProperty('--tg-text', tg.themeParams.text_color);
  document.documentElement.style.setProperty('--tg-hint', tg.themeParams.hint_color);
  document.documentElement.style.setProperty('--tg-button', tg.themeParams.button_color);
  document.documentElement.style.setProperty('--tg-button-text', tg.themeParams.button_text_color);
}

const socket = io();

// STATE & DOM
let state = { isLive: false, items: [] };
let isAdmin = false;

const icons = {
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`,
  prayer: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>`,
  choir: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
  word: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

const colors = {
  music: 'rgba(59, 130, 246, 0.4)',  // Blue
  prayer: 'rgba(168, 85, 247, 0.4)', // Purple
  choir: 'rgba(236, 72, 153, 0.4)',  // Pink
  word: 'rgba(234, 179, 8, 0.4)',    // Yellow/Gold
  info: 'rgba(100, 116, 139, 0.4)'   // Slate
};

const els = {
  ambientBg: document.getElementById('ambientBg'),
  artCover: document.getElementById('artCover'),
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

socket.on('stateUpdate', (newState) => {
  state = newState;
  render();
  // Animate cover
  els.artCover.classList.add('pulse');
  setTimeout(() => els.artCover.classList.remove('pulse'), 300);
  if(tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

function render() {
  const activeIndex = state.items.findIndex(i => i.active);
  const activeItem = activeIndex !== -1 ? state.items[activeIndex] : state.items[0];

  if (activeItem) {
    els.heroIconWrap.innerHTML = icons[activeItem.category] || icons.info;
    els.ambientBg.style.background = `radial-gradient(circle at 50% 0%, ${colors[activeItem.category] || colors.info} 0%, transparent 70%)`;
    
    els.heroType.textContent = activeItem.type;
    els.heroCounter.textContent = `${(activeIndex !== -1 ? activeIndex : 0) + 1}/${state.items.length}`;
    els.heroTitle.textContent = activeItem.title || activeItem.type;
    els.heroNote.textContent = activeItem.note || "";
  }

  els.prevBtn.disabled = activeIndex <= 0;
  
  if (state.isLive) {
    els.liveBadge.style.display = 'flex';
    els.syncStatus.textContent = "В ефірі";
    els.syncStatus.style.color = "#ef4444";
    els.toggleLiveText.textContent = "Зупинити ефір";
  } else {
    els.liveBadge.style.display = 'none';
    els.syncStatus.textContent = "Оновлено";
    els.syncStatus.style.color = "var(--tg-hint)";
    els.toggleLiveText.textContent = "Запустити ефір";
  }

  els.itemsContainer.innerHTML = '';
  state.items.forEach((item, index) => {
    const isPast = index < activeIndex;
    const isCurrent = index === activeIndex;
    const row = document.createElement('div');
    row.className = `track-row ${isCurrent ? 'is-current' : ''} ${isPast ? 'is-past' : ''}`;
    
    if (isAdmin) {
      row.style.cursor = 'pointer';
      row.onclick = () => socket.emit('setActiveItem', index);
    }

    let adminHTML = '';
    if (isAdmin) {
      adminHTML = `
        <div class="admin-actions">
          <button class="arr-btn" onclick="event.stopPropagation(); socket.emit('moveItem', {index: ${index}, direction: -1})" ${index===0?'disabled':''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
          </button>
          <button class="arr-btn" onclick="event.stopPropagation(); socket.emit('moveItem', {index: ${index}, direction: 1})" ${index===state.items.length-1?'disabled':''}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="track-num">${index + 1}</div>
      <div class="track-icon-mini">${icons[item.category] || icons.info}</div>
      <div class="track-details">
        <div class="td-title">${item.title || item.type}</div>
        <div class="td-type">${item.type}</div>
      </div>
      ${adminHTML}
    `;
    els.itemsContainer.appendChild(row);
  });
}

els.roleToggleBtn.addEventListener('click', () => {
  isAdmin = !isAdmin;
  els.roleToggleBtn.textContent = isAdmin ? "РЕДАКТОР" : "ГЛЯДАЧ";
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
