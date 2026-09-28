const fs = require('fs');
let code = fs.readFileSync('public/index.html', 'utf8');

code = code.replace(
    '<button id="btnShare"',
    `<button id="btnSubscribe" class="btn-icon hidden" aria-label="Сповіщення" style="margin-right:8px; display:none;">
        <svg id="iconBell" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
      </button>\n      <button id="btnShare"`
);

// Bust cache to v=20
code = code.replace('src="app.js?v=19"', 'src="app.js?v=20"');
fs.writeFileSync('public/index.html', code);
console.log("Patched HTML.");
