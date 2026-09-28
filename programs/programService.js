const { db } = require('../config/firebase');
const crypto = require('crypto');

// Base Default State for new programs
const DEFAULT_STATE = {
  title: "Нова програма",
  isLive: false,
  liveStartTime: null,
  activeItemId: null,
  items: []
};

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Database Helpers
async function getProgramData(programId) {
  if (!programId) return null;
  const doc = await db.collection('programs').doc(programId).get();
  if (!doc.exists) return null;

  let data = doc.data();
  if (data.items && !data.state) {
    data = { ownerId: data.ownerId || null, admins: data.admins || [], state: { title: "Програма", ...data } };
  }
  if (!data.state.title) data.state.title = "Програма";

  let changed = false;
  if (data.state && data.state.items) {
    data.state.items.forEach(item => {
      if (!item.id) {
        item.id = generateId();
        changed = true;
      }
    });

    if (data.state.activeItemIndex !== undefined && data.state.activeItemId === undefined) {
      const idx = data.state.activeItemIndex;
      if (data.state.items[idx]) {
        data.state.activeItemId = data.state.items[idx].id;
      } else {
        data.state.activeItemId = null;
      }
      delete data.state.activeItemIndex;
      changed = true;
    }
  }

  if (changed) {
    await db.collection('programs').doc(programId).set(data);
  }

  return data;
}

async function createProgram(programId, ownerId, title) {
  const newState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  newState.title = title || "Нова програма";
  
  const data = {
    ownerId: ownerId,
    admins: [ownerId],
    state: newState
  };
  
  await db.collection('programs').doc(programId).set(data);
  return data;
}

async function getUserPrograms(userId) {
  if (!userId) return [];
  const snapshot = await db.collection('programs').where('admins', 'array-contains', userId).get();
  return snapshot.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      title: d.state?.title || `Програма ${doc.id}`,
      isLive: d.state?.isLive || false,
      itemCount: d.state?.items?.length || 0
    };
  });
}

async function updateProgramState(programId, stateUpdates) {
  const data = await getProgramData(programId);
  if (!data) throw new Error("Program not found");
  const newState = { ...data.state, ...stateUpdates };
  await db.collection('programs').doc(programId).update({ state: newState });
  return newState;
}

module.exports = {
  getProgramData,
  createProgram,
  getUserPrograms,
  updateProgramState,
  DEFAULT_STATE,
  generateId
};
