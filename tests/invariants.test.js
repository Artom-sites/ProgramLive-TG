const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('Codebase Invariants (Static Analysis)', () => {
  const appJs = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf8');
  const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const botHandlersJs = fs.readFileSync(path.join(__dirname, '../bot/handlers.js'), 'utf8');
  
  it('Frontend retains private share implementation', () => {
    assert.ok(
      appJs.includes(`switchInlineQuery(String(programId), ['users'])`), 
      'Frontend must use switchInlineQuery to share privately, restricting it to users'
    );
  });
  
  it('Frontend retains group share implementation', () => {
    assert.ok(
      appJs.includes(`tg.openTelegramLink('https://t.me/ProgramLive_bot?startgroup=' + programId)`),
      'Frontend must use startgroup to share to groups'
    );
  });
  
  it('Server retains webhook mode for production', () => {
    // Check that handlers.js registers webhook
    assert.ok(
      botHandlersJs.includes('app.use(webhookPath, express.json())') &&
      botHandlersJs.includes('app.post(webhookPath'),
      'bot/handlers.js must register the webhook route'
    );
    // Check that we don't accidentally call bot.launch() in production code
    assert.ok(
      !serverJs.includes('bot.launch()') && !botHandlersJs.includes('bot.launch()'),
      'Production code must not call bot.launch() to prevent 409 Conflict with Render webhook'
    );
  });
  
  it('Server retains file upload/download endpoints', () => {
    assert.ok(
      serverJs.includes("app.post('/upload/telegram'"),
      'Must retain /upload/telegram endpoint'
    );
    assert.ok(
      serverJs.includes("app.get('/download/telegram/:fileId'"),
      'Must retain /download/telegram proxy endpoint'
    );
  });
  
  it('Frontend Next/Prev logic boundary sanity check', () => {
    // Since Next/Prev logic is mixed in DOM handlers in app.js, we do a static check 
    // that state.activeItemId is what gets updated on next/prev, not old activeItemIndex.
    assert.ok(
      appJs.includes('state.activeItemId = state.items[currentIndex + 1].id'),
      'Next button must update activeItemId'
    );
    assert.ok(
      appJs.includes('state.activeItemId = state.items[currentIndex - 1].id'),
      'Prev button must update activeItemId'
    );
  });
  
  it('Frontend PDF Viewer integration invariants', () => {
    // PDF should use openAttachment, not tg.openLink directly in HTML
    assert.ok(
      appJs.includes("openAttachment('${a.url}'"),
      'Attachment click must route through openAttachment'
    );
    
    // openAttachment must differentiate PDF vs non-PDF
    assert.ok(
      appJs.includes("openPdfViewer(url, name)"),
      'openAttachment must call openPdfViewer for PDFs'
    );
    assert.ok(
      appJs.includes("tg.openLink(window.location.origin + url)"),
      'openAttachment must fallback to tg.openLink for non-PDFs'
    );
    
    const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
    assert.ok(
      indexHtml.includes('pdf-viewer.js'),
      'index.html must include pdf-viewer.js'
    );
    assert.ok(
      indexHtml.includes('pdf.min.js'),
      'index.html must include pdf.min.js locally'
    );
  });
});
