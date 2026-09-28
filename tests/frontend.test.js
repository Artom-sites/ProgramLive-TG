const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');

describe('Frontend SPA Invariants', () => {
  const appJs = fs.readFileSync('public/app.js', 'utf8');

  it('declares myProgramsCache', () => {
    assert.ok(appJs.includes('let myProgramsCache = null;'), 'Must have myProgramsCache');
  });

  it('implements SWR pattern', () => {
    assert.ok(appJs.includes('if (myProgramsCache) {'), 'Must check cache first');
    assert.ok(appJs.includes("socket.emit('getMyPrograms'"), 'Must fetch in background');
  });

  it('implements openProgram without location.href', () => {
    assert.ok(appJs.includes('window.openProgram = function(id)'), 'Must have openProgram');
    assert.ok(!appJs.includes("window.location.href = '?id=' + id;"), 'openProgram must not full reload');
    assert.ok(appJs.includes('socket.disconnect().connect()'), 'Must cleanly reconnect socket');
  });

  it('implements delayed skeleton loader', () => {
    assert.ok(appJs.includes('setTimeout(() => {'), 'Must delay loader');
    assert.ok(appJs.includes('150)'), 'Delay must be ~150ms');
  });
});
