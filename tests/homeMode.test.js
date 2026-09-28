const { test, describe, beforeEach, it } = require('node:test');
const assert = require('node:assert');

// 1. Mock firebase-admin
const adminPath = require.resolve('firebase-admin/firestore');
require.cache[adminPath] = {
  id: adminPath,
  filename: adminPath,
  loaded: true,
  exports: {
    FieldValue: {
      delete: () => ({ _mock: 'delete' }),
      arrayRemove: (val) => ({ _mock: 'arrayRemove', val }),
      arrayUnion: (val) => ({ _mock: 'arrayUnion', val })
    }
  }
};

// 2. Mock firebase config
const mockDb = {
  docs: {},
  collection(name) {
    return {
      doc: (id) => ({
        get: async () => ({
          exists: !!mockDb.docs[id],
          data: () => mockDb.docs[id]
        }),
        set: async (data) => { mockDb.docs[id] = data; },
        update: async (data) => {
          if (!mockDb.docs[id]) return;
          mockDb.docs[id] = { ...mockDb.docs[id], ...data };
        }
      }),
      where: (field, op, val) => ({
        get: async () => {
          const results = [];
          for (const [id, doc] of Object.entries(mockDb.docs)) {
            if (field === 'admins' && op === 'array-contains' && doc.admins && doc.admins.includes(val)) {
              results.push({ id, data: () => doc });
            }
          }
          return { docs: results };
        }
      })
    };
  }
};

const fbPath = require.resolve('../config/firebase');
require.cache[fbPath] = {
  id: fbPath,
  filename: fbPath,
  loaded: true,
  exports: { db: mockDb }
};

const { getProgramData, getUserPrograms } = require('../programs/programService');

describe('ProgramService Home & Missing Programs', () => {

  beforeEach(() => {
    mockDb.docs = {
      'prog-A': { ownerId: 'user1', admins: ['user1'], state: { title: 'Prog A' } },
      'prog-B': { ownerId: 'user1', admins: ['user1'], state: { title: 'Prog B' } },
      'prog-C': { ownerId: 'user2', admins: ['user2'], state: { title: 'Prog C' } }
    };
  });

  it('B - getProgramData DOESNOTEXIST returns null, no document created', async () => {
    const data = await getProgramData('DOESNOTEXIST');
    assert.strictEqual(data, null);
    assert.strictEqual(mockDb.docs['DOESNOTEXIST'], undefined, "Should not create document automatically");
  });
  
  it('B2 - getProgramData "default" returns null, no document created', async () => {
    const data = await getProgramData('default');
    assert.strictEqual(data, null);
    assert.strictEqual(mockDb.docs['default'], undefined, "Should not create default program");
  });

  it('E - getUserPrograms returns only programs where user is admin', async () => {
    const progs1 = await getUserPrograms('user1');
    assert.strictEqual(progs1.length, 2);
    assert.ok(progs1.find(p => p.id === 'prog-A'));
    assert.ok(progs1.find(p => p.id === 'prog-B'));
    
    const progs2 = await getUserPrograms('user2');
    assert.strictEqual(progs2.length, 1);
    assert.strictEqual(progs2[0].id, 'prog-C');
    
    const progs3 = await getUserPrograms('user3');
    assert.strictEqual(progs3.length, 0);
  });

});
