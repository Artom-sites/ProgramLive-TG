const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

// 1. Replace Set variables
code = code.replace("let expandedItems = new Set();", "let explicitlyExpandedItems = new Set();\nlet collapsedItems = new Set();");

// 2. Replace the isExpanded line and onclick handler
const oldExpansionLogic = /const isExpanded = expandedItems\.has\(item\.id\);\n\n    const card = document\.createElement\('div'\);\n    card\.dataset\.index = index;\n    card\.className = \`item-card \$\{isCurrent \? 'is-active' : ''\} \$\{isPast \? 'is-past' : ''\} \$\{isExpanded \? 'expanded' : ''\}\`;\n\n    \/\/ Toggle expand on tap \(not during swipe\)\n    card\.onclick = \(e\) => \{\n      if \(e\.target\.tagName === 'BUTTON' \|\| e\.target\.closest\('button'\) \|\| e\.target\.closest\('a'\)\) return;\n      if \(e\.target\.closest\('\.drag-handle'\)\) return;\n      if \(expandedItems\.has\(item\.id\)\) expandedItems\.delete\(item\.id\);\n      else expandedItems\.add\(item\.id\);\n      render\(\);\n    \};/;

const newExpansionLogic = `const isDefaultExpanded = (isCurrent || index === currentIndex + 1);
    const isExpanded = explicitlyExpandedItems.has(item.id) || (isDefaultExpanded && !collapsedItems.has(item.id));

    const card = document.createElement('div');
    card.dataset.index = index;
    card.className = \`item-card \$\{isCurrent ? 'is-active' : ''\} \$\{isPast ? 'is-past' : ''\} \$\{isExpanded ? 'expanded' : ''\}\`;

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
    };`;

code = code.replace(oldExpansionLogic, newExpansionLogic);

// 3. Inject chords into detailsHTML and remove the button
const oldDetailsAndActions = /const detailsHTML = \`\n      <div class="detail-row"><span class="detail-label">Хто:<\/span><span class="detail-val">\$\{item\.assignee \|\| '—'\}<\/span><\/div>\n      \$\{item\.cues\?\.sound \? \`<div class="detail-row"><span class="detail-label">Звук:<\/span><span class="detail-val">\$\{item\.cues\.sound\}<\/span><\/div>\` : ''\}\n      \$\{item\.cues\?\.media \? \`<div class="detail-row"><span class="detail-label">Медіа:<\/span><span class="detail-val">\$\{item\.cues\.media\}<\/span><\/div>\` : ''\}\n    \`;\n\n    \/\/ Action buttons\n    let actionsHTML = '';\n    if \(item\.content\?\.chords\) \{\n      actionsHTML \+= \`<button class="btn-small" onclick="openContent\('\$\{item\.title\}', \\\`\$\{item\.content\.chords\}\\\`\)">Акорди\/Текст<\/button>\`;\n    \}/;

const newDetailsAndActions = `const detailsHTML = \`
      <div class="detail-row"><span class="detail-label">Хто:</span><span class="detail-val">\$\{item.assignee || '—'\}</span></div>
      \$\{item.cues?.sound ? \`<div class="detail-row"><span class="detail-label">Звук:</span><span class="detail-val">\$\{item.cues.sound\}</span></div>\` : ''\}
      \$\{item.cues?.media ? \`<div class="detail-row"><span class="detail-label">Медіа:</span><span class="detail-val">\$\{item.cues.media\}</span></div>\` : ''\}
      \$\{item.content?.chords ? \`
        <div style="margin-top:12px; background:var(--bg-color, #f4f4f5); padding:12px; border-radius:8px; border:1px solid var(--border-subtle, #e5e7eb); font-family:monospace; white-space:pre-wrap; font-size:13px; color:var(--tg-text); overflow-x:auto; line-height:1.5;">
          \$\{item.content.chords\}
        </div>
      \` : ''\}
    \`;

    // Action buttons
    let actionsHTML = '';`;

code = code.replace(oldDetailsAndActions, newDetailsAndActions);

// Cache bust index.html
let indexCode = fs.readFileSync('public/index.html', 'utf8');
indexCode = indexCode.replace('src="app.js?v=21"', 'src="app.js?v=22"');
fs.writeFileSync('public/index.html', indexCode);

fs.writeFileSync('public/app.js', code);
console.log("Patched chords expansion.");
