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
  const doc = await db.collection('programs').doc(programId).get();
  let data = null;
  if (doc.exists) {
    data = doc.data();
    if (data.items && !data.state) {
      data = { ownerId: null, admins: [], state: { title: "Програма", ...data } };
    }
    if (!data.state.title) data.state.title = "Програма";
  } else {
    data = { ownerId: null, admins: [], state: DEFAULT_STATE };
    await db.collection('programs').doc(programId).set(data);
  }

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

async function updateProgramState(programId, stateUpdates) {
  const data = await getProgramData(programId);
  const newState = { ...data.state, ...stateUpdates };
  await db.collection('programs').doc(programId).update({ state: newState });
  return newState;
}

module.exports = {
  getProgramData,
  updateProgramState,
  DEFAULT_STATE,
  generateId
};
