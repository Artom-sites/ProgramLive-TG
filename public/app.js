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

const urlParams = new URLSearchParams(window.location.search);
const programId = tg?.initDataUnsafe?.start_param || urlParams.get('id') || 'default';
const userId = tg?.initDataUnsafe?.user?.id || 0;
const socket = io({ query: { programId, userId } });

let state = { items: [], isLive: false, activeItemIndex: 0, liveStartTime: null };
let serverTimeOffset = 0;
let isAdmin = false;
let timerInterval = null;
let expandedItems = new Set();

const els = {
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
  editItemId: document.getElementById('editItemId'),
  editTitle: document.getElementById('editTitle'),
  editAssignee: document.getElementById('editAssignee'),
  editDuration: document.getElementById('editDuration'),
  editSound: document.getElementById('editSound'),
  editMedia: document.getElementById('editMedia'),
  editType: document.getElementById('editType'),
  editChords: document.getElementById('editChords'),
  editAttachmentsList: document.getElementById('editAttachmentsList'),
  uploadProgress: document.getElementById('uploadProgress'),
  btnSaveEdit: document.getElementById('btnSaveEdit'),
  headerTitle: document.getElementById('headerTitle'),
  btnShare: document.getElementById('btnShare'),
  settingsModal: document.getElementById('settingsModal'),
  settingsTitle: document.getElementById('settingsTitle'),
  btnSaveSettings: document.getElementById('btnSaveSettings')
};

// ── Utils ──
const formatTime = (seconds) => {
  const m = Math.floor(Math.abs(seconds) / 60).toString().padStart(2, '0');
  const s = (Math.abs(seconds) % 60).toString().padStart(2, '0');
  return seconds < 0 ? `-${m}:${s}` : `${m}:${s}`;
};

function getFileIcon(mime) {
  if (!mime) return '📎';
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('audio')) return '🎵';
  if (mime.includes('video')) return '🎬';
  if (mime.includes('word') || mime.includes('document')) return '📝';
  return '📎';
}

// ── Socket ──
socket.on('init', (data) => {
  state = data.state;
  isAdmin = data.isAdmin;
  serverTimeOffset = Date.now() - data.serverTime;
  
  if (isAdmin) els.bottomBar.classList.remove('hidden');
  else els.bottomBar.classList.add('hidden');
  
  render();
});

socket.on('stateUpdate', (newState) => {
  state = newState;
  serverTimeOffset = Date.now() - state.serverTime;
  render();
  if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
});

// ── Timer Loop ──
function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!state.isLive || !state.liveStartTime) return;
    const activeItem = state.items[state.activeItemIndex];
    if (!activeItem) return;
    const elapsed = Math.floor((Date.now() - serverTimeOffset - state.liveStartTime) / 1000);
    const remaining = activeItem.duration - elapsed;
    const timerEl = document.getElementById(`timer-${activeItem.id}`);
    if (timerEl) {
      timerEl.textContent = formatTime(remaining);
      timerEl.classList.toggle('overtime', remaining < 0);
    }
  }, 1000);
}

