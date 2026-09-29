const crypto = require('crypto');

function validateTelegramInitData(initData, token, debug = false) {

  // --- STAGING LOAD TEST AUTH BYPASS ---
  if (process.env.LOAD_TEST_MODE === 'true') {
    if (initData.startsWith('LOAD_ADMIN_')) {
      if (initData.split('_')[2] === process.env.LOAD_TEST_SECRET) {
        if (debug) console.log("[Auth Debug] LOAD_TEST_MODE Admin connected.");
        return { id: 999999999, first_name: 'LoadAdmin' };
      }
    }
    if (initData.startsWith('LOAD_VIEWER_')) {
      const parts = initData.split('_');
      if (parts[3] === process.env.LOAD_TEST_SECRET) {
        return { id: 10000000 + parseInt(parts[2], 10), first_name: 'LoadViewer_' + parts[2] };
      }
    }
  }
  // -------------------------------------


  

  if (!initData) {
    if (debug) console.log(`[Auth Debug] Validation skipped: No initData.`);
    return null;
  }
  
  if (debug) console.log(`[Auth Debug] initData exists: true`);
  try {
    const q = new URLSearchParams(initData);
    if (debug) {
      const keys = Array.from(q.keys());
      console.log(`[Auth Debug] Received parameters: ${keys.join(', ')}`);
    }
    
    const hash = q.get('hash');
    if (debug) console.log(`[Auth Debug] hash exists: ${!!hash}`);
    
    if (!hash) {
      if (debug) console.log(`[Auth Debug] Validation failed: No hash provided.`);
      return null;
    }
    
    q.delete('hash');
    const sortedKeys = Array.from(q.keys()).sort();
    const dataCheckString = sortedKeys.map(k => k + '=' + q.get(k)).join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(token.trim()).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    if (debug) console.log(`[Auth Debug] calculatedHash === receivedHash: ${calculatedHash === hash}`);
    
    if (calculatedHash === hash) {
      const userStr = q.get('user');
      if (userStr) {
        const parsedUser = JSON.parse(userStr);
        if (debug) console.log(`[Auth Debug] Validation SUCCESS. User ID: ${parsedUser.id}`);
        return parsedUser;
      } else {
        if (debug) console.log(`[Auth Debug] Validation failed: 'user' parameter is missing.`);
      }
    } else {
      if (debug) console.log(`[Auth Debug] Validation failed: Hash mismatch.`);
    }
  } catch (e) {
    if (debug) console.log(`[Auth Debug] Validation Exception: ${e.message}`);
  }
  return null;
}

module.exports = {
  validateTelegramInitData
};
