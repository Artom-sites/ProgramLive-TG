const fs = require('fs');
let code = fs.readFileSync('public/index.html', 'utf8');

const oldModalSection = /<div style="margin-top:24px; padding-top:24px; border-top:1px solid var\(--border-subtle\);">[\s\S]*?Сповістити прив'язані групи\n        <\/button>\n      <\/div>/;

const newModalSection = `<div style="margin-top:24px; padding-top:24px; border-top:1px solid var(--border-subtle);">
        <h4 style="margin:0 0 12px 0; color:var(--tg-text);">🔔 Автоматичні сповіщення</h4>
        <div style="font-size:13px; color:var(--tg-hint); margin-bottom:12px; line-height:1.4;">
          Сповіщення надсилаються автоматично під час Live-режиму.
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 8px; font-size: 14px;">
          <span style="color:var(--tg-text);">Прив'язані групи:</span>
          <strong id="linkedChatsCount" style="color:var(--tg-text);">0</strong>
        </div>
        <div style="display:flex; justify-content:space-between; margin-bottom: 16px; font-size: 14px;">
          <span style="color:var(--tg-text);">Особисті підписники:</span>
          <strong id="privateSubscribersCount" style="color:var(--tg-text);">0</strong>
        </div>
        
        <div id="linkedChatsList" style="margin-bottom: 16px; display:flex; flex-direction:column; gap:6px;"></div>

        <button id="btnDeepLinkGroup" class="btn-primary" style="width:100%; background:var(--tg-btn); display:flex; justify-content:center; align-items:center; gap:8px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Прив'язати групу
        </button>
      </div>`;

code = code.replace(oldModalSection, newModalSection);
// Cache bust
code = code.replace('src="app.js?v=20"', 'src="app.js?v=21"');

fs.writeFileSync('public/index.html', code);
console.log("Patched HTML modal.");
