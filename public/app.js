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
let originalStartParam = tg?.initDataUnsafe?.start_param || urlParams.get('id') || null;
let programId = originalStartParam;
let notifyToken = '';
if (originalStartParam && originalStartParam.includes('_')) {
  const parts = originalStartParam.split('_');
  programId = parts[0];
  notifyToken = parts[1];
}

window.openAttachment = function(url, name, type) {
  if (name.toLowerCase().endsWith('.pdf') || type === 'application/pdf') {
    if (typeof openPdfViewer === 'function') {
      openPdfViewer(url, name);
      return;
    }
  }
  tg.openLink(window.location.origin + url);
};

let myProgramsCache = null;
let socket = io({ auth: { programId, initData: tg?.initData || '', notifyToken } });




let state = { items: [], isLive: false, activeItemId: null, liveStartTime: null };
let serverTimeOffset = 0;
let isAdmin = false;
let isSubscribed = false;
let linkedChats = [];
let linkedChatsMeta = {};
let privateSubscribers = [];
let privateSubscribersMeta = {};
let timerInterval = null;
let explicitlyExpandedItems = new Set();
let collapsedItems = new Set();

const els = {
  shareModal: document.getElementById('shareModal'),
  btnCloseShare: document.getElementById('btnCloseShare'),
  btnShareGroup: document.getElementById('btnShareGroup'),
  btnSharePerson: document.getElementById('btnSharePerson'),
  btnResetSchedule: document.getElementById('btnResetSchedule'),

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

socket.on('recipientsUpdate', (data) => {
  linkedChats = data.linkedChats || [];
  linkedChatsMeta = data.linkedChatsMeta || {};
  privateSubscribers = data.privateSubscribers || [];
  privateSubscribersMeta = data.privateSubscribersMeta || {};
  if (els.settingsModal && els.settingsModal.classList.contains('open')) {
    openSettingsModal();
  }
});
socket.on('init', (data) => {
  try {
    state = data.state;
    isAdmin = data.isAdmin;
    serverTimeOffset = Date.now() - data.serverTime;
    linkedChats = data.linkedChats || [];
    linkedChatsMeta = data.linkedChatsMeta || {};
    privateSubscribers = data.privateSubscribers || [];
    privateSubscribersMeta = data.privateSubscribersMeta || {};

    if (isAdmin) { els.bottomBar.classList.remove('hidden'); console.log('[Recipients Debug] linkedChats: ', linkedChats, 'privateSubscribers: ', privateSubscribers); }
    else els.bottomBar.classList.add('hidden');
    
    isSubscribed = !!data.isSubscribed;
    if (els.btnSubscribe) els.btnSubscribe.style.display = 'inline-flex';
    if (els.btnSubscribe) els.btnSubscribe.classList.remove('hidden');
    updateSubscribeUI();
    
    render();
    
    // First-time subscription prompt
    if (!isSubscribed) {
      const promptKey = 'hasSeenSubPrompt_' + programId;
      if (!localStorage.getItem(promptKey)) {
        localStorage.setItem(promptKey, 'true');
        if (tg && tg.showPopup) {
          // slight delay so the UI renders first
          setTimeout(() => {
            tg.showPopup({
              title: 'Сповіщення 🔔',
              message: 'Бажаєте отримувати особисті повідомлення, якщо в розкладі відбудуться зміни?',
              buttons: [
                { id: 'yes', text: 'Так, увімкнути', type: 'default' },
                { id: 'no', text: 'Ні, дякую', type: 'destructive' }
              ]
            }, (btnId) => {
              if (btnId === 'yes') {
                if (els.btnSubscribe) els.btnSubscribe.click();
              }
            });
          }, 500);
        }
      }
    }
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
        <button class="btn-small" style="margin-top:12px; width:100%; background:var(--bg-card); color:var(--tg-text); border:1px solid var(--border-subtle);" onclick="
          const el = document.getElementById('chords-${item.id}');
          if (el.style.display === 'none') {
            el.style.display = 'block';
            this.innerText = 'Приховати текст';
          } else {
            el.style.display = 'none';
            this.innerText = 'Показати текст / акорди';
          }
        ">Показати текст / акорди</button>

        <div id="chords-${item.id}" style="display:none; margin-top:8px; background:var(--bg-card); padding:12px; border-radius:8px; border:1px solid var(--border-subtle); font-family:monospace; white-space:pre-wrap; font-size:13px; color:var(--tg-text); overflow-x:auto; line-height:1.5;">${item.content.chords}</div>
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
        item.attachments.map(a => `<a href="#" onclick="openAttachment('${a.url}', '${a.name}', '${a.type}'); return false;" class="file-chip">${getFileIcon(a.type)} ${a.name}</a>`).join('') +
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

      const finishDrag = (e) => {
        if (e && e.cancelable) e.preventDefault();
        clearTimeout(pressTimer);
        if (!isDragging) return;
        isDragging = false;
        if (clone) { clone.remove(); clone = null; }
        card.style.opacity = '';
        document.querySelectorAll('.item-card').forEach(c => c.classList.remove('drop-target'));

        if (toIndex !== fromIndex) {
          // Send single reorder event instead of loop to avoid race conditions
          socket.emit('reorderItem', { fromIndex, toIndex });
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
      setEditType('sermon', 'Проповідь');
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
  
  if (window.prefetchPdf && state.items) {
    const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);
    const prefetchItems = [];
    if (currentIndex !== -1) {
      prefetchItems.push(state.items[currentIndex]);
      if (currentIndex + 1 < state.items.length) prefetchItems.push(state.items[currentIndex + 1]);
    } else if (state.items.length > 0) {
      prefetchItems.push(state.items[0]);
    }
    
    prefetchItems.forEach(item => {
      if (item.attachments) {
        item.attachments.forEach(a => {
          if (a.name.toLowerCase().endsWith('.pdf') || a.type === 'application/pdf') {
            window.prefetchPdf(a.url);
          }
        });
      }
    });
  }
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
      renderEditAttachments();
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    els.uploadProgress.textContent = `❌ Помилка: ${e.message}`;
    setTimeout(() => els.uploadProgress.classList.add('hidden'), 4000);
  }
  input.value = '';
};



function setEditType(type, titleToSet, forceShowTitle = false) {
  els.editType.value = type;
  let btnTitle = '';
  document.querySelectorAll('.type-btn').forEach(btn => {
    const isActive = btn.dataset.type === type;
    btn.classList.toggle('active', isActive);
    if (isActive) btnTitle = btn.dataset.title;
  });
  
  if (titleToSet !== undefined) els.editTitle.value = titleToSet;
  
  const titleGroup = document.getElementById('titleGroup');
  if (type === 'standard' || forceShowTitle || (els.editTitle.value !== btnTitle && els.editTitle.value !== '')) {
    titleGroup.style.display = 'block';
  } else {
    titleGroup.style.display = 'none';
  }

  const labelEl = document.getElementById('assigneeLabel');
  if (labelEl) {
    switch (type) {
      case 'sermon':
      case 'prayer':
      case 'solo':
        labelEl.innerText = "Ім'я";
        els.editAssignee.placeholder = "Наприклад: О. Скрипник";
        break;
      case 'song':
        labelEl.innerText = "Назва пісні";
        els.editAssignee.placeholder = "Наприклад: Великий Бог";
        break;
      case 'ensemble':
      case 'choir':
      case 'orchestra':
        labelEl.innerText = "Назва колективу";
        els.editAssignee.placeholder = "Наприклад: Основний хор";
        break;
      case 'standard':
      default:
        labelEl.innerText = "Виконавець / Назва";
        els.editAssignee.placeholder = "Введіть...";
        break;
    }
  }
}

document.querySelectorAll('.type-btn').forEach(btn => {
  btn.onclick = () => {
    setEditType(btn.dataset.type, btn.dataset.title);
    if (btn.dataset.type !== 'standard') {
       els.editAssignee.focus();
    } else {
       els.editTitle.focus();
    }
  };
});

window.openEdit = (index) => {
  const item = state.items[index];
  if (!item) return;
  els.editIndex.value = index;
  els.editItemId.value = item.id;
  
  els.editTitle.value = item.title || '';
  setEditType(item.type || 'standard', item.title || '');
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
  
  const totalCount = linkedChats.length + privateSubscribers.length;
  document.getElementById('recipientsTotalCount').innerText = totalCount;
  
  const listEl = document.getElementById('recipientsList');
  listEl.innerHTML = '';
  
  const createItem = (id, name, icon, type) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.background = 'var(--bg-card)';
    item.style.padding = '8px 12px';
    item.style.borderRadius = '6px';
    item.style.fontSize = '13px';
    item.style.color = 'var(--tg-text)';
    
    const titleSpan = document.createElement('span');
    titleSpan.innerHTML = `${icon} ${name}`;
    titleSpan.style.overflow = 'hidden';
    titleSpan.style.textOverflow = 'ellipsis';
    titleSpan.style.whiteSpace = 'nowrap';
    titleSpan.style.maxWidth = '70%';
    
    const unlinkBtn = document.createElement('button');
    unlinkBtn.innerText = 'Видалити';
    unlinkBtn.className = 'btn-secondary';
    unlinkBtn.style.padding = '6px 12px';
    unlinkBtn.style.fontSize = '12px';
    unlinkBtn.style.color = 'var(--c-danger)';
    unlinkBtn.style.border = 'none';
    unlinkBtn.style.background = 'rgba(239, 68, 68, 0.1)';
    unlinkBtn.onclick = () => {
      if (confirm('Видалити отримувача?')) {
        socket.emit(type === 'group' ? 'unlinkGroup' : 'unlinkPrivate', id);
        if (type === 'group') linkedChats = linkedChats.filter(x => x !== id);
        else privateSubscribers = privateSubscribers.filter(x => x !== id);
        openSettingsModal();
      }
    };
    
    item.appendChild(titleSpan);
    item.appendChild(unlinkBtn);
    listEl.appendChild(item);
  };

  linkedChats.forEach(chatId => {
    const title = linkedChatsMeta[chatId] || 'Група';
    createItem(chatId, title, '👥', 'group');
  });
  
  privateSubscribers.forEach(uid => {
    const title = privateSubscribersMeta[uid] || 'Користувач';
    createItem(uid, title, '👤', 'private');
  });

  if (els.btnResetSchedule) {
    if (state.isLive) {
      els.btnResetSchedule.style.opacity = '0.5';
      els.btnResetSchedule.style.pointerEvents = 'none';
    } else {
      els.btnResetSchedule.style.opacity = '1';
      els.btnResetSchedule.style.pointerEvents = 'auto';
    }
  }

  els.settingsModal.classList.add('open');
};
document.getElementById('btnSettingsHeader').onclick = openSettingsModal;




if (els.btnResetSchedule) {
  els.btnResetSchedule.onclick = () => {
    if (state.isLive) {
      if (tg && tg.showAlert) tg.showAlert("Спочатку зупиніть Live-режим (Stop Live), щоб очистити розклад.");
      else alert("Спочатку зупиніть Live-режим (Stop Live), щоб очистити розклад.");
      return;
    }
    if (confirm("Підготувати нову програму?\n\nПоточний розклад буде повністю очищено.\nУсі отримувачі (групи та люди) залишаться.")) {
      socket.emit('resetProgramSchedule');
      els.settingsModal.classList.remove('open');
    }
  };
}

els.btnSaveSettings.onclick = () => {
  socket.emit('updateProgramSettings', { title: els.settingsTitle.value });
  els.settingsModal.classList.remove('open');
};

els.btnShare.onclick = () => {
  if (!programId) return;
  els.shareModal.classList.add('open');
};

els.btnCloseShare.onclick = () => {
  els.shareModal.classList.remove('open');
};

els.btnShareGroup.onclick = () => {
  if (tg && tg.openTelegramLink) {
    tg.openTelegramLink('https://t.me/ProgramLive_bot?startgroup=' + programId);
  }
};

els.btnSharePerson.onclick = () => {
  if (tg && tg.switchInlineQuery) {
    try {
      tg.switchInlineQuery(String(programId), ['users']);
    } catch(e) {
      if (tg.showAlert) tg.showAlert('Ця функція не підтримується у вашій версії Telegram.');
    }
  } else {
    if (tg && tg.showAlert) tg.showAlert('Ця функція не підтримується у вашій версії Telegram.');
  }
};

// ── Live Controls ──
els.btnPrev.onclick = () => {
  const currentIndex = state.items.findIndex(i => i.id === state.activeItemId);
  if (currentIndex > 0) {
    state.activeItemId = state.items[currentIndex - 1].id;
    render();
    if (state.isLive) state.liveStartTime = Date.now(); socket.emit('setActiveItem', state.activeItemId);
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
  if (state.isLive) state.liveStartTime = Date.now(); socket.emit('setActiveItem', state.activeItemId);
};
els.btnLive.onclick = () => {
  state.isLive = !state.isLive;
  if (state.isLive && (!state.activeItemId || !state.items.some(i => i.id === state.activeItemId)) && state.items.length > 0) {
    state.activeItemId = state.items[0].id;
  }
  render();
  socket.emit('toggleLive', Intl.DateTimeFormat().resolvedOptions().timeZone);
};


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
          if (tg && tg.showPopup) {
            tg.showPopup({
              title: 'Увімкнути сповіщення',
              message: 'Щоб отримувати сповіщення, перейдіть у бот і натисніть Start.',
              buttons: [{ type: 'ok', id: 'open_bot', text: 'Перейти в бот' }, { type: 'cancel' }]
            }, (btnId) => {
              if (btnId === 'open_bot') tg.openTelegramLink('https://t.me/ProgramLive_bot?start=subscribe_' + programId);
            });
          } else if (tg) {
             tg.openTelegramLink('https://t.me/ProgramLive_bot?start=subscribe_' + programId);
          }
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

// ── HOME VIEW LOGIC ──
function renderHomeProgramList(programs, listEl) {
  if (programs.length === 0) {
    listEl.innerHTML = `
    <div style="text-align: center; color: var(--tg-hint); margin: 60px 20px;">
      <div style="font-size: 64px; margin-bottom: 24px;">📂</div>
      <h3 style="color: var(--tg-theme-text-color, #000); margin-bottom: 12px; font-size: 20px;">У вас ще немає програм</h3>
      <p style="font-size: 15px; line-height: 1.5; margin-bottom: 32px; color: var(--tg-hint);">
        Створіть свою першу програму, щоб почати працювати з розкладом, додавати пункти та ноти.
      </p>
      <button onclick="createProgramFromHome()" class="btn-primary" style="width:100%; border-radius:14px; font-size:16px;">
        <span style="margin-right:8px; font-size:18px;">➕</span> Створити програму
      </button>
    </div>
  `;
    return;
  }
  listEl.innerHTML = programs.map(p => `
    <div class="action-card" onclick="window.openProgram('${p.id}')" style="
      margin-bottom: 12px; 
      display: flex; justify-content: space-between; align-items: center;
      padding: 16px 20px;
    ">
      <div style="display:flex; align-items:center; gap: 16px;">
        <div style="width:48px; height:48px; border-radius:14px; background:var(--tg-btn); color:var(--tg-btn-text); display:flex; align-items:center; justify-content:center; font-size:24px; box-shadow:0 4px 12px rgba(0,0,0,0.1);">
          📋
        </div>
        <div>
          <div style="font-size: 17px; font-weight: 700; color: var(--tg-text); margin-bottom: 4px;">${p.title}</div>
          <div style="font-size: 13px; color: var(--tg-hint); display:flex; align-items:center; gap:6px;">
            <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:var(--tg-hint); opacity:0.5;"></span>
            ${p.itemCount} пунктів
          </div>
        </div>
      </div>
      ${p.isLive ? `<div style="background: rgba(239, 68, 68, 0.15); color: var(--c-danger); font-size: 11px; font-weight: 800; padding: 4px 8px; border-radius: 6px; letter-spacing: 0.5px;">LIVE</div>` : ''}
    </div>
  `).join('');
}

function initHomeView() {
  document.querySelector('.app-header').style.display = 'none';
  document.getElementById('timeline').style.display = 'none';
  const bb = document.getElementById('bottomBar'); if(bb) bb.classList.add('hidden');
  
  
  
  let homeDiv = document.getElementById('home-view');
  if (!homeDiv) {
    homeDiv = document.createElement('div');
    homeDiv.id = 'home-view';
    homeDiv.className = 'home-view';
    document.body.insertBefore(homeDiv, document.body.firstChild);
  }
  homeDiv.style.display = 'block';
  
  homeDiv.innerHTML = `
    <div style="padding: 24px 20px; font-family: sans-serif; color: var(--tg-text); min-height: 100vh; display: flex; flex-direction: column;">
      <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 28px;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">Мої програми</h1>
        <div style="font-size: 14px; color: var(--tg-hint);">Керуйте розкладами та трансляціями</div>
      </div>
      
      <div id="home-programs-list" style="flex: 1;"></div>
      
      <div style="margin-top: 24px; position: sticky; bottom: 24px;">
        <button class="btn-primary" style="width: 100%; padding: 16px; border-radius: 16px; font-size: 16px; box-shadow: 0 4px 16px rgba(51, 144, 236, 0.3); display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="createProgramFromHome()">
          <span style="font-size: 20px;">➕</span> Створити програму
        </button>
      </div>
    </div>
  `;
  
  const list = document.getElementById('home-programs-list');
  const t0 = performance.now();
  
  if (myProgramsCache) {
    renderHomeProgramList(myProgramsCache, list);
    console.log(`[Home Perf] cached render: ${Math.round(performance.now() - t0)}ms`);
  } else {
    // Show skeleton if network is slow
    const loaderTimer = setTimeout(() => {
      if (!myProgramsCache) {
        list.innerHTML = `
          <div style="background: var(--tg-theme-secondary-bg-color, #f5f5f5); height: 70px; border-radius: 12px; margin-bottom: 12px; opacity: 0.6; animation: pulse 1.5s infinite;"></div>
          <div style="background: var(--tg-theme-secondary-bg-color, #f5f5f5); height: 70px; border-radius: 12px; margin-bottom: 12px; opacity: 0.6; animation: pulse 1.5s infinite;"></div>
        `;
      }
    }, 150);
  }

  const t1 = performance.now();
  socket.emit('getMyPrograms', (res) => {
    console.log(`[Home Perf] server refresh: ${Math.round(performance.now() - t1)}ms`);
    if (!res || !res.success) {
      if (!myProgramsCache) list.innerHTML = `<span style="color:var(--tg-theme-destructive-text-color, red)">Помилка завантаження</span>`;
      return;
    }
    myProgramsCache = res.programs;
    renderHomeProgramList(myProgramsCache, list);
  });
}

window.createProgramFromHome = function() {
  // Telegram Mini Apps block native prompt(), so we use a custom modal
  let modal = document.getElementById('create-prog-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'create-prog-modal';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000;';
    modal.innerHTML = `
      <div style="background: var(--tg-theme-bg-color, #fff); padding: 20px; border-radius: 12px; width: 80%; max-width: 300px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
        <h3 style="margin-top:0; color: var(--tg-text);">Нова програма</h3>
        <input type="text" id="create-prog-input" placeholder="Назва програми..." style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid var(--tg-hint); border-radius: 8px; font-size: 16px; box-sizing: border-box; background: var(--tg-theme-secondary-bg-color, #f5f5f5); color: var(--tg-text);">
        <div style="display: flex; justify-content: space-between;">
          <button id="create-prog-cancel" class="btn-small" style="background: transparent; color: var(--tg-text); border: 1px solid var(--tg-hint);">Скасувати</button>
          <button id="create-prog-confirm" class="btn-small primary">Створити</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('create-prog-cancel').onclick = () => { modal.style.display = 'none'; };
    document.getElementById('create-prog-confirm').onclick = () => {
      const title = document.getElementById('create-prog-input').value.trim() || 'Нова програма';
      modal.style.display = 'none';
      
      socket.emit('createNewProgram', title, (res) => {
        if (res && res.success && res.programId) {
          window.openProgram(res.programId);
        } else {
          if (tg?.showAlert) tg.showAlert("Помилка створення програми");
          else alert("Помилка створення програми");
        }
      });
    };
  }
  
  document.getElementById('create-prog-input').value = '';
  modal.style.display = 'flex';
  document.getElementById('create-prog-input').focus();
};

window.openProgram = function(id) {
  programId = id;
  const homeDiv = document.getElementById('home-view');
  if (homeDiv) homeDiv.style.display = 'none';
  
  document.querySelector('.app-header').style.display = 'flex';
  document.getElementById('timeline').style.display = 'block';
  
  
  // Reconnect socket to new room
  socket.auth.programId = id;
  socket.disconnect().connect();
  
  if (tg?.BackButton && !tg?.initDataUnsafe?.start_param) {
    tg.BackButton.show();
    tg.BackButton.onClick(handleProgramBack);
  }
};

window.goHome = function(forceReload = false) {
  if (forceReload) {
    window.location.href = window.location.pathname;
    return;
  }
  
  // Try SPA navigation
  programId = null;
  document.querySelector('.app-header').style.display = 'none';
  document.getElementById('timeline').style.display = 'none';
  const bb = document.getElementById('bottomBar'); if(bb) bb.classList.add('hidden');
  const errView = document.getElementById('error-view');
  if (errView) errView.remove();
  
  if (tg?.BackButton) {
    tg.BackButton.hide();
    tg.BackButton.offClick(handleProgramBack);
  }
  
  socket.auth.programId = null;
  socket.disconnect().connect();
  
  initHomeView();
};

if (!programId) {
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", initHomeView); } else { initHomeView(); }
} else {
  // If loaded directly via deep link, BackButton might still be needed if it was previously closed by PDF? No, deep links don't have BackButton to Home.
}

// Override original goHome that did full reload
window.goHomeOriginal = window.goHome;

// ── NAVIGATION & BACK BUTTON ──
function handleProgramBack() {
  const pdfViewer = document.getElementById('pdf-viewer');
  if (pdfViewer && pdfViewer.style.display === 'flex') {
    return; // Let PDF viewer's listener handle it
  }
  window.goHome(false);
}

// Remove the inline error handler string that used goHome() with parens, update it:
socket.on('programError', (errCode) => {
  if (errCode === 'PROGRAM_NOT_FOUND') {
    document.querySelector('.app-header').style.display = 'none';
    document.getElementById('timeline').style.display = 'none';
  const bb = document.getElementById('bottomBar'); if(bb) bb.classList.add('hidden');
    const homeDiv = document.getElementById('home-view');
    if (homeDiv) homeDiv.style.display = 'none';
    
    let errView = document.getElementById('error-view');
    if (!errView) {
      errView = document.createElement('div');
      errView.id = 'error-view';
      document.body.appendChild(errView);
    }
    
    errView.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--tg-text); font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
        <h2>Програму не знайдено 😕</h2>
        <p style="color: var(--tg-hint); margin-bottom: 20px;">Можливо, посилання застаріло, або програму було видалено.</p>
        <button class="btn-primary" onclick="goHome(false)" style="padding: 12px 24px;">До моїх програм</button>
      </div>
    `;
  }
});
