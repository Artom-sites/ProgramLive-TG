const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const oldInit = `    if (isAdmin) els.bottomBar.classList.remove('hidden');
    else els.bottomBar.classList.add('hidden');
    render();`;

const newInit = `    if (isAdmin) els.bottomBar.classList.remove('hidden');
    else els.bottomBar.classList.add('hidden');
    
    isSubscribed = !!data.isSubscribed;
    if (!isAdmin) {
      if (els.btnSubscribe) els.btnSubscribe.style.display = 'inline-flex';
      if (els.btnSubscribe) els.btnSubscribe.classList.remove('hidden');
      updateSubscribeUI();
    }
    
    render();`;

code = code.replace(oldInit, newInit);

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js init.");
