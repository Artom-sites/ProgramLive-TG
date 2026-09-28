const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const startStr = "window.handleFileUpload = async (input) => {";
const endStr = "els.headerTitle.onclick = openSettingsModal;";

const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  const newUpload = `
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
  els.uploadProgress.textContent = \`⏳ Завантаження \${customName}...\`;
  
  const formData = new FormData();
  formData.append('file', file);
  formData.append('customName', customName);
  formData.append('userId', tg.initDataUnsafe?.user?.id || 0);
  
  try {
    const res = await fetch(\`/upload/telegram\`, { method: 'POST', body: formData });
    const data = await res.json();
    if (data.ok) {
      els.uploadProgress.textContent = \`✅ \${file.name} додано!\`;
      setTimeout(() => els.uploadProgress.classList.add('hidden'), 2000);
      currentEditAttachments.push({ url: data.url, name: data.name, type: data.type, file_id: data.file_id });
      renderEditAttachmentsLocal();
    } else {
      throw new Error(data.error);
    }
  } catch (e) {
    els.uploadProgress.textContent = \`❌ Помилка: \${e.message}\`;
    setTimeout(() => els.uploadProgress.classList.add('hidden'), 4000);
  }
  input.value = '';
};

const openSettingsModal = () => {
  if (!isAdmin) return;
  els.settingsTitle.value = state.title || "Програма";
  document.getElementById('linkCommandText').innerText = \`/link \${programId}\`;
  els.settingsModal.classList.add('open');
};

`;
  
  const newCode = code.substring(0, startIndex) + newUpload + code.substring(endIndex);
  fs.writeFileSync('public/app.js', newCode);
  console.log("Patched handleFileUpload successfully.");
} else {
  console.log("Could not find boundaries.");
}
