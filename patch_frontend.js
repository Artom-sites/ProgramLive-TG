const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

// 1. Add let currentEditAttachments = [];
code = code.replace("let state = { items: [], isLive: false };", "let state = { items: [], isLive: false };\nlet currentEditAttachments = [];");

// 2. In openItemEdit, initialize it
code = code.replace("renderEditAttachments(item);", "currentEditAttachments = item ? [...(item.attachments || [])] : [];\n  renderEditAttachmentsLocal();");

// 3. Define renderEditAttachmentsLocal
const renderLocal = `
window.renderEditAttachmentsLocal = () => {
  els.editAttachmentsList.innerHTML = '';
  if (currentEditAttachments.length === 0) return;
  currentEditAttachments.forEach((a, idx) => {
    const d = document.createElement('div');
    d.className = 'attachment-item';
    d.innerHTML = \`<a href="\${a.url}" target="_blank">\${a.name}</a> <button type="button" class="btn-close" style="color:var(--tg-destructive);" onclick="removeTempAttachment(\${idx})">&times;</button>\`;
    els.editAttachmentsList.appendChild(d);
  });
};
window.removeTempAttachment = (idx) => {
  currentEditAttachments.splice(idx, 1);
  renderEditAttachmentsLocal();
};
`;
code = code.replace("window.renderEditAttachments = (item) => {", renderLocal + "\nwindow.renderEditAttachments = (item) => {");

// 4. Update save btn to include attachments
code = code.replace("chords: els.editChords.value\n  };", "chords: els.editChords.value,\n    attachments: currentEditAttachments\n  };");

// 5. Update handleFileUpload
const handleUploadNew = `
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
`;
// find and replace the whole handleFileUpload
code = code.replace(/window\.handleFileUpload = async \(input\) => \{[\s\S]*?input\.value = '';\n\};/, handleUploadNew);

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js successfully.");
