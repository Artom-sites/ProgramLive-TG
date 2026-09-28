const { test, describe, it } = require('node:test');
const assert = require('node:assert');
const { validateTelegramInitData } = require('../services/telegramAuth');
const crypto = require('crypto');

describe('Telegram Auth Validation', () => {
  it('rejects invalid or empty initData', () => {
    assert.strictEqual(validateTelegramInitData('', 'dummy-token'), null);
    assert.strictEqual(validateTelegramInitData('query_id=123', 'dummy-token'), null); // no hash
    assert.strictEqual(validateTelegramInitData('query_id=123&hash=abc', 'dummy-token'), null); // bad hash
  });
  
  it('validates correctly signed initData', () => {
    const BOT_TOKEN = 'test_token';
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    
    // Create valid payload
    const user = JSON.stringify({ id: 12345, first_name: 'Test' });
    const auth_date = Math.floor(Date.now() / 1000);
    const dataCheckString = `auth_date=${auth_date}\nuser=${user}`;
    
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    const initData = `user=${encodeURIComponent(user)}&auth_date=${auth_date}&hash=${hash}`;
    
    const parsed = validateTelegramInitData(initData, BOT_TOKEN, false); // disable dev fallback
    assert.ok(parsed);
    assert.strictEqual(parsed.id, 12345);
    assert.strictEqual(parsed.first_name, 'Test');
  });
});