// ── Render ──
function render() {
  els.headerTitle.textContent = state.title || "Програма";
  els.btnShare.classList.toggle('hidden', !isAdmin);

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

  els.timeline.innerHTML = '';

  state.items.forEach((item, index) => {
    const isCurrent = index === state.activeItemIndex;
    const isPast = index < state.activeItemIndex;
    const isExpanded = expandedItems.has(item.id);

    const card = document.createElement('div');
    card.dataset.index = index;
    card.className = `item-card ${isCurrent ? 'is-active' : ''} ${isPast ? 'is-past' : ''} ${isExpanded ? 'expanded' : ''}`;

    // Toggle expand on tap (not during swipe)
    card.onclick = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('a')) return;
      if (e.target.closest('.drag-handle')) return;
      if (expandedItems.has(item.id)) expandedItems.delete(item.id);
      else expandedItems.add(item.id);
      render();
    };

    let titlePrefix = '';
    if (item.type === 'song') titlePrefix = '🎵 ';
    if (item.type === 'solo') titlePrefix = '🎤 ';
    if (item.type === 'ensemble') titlePrefix = '👥 ';
    if (item.type === 'orchestra') titlePrefix = '🎻 ';
    if (item.type === 'choir') titlePrefix = '🎼 ';
    if (item.type === 'prayer') titlePrefix = '🙏 ';
    if (item.type === 'sermon') titlePrefix = '📖 ';

    // Details
    const detailsHTML = `
      <div class="detail-row"><span class="detail-label">Хто:</span><span class="detail-val">${item.assignee || '—'}</span></div>
      ${item.cues?.sound ? `<div class="detail-row"><span class="detail-label">Звук:</span><span class="detail-val">${item.cues.sound}</span></div>` : ''}
      ${item.cues?.media ? `<div class="detail-row"><span class="detail-label">Медіа:</span><span class="detail-val">${item.cues.media}</span></div>` : ''}
    `;

    // Action buttons
    let actionsHTML = '';
    if (item.content?.chords) {
      actionsHTML += `<button class="btn-small" onclick="openContent('${item.title}', \`${item.content.chords}\`)">Акорди/Текст</button>`;
    }
    if (isAdmin) {
      actionsHTML += `<button class="btn-small primary" onclick="openEdit(${index})">Редагувати</button>`;
      if (!isCurrent) {
        actionsHTML += `<button class="btn-small" onclick="socket.emit('setActiveItem', ${index})">Зробити активним</button>`;
      }
    }

    // File chips
    let filesHTML = '';
    if (item.attachments && item.attachments.length > 0) {
      filesHTML = `<div class="card-files">` +
        item.attachments.map(a => `<a href="${a.url}" target="_blank" class="file-chip">${getFileIcon(a.type)} ${a.name}</a>`).join('') +
        `</div>`;
    }

    const dragHandle = isAdmin ? `<div class="drag-handle" title="Перетягнути">⠿</div>` : '';

    card.innerHTML = `
      ${isAdmin && !isCurrent ? `<div class="swipe-delete-bg">🗑 Видалити</div>` : ''}
      <div class="card-inner">
        <div class="item-main">
          <div class="item-left">
            ${dragHandle}
            <span class="item-num">${index + 1}</span>
            <span class="item-title">${titlePrefix}${item.title}</span>
          </div>
          <div class="item-right">
            <span id="timer-${item.id}" class="item-timer">${isCurrent && state.isLive ? formatTime(item.duration) : Math.floor(item.duration / 60) + ' хв'}</span>
          </div>
        </div>
        <div class="item-details">
          ${detailsHTML}
          ${filesHTML}
          <div class="item-actions-row">${actionsHTML}</div>
        </div>
      </div>
    `;

    // ── SWIPE LEFT TO DELETE ──
    if (isAdmin && !isCurrent) {
      const inner = card.querySelector('.card-inner');
      const deleteBg = card.querySelector('.swipe-delete-bg');
      let sx = 0, sy = 0, swiping = false, confirmed = false;

      card.addEventListener('touchstart', (e) => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        swiping = false; confirmed = false;
        inner.style.transition = 'none';
      }, { passive: true });

      card.addEventListener('touchmove', (e) => {
        const dx = e.touches[0].clientX - sx;
        const dy = e.touches[0].clientY - sy;
        if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) swiping = true;
        if (!swiping || dx > 0) return;
        inner.style.transform = `translateX(${dx}px)`;
        confirmed = dx < -90;
        deleteBg.style.opacity = Math.min(1, Math.abs(dx) / 90);
      }, { passive: true });

      card.addEventListener('touchend', () => {
        inner.style.transition = 'transform 0.25s ease';
        if (confirmed) {
          if (confirm('Ви дійсно хочете видалити цей пункт програми?')) {
            inner.style.transform = 'translateX(-110%)';
            card.style.transition = 'opacity 0.2s';
            card.style.opacity = '0';
            setTimeout(() => socket.emit('deleteItem', index), 220);
            if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('warning');
          } else {
            inner.style.transform = 'translateX(0)';
            deleteBg.style.opacity = 0;
          }
        } else {
          inner.style.transform = 'translateX(0)';
          deleteBg.style.opacity = 0;
        }
      });
    }

    // ── LONG-PRESS DRAG & DROP ──
    if (isAdmin) {
      let pressTimer = null, isDragging = false;
      let clone = null, fromIndex = index, toIndex = index;

      const handle = card.querySelector('.drag-handle');
      if (!handle) { els.timeline.appendChild(card); return; }

      handle.addEventListener('touchstart', (e) => {
        e.stopPropagation();
        pressTimer = setTimeout(() => {
          isDragging = true;
          fromIndex = index;
          toIndex = index;
          if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('heavy');

          const rect = card.getBoundingClientRect();
          clone = card.cloneNode(true);
          Object.assign(clone.style, {
            position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
            width: rect.width + 'px', zIndex: '999', opacity: '0.9',
            boxShadow: '0 12px 32px rgba(0,0,0,0.3)', pointerEvents: 'none',
            borderRadius: '12px', transition: 'none', margin: '0'
          });
          document.body.appendChild(clone);
          card.style.opacity = '0.25';
        }, 400);
      }, { passive: true });

      handle.addEventListener('touchmove', (e) => {
        clearTimeout(pressTimer);
        if (!isDragging || !clone) return;
        e.preventDefault();
        const touch = e.touches[0];
        const cRect = clone.getBoundingClientRect();
        clone.style.top = (touch.clientY - cRect.height / 2) + 'px';

        // Find which card we're hovering
        clone.style.pointerEvents = 'none';
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const overCard = el?.closest('[data-index]');
        if (overCard) {
          const oi = parseInt(overCard.dataset.index);
          if (!isNaN(oi) && oi !== toIndex) {
            toIndex = oi;
            document.querySelectorAll('.item-card').forEach(c => c.classList.remove('drop-target'));
            overCard.classList.add('drop-target');
          }
        }
      }, { passive: false });

      const finishDrag = () => {
        clearTimeout(pressTimer);
        if (!isDragging) return;
        isDragging = false;
        if (clone) { clone.remove(); clone = null; }
        card.style.opacity = '';
        document.querySelectorAll('.item-card').forEach(c => c.classList.remove('drop-target'));

        if (toIndex !== fromIndex) {
          const dir = toIndex > fromIndex ? 1 : -1;
          const steps = Math.abs(toIndex - fromIndex);
          let cur = fromIndex;
          for (let i = 0; i < steps; i++) {
            socket.emit('moveItem', { index: cur, direction: dir });
            cur += dir;
          }
          if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('medium');
        }
      };

      handle.addEventListener('touchend', finishDrag);
      handle.addEventListener('touchcancel', finishDrag);
    }

    els.timeline.appendChild(card);
  });

  if (isAdmin) {
    const addBtn = document.createElement('button');
    addBtn.className = 'btn-small primary';
    addBtn.style.width = '100%';
    addBtn.style.marginTop = '16px';
    addBtn.style.padding = '12px';
    addBtn.textContent = '➕ Додати пункт';
    addBtn.onclick = () => {
      els.editIndex.value = -1;
      els.editItemId.value = '';
      els.editTitle.value = '';
      els.editType.value = 'standard';
      els.editAssignee.value = '';
      els.editDuration.value = 5;
      els.editSound.value = '';
      els.editMedia.value = '';
      els.editChords.value = '';
      if (els.editAttachmentsList) els.editAttachmentsList.innerHTML = `<div style="font-size:13px;color:var(--tg-hint)">Збережіть пункт, щоб додавати файли</div>`;
      els.editModal.classList.add('open');
    };
    els.timeline.appendChild(addBtn);
  }

  startTimerLoop();
}

