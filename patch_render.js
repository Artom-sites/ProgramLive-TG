const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const replacement = `
function renderEditAttachments(item) {
  if (!els.editAttachmentsList) return;
  const list = currentEditAttachments || [];
  if (!list.length) {
    els.editAttachmentsList.innerHTML = \`<div style="font-size:13px;color:var(--tg-hint)">Файли не прикріплені</div>\`;
    return;
  }
  els.editAttachmentsList.innerHTML = list.map((a, idx) => \`
    <div class="attachment-row">
      <span class="attachment-icon">\${getFileIcon(a.type)}</span>
      <span class="attachment-name">\${a.name}</span>
      <button class="btn-close" style="color:var(--tg-destructive); margin-left:auto;" onclick="removeTempAttachment(\${idx})">&times;</button>
    </div>
  \`).join('');
}

window.removeTempAttachment = (idx) => {
  currentEditAttachments.splice(idx, 1);
  renderEditAttachments(null);
};
`;

code = code.replace(/function renderEditAttachments\(item\) \{[\s\S]*?deleteFile\(item.id, '${a.name}', '${a.url}'\)"\)\)>&times;<\/button>\n    <\/div>\n  `\)\.join\(''\);\n\}/, replacement);
fs.writeFileSync('public/app.js', code);
