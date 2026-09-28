const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const target = "const openSettingsModal = () => {";
const restore = `
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

`;

code = code.replace(target, restore + target);
fs.writeFileSync('public/app.js', code);
console.log("Restored missing code successfully.");
