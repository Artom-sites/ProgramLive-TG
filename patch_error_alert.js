const fs = require('fs');
let code = fs.readFileSync('public/app.js', 'utf8');

const oldInit = /socket\.on\('init', \(data\) => \{[\s\S]*?render\(\);\n\}\);/;
const newInit = `socket.on('init', (data) => {
  try {
    state = data.state;
    isAdmin = data.isAdmin;
    serverTimeOffset = Date.now() - data.serverTime;
    if (isAdmin) els.bottomBar.classList.remove('hidden');
    else els.bottomBar.classList.add('hidden');
    render();
  } catch(e) {
    els.headerTitle.textContent = "Error: " + e.message;
    alert("Init Error: " + e.message + "\\n" + e.stack);
  }
});`;

code = code.replace(oldInit, newInit);

const oldUpdate = /socket\.on\('stateUpdate', \(data\) => \{[\s\S]*?render\(\);\n\}\);/;
const newUpdate = `socket.on('stateUpdate', (data) => {
  try {
    state = data;
    serverTimeOffset = Date.now() - data.serverTime;
    render();
  } catch(e) {
    alert("Update Error: " + e.message);
  }
});`;

code = code.replace(oldUpdate, newUpdate);

fs.writeFileSync('public/app.js', code);
console.log("Patched app.js to show errors.");