// ── Attachment UI ──
function renderEditAttachments(item) {
  if (!els.editAttachmentsList) return;
  const list = item.attachments || [];
  if (!list.length) {
    els.editAttachmentsList.innerHTML = `<div style="font-size:13px;color:var(--tg-hint)">Файли не прикріплені</div>`;
    return;
  }
  els.editAttachmentsList.innerHTML = list.map(a => `
    <div class="attachment-row">
      <span class="attachment-icon">${getFileIcon(a.type)}</span>
      <span class="attachment-name">${a.name}</span>
      <a href="${a.url}" target="_blank" class="attachment-open">Відкрити</a>
      <button class="attachment-del" onclick="deleteAttachment('${item.id}','${a.url}')">×</button>
    </div>
  `).join('');
}

window.deleteAttachment = (itemId, url) => {
  if (!confirm('Ви дійсно хочете видалити цей файл?')) return;
  const filename = url.split('/').pop();
  fetch(`/upload/${programId}/${itemId}/${filename}`, { method: 'DELETE' });
  const item = state.items.find(i => i.id === itemId);
  if (item) { item.attachments = item.attachments.filter(a => a.url !== url); renderEditAttachments(item); }
};

window.handleFileUpload = async (input) => {
  const file = input.files[0];
  if (!file) return;
  const itemId = els.editItemId.value;
  if (!itemId) return;

  let customName = prompt('Введіть назву для файлу:', file.name);
  if (customName === null) {
    input.value = '';
    return;
  }
  customName = customName.trim() || file.name;

  els.uploadProgress.classList.remove('hidden');
  els.uploadProgress.textContent = `⏳ Завантаження ${customName}...`;
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('customName', customName);
  
  try {
    const res = await fetch(`/upload/${programId}/${itemId}`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.ok) {
      els.uploadProgress.textContent = `✅ ${file.name} додано!`;
      setTimeout(() => els.uploadProgress.classList.add('hidden'), 2000);
      const item = state.items.find(i => i.id === itemId);
      if (item) renderEditAttachments(item);
    } else {
      throw new Error(data.error || "Невідома помилка");
    }
  } catch (e) {
    els.uploadProgress.textContent = `❌ Помилка: ${e.message}`;
    setTimeout(() => els.uploadProgress.classList.add('hidden'), 4000);
  } finally {
    input.value = '';
  }
};

