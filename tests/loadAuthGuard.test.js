const assert = require('node:assert');
const { test } = require('node:test');

test('Load Auth Guard (Startup)', async (t) => {
  const originalEnv = { ...process.env };
  const originalExit = process.exit;
  const originalError = console.error;

  let exitCalled = false;
  let exitCode = null;
  
  process.exit = (code) => {
    exitCalled = true;
    exitCode = code;
  };
  
  console.error = () => {}; // suppress logs during test
  
  // Need to invalidate cache since loadTestGuard caches nothing, just exports function
  const { validateLoadTestEnvironment } = require('../services/loadTestGuard');

  await t.test('allows normal production startup (no load test mode)', () => {
    process.env = { NODE_ENV: 'production', K_SERVICE: 'programlive' };
    exitCalled = false;
    validateLoadTestEnvironment();
    assert.strictEqual(exitCalled, false);
  });

  await t.test('rejects load test mode in production K_SERVICE', () => {
    process.env = { LOAD_TEST_MODE: 'true', K_SERVICE: 'programlive' };
    exitCalled = false;
    validateLoadTestEnvironment();
    assert.strictEqual(exitCalled, true);
    assert.strictEqual(exitCode, 1);
  });
  
  await t.test('rejects load test mode without secret', () => {
    process.env = { LOAD_TEST_MODE: 'true', K_SERVICE: 'programlive-staging' };
    exitCalled = false;
    validateLoadTestEnvironment();
    assert.strictEqual(exitCalled, true);
  });

  await t.test('allows local load test mode', () => {
    process.env = { 
      LOAD_TEST_MODE: 'true', 
      LOAD_TEST_ENV: 'local', 
      NODE_ENV: 'development', 
      LOAD_TEST_SECRET: 'test' 
    };
    exitCalled = false;
    validateLoadTestEnvironment();
    assert.strictEqual(exitCalled, false);
  });
  
  await t.test('rejects local load test if K_SERVICE is present', () => {
    process.env = { 
      LOAD_TEST_MODE: 'true', 
      LOAD_TEST_ENV: 'local', 
      K_SERVICE: 'programlive-staging',
      LOAD_TEST_SECRET: 'test' 
    };
    exitCalled = false;
    validateLoadTestEnvironment();
    assert.strictEqual(exitCalled, true);
  });

  await t.test('allows staging load test mode with correct K_SERVICE', () => {
    process.env = { 
      LOAD_TEST_MODE: 'true', 
      LOAD_TEST_ENV: 'staging', 
      K_SERVICE: 'programlive-staging',
      LOAD_TEST_SECRET: 'test' 
    };
    exitCalled = false;
    validateLoadTestEnvironment();
    assert.strictEqual(exitCalled, false);
  });

  await t.test('rejects staging load test mode with wrong K_SERVICE', () => {
    process.env = { 
      LOAD_TEST_MODE: 'true', 
      LOAD_TEST_ENV: 'staging', 
      K_SERVICE: 'programlive-other',
      LOAD_TEST_SECRET: 'test' 
    };
    exitCalled = false;
    validateLoadTestEnvironment();
    assert.strictEqual(exitCalled, true);
  });

  process.env = originalEnv;
  process.exit = originalExit;
  console.error = originalError;
});
