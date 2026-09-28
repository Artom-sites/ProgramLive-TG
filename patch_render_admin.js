const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

code = code.replace(
  "els.timeline.appendChild(addBtn);\n  }",
  "els.timeline.appendChild(addBtn);\n  } else {\n    const div = document.createElement('div');\n    div.style.padding = '20px';\n    div.style.textAlign = 'center';\n    div.style.color = 'var(--tg-hint)';\n    div.textContent = 'Ви переглядаєте програму. Тільки адміністратори можуть додавати пункти.';\n    els.timeline.appendChild(div);\n  }"
);

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js to show read-only message.");