// ── Modals ──
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
  els.editItemId.value = item.id;
  els.editTitle.value = item.title || '';
  els.editType.value = item.type || 'standard';
  els.editAssignee.value = item.assignee || '';
  els.editDuration.value = Math.floor(item.duration / 60);
  els.editSound.value = item.cues?.sound || '';
  els.editMedia.value = item.cues?.media || '';
  els.editChords.value = item.content?.chords || '';
  renderEditAttachments(item);
  els.editModal.classList.add('open');
};

els.btnSaveEdit.onclick = () => {
  const index = parseInt(els.editIndex.value);
  const updatedData = {
    title: els.editTitle.value || "Без назви",
    type: els.editType.value,
    assignee: els.editAssignee.value,
    duration: parseInt(els.editDuration.value || 5) * 60,
    sound: els.editSound.value,
    media: els.editMedia.value,
    chords: els.editChords.value
  };

  if (index === -1) {
    socket.emit('addItem', updatedData);
  } else {
    socket.emit('updateItem', { index, updatedData });
  }

  els.editModal.classList.remove('open');
  if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
};

// ── Settings & Share ──
els.headerTitle.onclick = () => {
  if (!isAdmin) return;
  els.settingsTitle.value = state.title || "Програма";
  els.settingsModal.classList.add('open');
};

els.btnSaveSettings.onclick = () => {
  socket.emit('updateProgramSettings', { title: els.settingsTitle.value });
  els.settingsModal.classList.remove('open');
};

els.btnShare.onclick = () => {
  const url = `https://t.me/ProgramLive_bot/app?startapp=${programId}`;
  const text = state.title || "Програма Служіння";
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
};

// ── Live Controls ──
els.btnPrev.onclick = () => socket.emit('setActiveItem', state.activeItemIndex - 1);
els.btnNext.onclick = () => socket.emit('setActiveItem', state.activeItemIndex + 1);
els.btnLive.onclick = () => socket.emit('toggleLive');
