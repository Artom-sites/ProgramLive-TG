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
const startParam = tg?.initDataUnsafe?.start_param || urlParams.get('id') || 'default';
let programId = startParam;
let notifyToken = '';
if (startParam.includes('_')) {
  const parts = startParam.split('_');
  programId = parts[0];
  notifyToken = parts[1];
}
const socket = io({ auth: { programId, initData: tg?.initData || '', notifyToken } });

let state = { items: [], isLive: false, activeItemId: null, liveStartTime: null };
let serverTimeOffset = 0;
let isAdmin = false;
let isSubscribed = false;
let linkedChats = [];
let linkedChatsMeta = {};
let privateSubscribersCount = 0;
let timerInterval = null;
let explicitlyExpandedItems = new Set();
let collapsedItems = new Set();

const els = {
  liveBadge: document.getElementById('liveBadge'),
  timeline: document.getElementById('timeline'),
  bottomBar: document.getElementById('bottomBar'),
  btnPrev: document.getElementById('btnPrev'),
  btnNext: document.getElementById('btnNext'),
  btnLive: document.getElementById('btnLive'),
  btnSubscribe: document.getElementById('btnSubscribe'),
  iconBell: document.getElementById('iconBell'),
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
  try {
    state = data.state;
    isAdmin = data.isAdmin;
    serverTimeOffset = Date.now() - data.serverTime;

    if (isAdmin) els.bottomBar.classList.remove('hidden');
    else els.bottomBar.classList.add('hidden');
    
    isSubscribed = !!data.isSubscribed;
    if (!isAdmin) {
      if (els.btnSubscribe) els.btnSubscribe.style.display = 'inline-flex';
      if (els.btnSubscribe) els.btnSubscribe.classList.remove('hidden');
      updateSubscribeUI();
    }
    
    render();
  } catch(e) {
    console.error('Init Error:', e);
  }
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
    const activeItem = state.items.find(i => i.id === state.activeItemId);
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
  document.getElementById('btnSettingsHeader').classList.toggle('hidden', !isAdmin);

  if (state.isLive) {
    els.liveBadge.classList.remove('hidden');
    els.btnLive.classList.add('active');
    els.btnLive.textContent = "STOP LIVE";
  } else {
    els.liveBadge.classList.add('hidden');
    els.btnLive.classList.remove('active');
    els.btnLive.textContent = "START LIVE";
  }
  const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);
  els.btnPrev.disabled = currentIndex <= 0;
  els.btnNext.disabled = currentIndex === -1 || currentIndex >= state.items.length - 1;

  els.timeline.innerHTML = '';

  state.items.forEach((item, index) => {
    const isCurrent = item.id === state.activeItemId;
    const isPast = currentIndex !== -1 && index < currentIndex;
    const isDefaultExpanded = (isCurrent || index === currentIndex + 1);
    const isExpanded = explicitlyExpandedItems.has(item.id) || (isDefaultExpanded && !collapsedItems.has(item.id));

    const card = document.createElement('div');
    card.dataset.index = index;
    card.className = `item-card ${isCurrent ? 'is-active' : ''} ${isPast ? 'is-past' : ''} ${isExpanded ? 'expanded' : ''}`;

    // Toggle expand on tap (not during swipe)
    card.onclick = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.closest('a')) return;
      if (e.target.closest('.drag-handle')) return;
      
      const currentlyExpanded = explicitlyExpandedItems.has(item.id) || (isDefaultExpanded && !collapsedItems.has(item.id));
      if (currentlyExpanded) {
        explicitlyExpandedItems.delete(item.id);
        collapsedItems.add(item.id);
      } else {
        collapsedItems.delete(item.id);
        explicitlyExpandedItems.add(item.id);
      }
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
      ${item.content?.chords ? `
        <div class="chords-container" style="margin-top:12px; background:var(--bg-color, #f4f4f5); padding:12px; border-radius:8px; border:1px solid var(--border-subtle, #e5e7eb); font-family:monospace; white-space:pre-wrap; font-size:13px; color:var(--tg-text); overflow-x:auto; line-height:1.5;">
          <div class="chords-content" id="chords-${item.id}" style="max-height:150px; overflow-y:hidden; transition: max-height 0.3s ease;">${item.content.chords}</div>
          <button class="btn-small" style="width:100%; margin-top:8px; background:var(--tg-btn); color:var(--tg-text-btn); display:${item.content.chords.split('\n').length > 7 ? 'block' : 'none'};" onclick="
            const el = document.getElementById('chords-${item.id}');
            if(el.style.maxHeight === '150px') {
              el.style.maxHeight = '2000px';
              this.innerText = 'Згорнути текст';
            } else {
              el.style.maxHeight = '150px';
              this.innerText = 'Розгорнути текст';
            }
          ">Розгорнути текст</button>
        </div>
      ` : ''}
    `;

    // Action buttons
    let actionsHTML = '';
    if (isAdmin) {
      actionsHTML += `<button class="btn-small primary" onclick="openEdit(${index})">Редагувати</button>`;
      if (!isCurrent) {
        actionsHTML += `<button class="btn-small" onclick="socket.emit('setActiveItem', '${item.id}')">Зробити активним</button>`;
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
      currentEditAttachments = [];
      renderEditAttachments();
      els.editModal.classList.add('open');
    };
    els.timeline.appendChild(addBtn);
  } else {
    const div = document.createElement('div');
    div.style.padding = '20px';
    div.style.textAlign = 'center';
    div.style.color = 'var(--tg-hint)';
    div.textContent = 'Ви переглядаєте програму. Тільки адміністратори можуть додавати пункти.';
    els.timeline.appendChild(div);
  }

  startTimerLoop();
}

// ── Attachment UI ──
function renderEditAttachments() {
  if (!els.editAttachmentsList) return;
  const list = currentEditAttachments || [];
  if (!list.length) {
    els.editAttachmentsList.innerHTML = `<div style="font-size:13px;color:var(--tg-hint)">Файли не прикріплені</div>`;
    return;
  }
  els.editAttachmentsList.innerHTML = list.map((a, idx) => `
    <div class="attachment-row">
      <span class="attachment-icon">${getFileIcon(a.type)}</span>
      <span class="attachment-name">${a.name}</span>
      <button type="button" class="attachment-del" onclick="removeTempAttachment(${idx})">×</button>
    </div>
  `).join('');
}

window.removeTempAttachment = (idx) => {
  currentEditAttachments.splice(idx, 1);
  renderEditAttachments();
};




function askFileName(defaultName) {
  return new Promise((resolve) => {
    const modal = document.getElementById('renameModal');
    const renameInput = document.getElementById('renameInput');
    renameInput.value = defaultName;
    modal.classList.add('open');
    modal.style.display = 'flex';
    
    document.getElementById('btnRenameUpload').onclick = () => {
      modal.classList.remove('open');
      modal.style.display = '';
      resolve(renameInput.value.trim() || defaultName);
    };
    
    document.getElementById('btnRenameCancel').onclick = () => {
      modal.classList.remove('open');
      modal.style.display = '';
      resolve(null);
    };
  });
}

window.handleFileUpload = async (input) => {
  const file = input.files[0];
  if (!file) return;

  const customName = await askFileName(file.name);
  if (customName === null) {
    input.value = '';
    return;
  }

  els.uploadProgress.classList.remove('hidden');
  els.uploadProgress.textContent = `⏳ Завантаження ${customName}...`;
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('customName', customName);
  formData.append('userId', tg.initDataUnsafe?.user?.id || 0);
  
  try {
    const res = await fetch(`/upload/telegram`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.ok) {
      els.uploadProgress.textContent = `✅ ${file.name} додано!`;
      setTimeout(() => els.uploadProgress.classList.add('hidden'), 2000);
      currentEditAttachments.push({ url: data.url, name: data.name, type: data.type, file_id: data.file_id });
      renderEditAttachmentsLocal();
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    els.uploadProgress.textContent = `❌ Помилка: ${e.message}`;
    setTimeout(() => els.uploadProgress.classList.add('hidden'), 4000);
  }
  input.value = '';
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
  
  currentEditAttachments = item ? [...(item.attachments || [])] : [];
  renderEditAttachments();
  
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
    chords: els.editChords.value,
    attachments: currentEditAttachments
  };

  if (index === -1) {
    socket.emit('addItem', updatedData);
  } else {
    socket.emit('updateItem', { index, updatedData });
  }
  els.editModal.classList.remove('open');
};

const openSettingsModal = () => {
  if (!isAdmin) return;
  els.settingsTitle.value = state.title || "Програма";
  document.getElementById('linkedChatsCount').innerText = linkedChats.length;
  document.getElementById('privateSubscribersCount').innerText = privateSubscribersCount;
  
  const listEl = document.getElementById('linkedChatsList');
  listEl.innerHTML = '';
  linkedChats.forEach(chatId => {
    const title = linkedChatsMeta[chatId] || ('Група ' + chatId);
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.background = 'var(--bg-color)';
    item.style.padding = '8px 12px';
    item.style.borderRadius = '6px';
    item.style.fontSize = '13px';
    item.style.color = 'var(--tg-text)';
    
    const titleSpan = document.createElement('span');
    titleSpan.innerText = title;
    titleSpan.style.overflow = 'hidden';
    titleSpan.style.textOverflow = 'ellipsis';
    titleSpan.style.whiteSpace = 'nowrap';
    titleSpan.style.maxWidth = '60%';
    
    const unlinkBtn = document.createElement('button');
    unlinkBtn.innerText = 'Від\'єднати';
    unlinkBtn.className = 'btn-secondary';
    unlinkBtn.style.padding = '4px 8px';
    unlinkBtn.style.fontSize = '12px';
    unlinkBtn.onclick = () => {
      if (confirm('Від\'єднати цю групу?')) {
        socket.emit('unlinkGroup', chatId);
        linkedChats = linkedChats.filter(id => id !== chatId);
        openSettingsModal(); // refresh
      }
    };
    
    item.appendChild(titleSpan);
    item.appendChild(unlinkBtn);
    listEl.appendChild(item);
  });
  els.settingsModal.classList.add('open');
};

els.headerTitle.onclick = openSettingsModal;
document.getElementById('btnSettingsHeader').onclick = openSettingsModal;

const btnDeep = document.getElementById('btnDeepLinkGroup');
if (btnDeep) {
  btnDeep.onclick = () => {
    if (tg && tg.openTelegramLink) {
      tg.openTelegramLink('https://t.me/ProgramLive_bot?startgroup=' + programId);
    }
  };
}

els.btnSaveSettings.onclick = () => {
  socket.emit('updateProgramSettings', { title: els.settingsTitle.value });
  els.settingsModal.classList.remove('open');
};

els.btnShare.onclick = () => {
  if (!programId) return;

  if (tg && tg.switchInlineQuery) {
    try {
      tg.switchInlineQuery(String(programId), ['users', 'groups', 'channels']);
    } catch(e) {
      console.warn('Fallback switchInlineQuery', e);
      try {
        tg.switchInlineQuery(String(programId));
      } catch(e2) {
        if (tg.showAlert) tg.showAlert('Не вдалося відкрити меню поширення.');
      }
    }
  } else {
    console.error('Telegram WebApp switchInlineQuery is not available');
    if (tg && tg.showAlert) tg.showAlert('Ця функція не підтримується на вашому пристрої. Оновіть Telegram.');
  }
};

// ── Live Controls ──
els.btnPrev.onclick = () => {
  const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);
  if (currentIndex > 0) {
    state.activeItemId = state.items[currentIndex - 1].id;
    render();
    socket.emit('setActiveItem', state.activeItemId);
  }
};
els.btnNext.onclick = () => {
  const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);
  if (currentIndex !== -1 && currentIndex < state.items.length - 1) {
    state.activeItemId = state.items[currentIndex + 1].id;
  } else if (currentIndex === -1 && state.items.length > 0) {
    state.activeItemId = state.items[0].id;
  }
  render();
  socket.emit('setActiveItem', state.activeItemId);
};
els.btnLive.onclick = () => socket.emit('toggleLive');


function updateSubscribeUI() {
  if (isSubscribed) {
    if (els.btnSubscribe) els.btnSubscribe.style.color = 'var(--tg-hint, #999)';
    if (els.iconBell) els.iconBell.innerHTML = `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path><line x1="2" y1="2" x2="22" y2="22"></line>`;
  } else {
    if (els.btnSubscribe) els.btnSubscribe.style.color = 'var(--tg-text, #000)';
    if (els.iconBell) els.iconBell.innerHTML = `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>`;
  }
}

if (els.btnSubscribe) {
  els.btnSubscribe.onclick = () => {
    if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    els.btnSubscribe.style.opacity = '0.5';
    socket.emit('toggleSubscription', (res) => {
      els.btnSubscribe.style.opacity = '1';
      if (res.error) {
        if (res.error === 'BOT_BLOCKED') {
          if (tg) tg.showAlert("Щоб отримувати особисті сповіщення, спочатку відкрийте @ProgramLive_bot і натисніть Start.");
        } else {
          if (tg) tg.showAlert("Помилка підписки.");
        }
        return;
      }
      isSubscribed = res.subscribed;
      updateSubscribeUI();
      if (tg) {
        tg.showPopup({ 
          title: isSubscribed ? "Сповіщення увімкнені" : "Сповіщення вимкнені", 
          message: isSubscribed ? "Ви будете отримувати повідомлення про зміни." : "Ви більше не будете отримувати сповіщення." 
        });
      }
    });
  };
}
