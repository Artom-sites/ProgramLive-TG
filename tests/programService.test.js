const { test, describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// Mock db
const mockDb = { docs: {}, collection: (name) => ({ doc: (id) => ({
  get: async () => ({ exists: !!mockDb.docs[id], data: () => mockDb.docs[id] }),
  set: async (d) => { mockDb.docs[id] = d; },
  update: async (d) => { mockDb.docs[id] = { ...mockDb.docs[id], ...d }; }
}) }) };

const fbPath = require.resolve('../config/firebase');
require.cache[fbPath] = {
  id: fbPath,
  filename: fbPath,
  loaded: true,
  exports: { db: mockDb, storage: {} }
};

const { getProgramData } = require('../programs/programService');

describe('ProgramService Migrations', () => {
  beforeEach(() => {
    mockDb.docs = {};
  });

  it('migrates activeItemIndex to activeItemId', async () => {
    mockDb.docs['prog-mig'] = {
      state: {
        activeItemIndex: 1, // legacy index
        items: [
          { id: 'i1', title: 'One' },
          { id: 'i2', title: 'Two' }
        ]
      },
      admins: []
    };
    
    const data = await getProgramData('prog-mig');
    assert.strictEqual(data.state.activeItemId, 'i2');
    assert.strictEqual(data.state.activeItemIndex, undefined);
  });
  
  it('handles missing items during migration gracefully', async () => {
    mockDb.docs['prog-mig-bad'] = {
      state: {
        activeItemIndex: 5, // out of bounds
        items: [
          { id: 'i1', title: 'One' }
        ]
      },
      admins: []
    };
    
    const data = await getProgramData('prog-mig-bad');
    assert.strictEqual(data.state.activeItemId, null);
    assert.strictEqual(data.state.activeItemIndex, undefined);
  });
});
