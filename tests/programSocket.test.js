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
          for (let key in data) {
            if (key === 'state') {
              mockDb.docs[id].state = { ...mockDb.docs[id].state, ...data.state };
            } else if (key.includes('.')) {
              const [k1, k2] = key.split('.');
              if (!mockDb.docs[id][k1]) mockDb.docs[id][k1] = {};
              if (data[key] && data[key]._mock === 'delete') {
                delete mockDb.docs[id][k1][k2];
              } else {
                mockDb.docs[id][k1][k2] = data[key];
              }
            } else {
              mockDb.docs[id][key] = data[key];
            }
          }
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
  exports: { db: mockDb, storage: {} }
};

// 3. Mock dependencies that require bot
const notifyPath = require.resolve('../services/notifications');
require.cache[notifyPath] = {
  id: notifyPath,
  filename: notifyPath,
  loaded: true,
  exports: {
    verifyBotCanMessage: async () => true,
    sendLiveStarted: async () => {},
    scheduleProgramChangeNotification: async () => {} 
  }
};
let notifySpies = { scheduleCount: 0 };
require.cache[notifyPath].exports.scheduleProgramChangeNotification = async () => {
  notifySpies.scheduleCount++;
};

const authPath = require.resolve('../services/telegramAuth');
require.cache[authPath] = {
  id: authPath,
  filename: authPath,
  loaded: true,
  exports: {
    validateTelegramInitData: (data) => {
       if (data === 'admin_data') return { id: 'admin1', first_name: 'Admin' };
       if (data === 'viewer_data') return { id: 'viewer1', first_name: 'Viewer' };
       return null;
    }
  }
};

// Now import the module to test
const { setupSockets } = require('../socket/programSocket');

// Helper to create mock socket
async function createMockSocket(isAdmin = true) {
  let handlers = {};
  let emitted = [];
  let rooms = [];
  
  const socket = {
    handshake: { auth: { programId: 'test-prog', initData: isAdmin ? 'admin_data' : 'viewer_data' }, query: {} },
    data: {},
    join: (room) => rooms.push(room),
    on: (event, handler) => { handlers[event] = handler; },
    emit: (event, data) => { emitted.push({ event, data }); }
  };
  
  let connectionHandler = null;
  const io = {
    to: (room) => ({
      emit: (event, data) => { emitted.push({ room, event, data }); }
    }),
    on: (event, handler) => { if (event === 'connection') connectionHandler = handler; }
  };
  
  setupSockets(io, {}, mockDb, 'DUMMY');
  if (connectionHandler) await connectionHandler(socket);
  
  return { io, socket, handlers, emitted, rooms };
}

describe('ProgramSocket Handlers', () => {
  
  beforeEach(() => {
    mockDb.docs = {
      'test-prog': {
        ownerId: 'admin1',
        admins: ['admin1'],
        state: {
          isLive: true,
          activeItemId: 'item-1',
          liveStartTime: 1000,
          items: [
            { id: 'item-1', title: 'One' },
            { id: 'item-2', title: 'Two' }
          ]
        }
      }
    };
    notifySpies.scheduleCount = 0;
  });
  
  it('registers all required core handlers', async () => {
    const { handlers } = await createMockSocket();
    
    const requiredHandlers = [
      'toggleSubscription', 'toggleLive', 'resetProgramSchedule', 
      'reorderItem', 'updateProgramSettings', 'updateItem', 
      'deleteItem', 'setActiveItem'
    ];
    
    for (const h of requiredHandlers) {
      assert.ok(handlers[h], `Missing handler: ${h}`);
    }
  });

  it('Admin setActiveItem updates state and timer', async () => {
    const { handlers, emitted } = await createMockSocket(true); 
    
    await handlers['setActiveItem']('item-2');
    
    const dbDoc = mockDb.docs['test-prog'].state;
    assert.strictEqual(dbDoc.activeItemId, 'item-2');
    assert.ok(dbDoc.liveStartTime > 1000, 'liveStartTime should have updated');
    
    const updateEvent = emitted.find(e => e.event === 'stateUpdate');
    assert.ok(updateEvent);
    assert.strictEqual(updateEvent.data.activeItemId, 'item-2');
    assert.ok(updateEvent.data.liveStartTime > 1000);
    
    assert.strictEqual(notifySpies.scheduleCount, 0, 'setActiveItem should not schedule notifications');
  });

  it('setActiveItem when offline does NOT start live', async () => {
    // Modify initial state for this test
    mockDb.docs['test-prog'].state.isLive = false;
    mockDb.docs['test-prog'].state.liveStartTime = null;
    
    const { handlers } = await createMockSocket(true);
    await handlers['setActiveItem']('item-2');
    
    const dbDoc = mockDb.docs['test-prog'].state;
    assert.strictEqual(dbDoc.activeItemId, 'item-2');
    assert.strictEqual(dbDoc.isLive, false, 'Should remain offline');
    assert.strictEqual(dbDoc.liveStartTime, null, 'liveStartTime should remain null');
  });

  it('Viewer setActiveItem is blocked', async () => {
    const { handlers, emitted } = await createMockSocket(false);
    
    await handlers['setActiveItem']('item-2');
    
    const dbDoc = mockDb.docs['test-prog'].state;
    assert.strictEqual(dbDoc.activeItemId, 'item-1', 'State should remain item-1');
    assert.strictEqual(dbDoc.liveStartTime, 1000, 'Timer should not reset');
    
    const updateEvent = emitted.find(e => e.event === 'stateUpdate' && e.data && e.data.activeItemId === 'item-2');
    assert.ok(!updateEvent, 'Should not emit stateUpdate for item-2');
  });

  it('Invalid itemId is blocked in setActiveItem', async () => {
    const { handlers } = await createMockSocket(true);
    
    await handlers['setActiveItem']('does-not-exist');
    
    const dbDoc = mockDb.docs['test-prog'].state;
    assert.strictEqual(dbDoc.activeItemId, 'item-1', 'State should not change for invalid ID');
  });
  
  it('reorderItem triggers notification and activeItem survives', async () => {
    const { handlers } = await createMockSocket(true);
    
    // initially activeItemId is 'item-1', items are [item-1, item-2]
    await handlers['reorderItem']({ fromIndex: 0, toIndex: 1 });
    
    assert.strictEqual(notifySpies.scheduleCount, 1, 'reorderItem should schedule notification when Live');
    
    // Verify item-1 is now at index 1
    const dbDoc = mockDb.docs['test-prog'].state;
    assert.strictEqual(dbDoc.items[0].id, 'item-2');
    assert.strictEqual(dbDoc.items[1].id, 'item-1');
    
    // Verify activeItemId SURVIVED the reorder and is still item-1
    assert.strictEqual(dbDoc.activeItemId, 'item-1', 'activeItemId should remain item-1 even if its index changed');
  });

});
