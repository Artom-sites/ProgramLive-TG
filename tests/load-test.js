const { io } = require('socket.io-client');
const { performance } = require('perf_hooks');

const args = process.argv.slice(2);
const options = {};
args.forEach(a => {
  if (a.startsWith('--users=')) options.users = parseInt(a.split('=')[1], 10);
  if (a.startsWith('--ramp=')) options.ramp = parseInt(a.split('=')[1], 10);
  if (a.startsWith('--duration=')) options.duration = parseInt(a.split('=')[1], 10);
});

const url = process.env.LOAD_TEST_URL;
const secret = process.env.LOAD_TEST_SECRET;

if (!url || !secret || !options.users || !options.ramp || !options.duration) {
  console.error("Usage:\nLOAD_TEST_URL=\"https://programlive-staging-...run.app\" \\\nLOAD_TEST_SECRET=\"...\" \\\nLOAD_TEST_CONFIRM=\"programlive-staging\" \\\nnpm run load:100");
  process.exit(1);
}

if (url.includes('onrender.com') || url.includes('programlive')) {
  if (process.env.LOAD_TEST_CONFIRM !== 'programlive-staging') {
    console.error("FATAL: URL looks like production. Must set LOAD_TEST_CONFIRM=programlive-staging to proceed.");
    process.exit(1);
  }
}

console.log(`Starting load test against ${url}`);
console.log(`Target: ${options.users} users | Ramp: ${options.ramp}s | Duration: ${options.duration}s`);

const PROGRAM_ID = 'LOADTEST1';

let connectedCount = 0;
let connectFailures = 0;
let disconnects = 0;
let reconnects = 0;

const pings = new Map(); // seq -> { sentAt, expectedRecipients, receivedBy: Set }
const latencies = [];
let stateUpdatesReceived = 0;

// Create Admin
const adminSocket = io(url, {
  auth: { programId: PROGRAM_ID, initData: `LOAD_ADMIN_${secret}` },
  transports: ['websocket']
});

let adminConnected = false;
adminSocket.on('connect', () => {
  console.log('Admin connected');
  adminConnected = true;
});
adminSocket.on('connect_error', (e) => console.error('Admin connect error:', e.message));

const viewers = [];

async function spawnViewer(i) {
  const socket = io(url, {
    auth: { programId: PROGRAM_ID, initData: `LOAD_VIEWER_${i}_${secret}` },
    transports: ['websocket']
  });

  socket.isConnected = false;

  socket.on('connect', () => {
    if (!socket.isConnected) {
      socket.isConnected = true;
      connectedCount++;
    }
  });
  
  socket.on('connect_error', () => {
    connectFailures++;
  });
  
  socket.on('disconnect', () => {
    if (socket.isConnected) {
      socket.isConnected = false;
      connectedCount--;
      disconnects++;
    }
  });
  
  socket.io.on("reconnect", () => {
    reconnects++;
    // reconnect also triggers standard 'connect' event in Socket.io,
    // so isConnected management prevents double counting.
  });

  socket.on('stateUpdate', () => {
     // Normal business state update received
     stateUpdatesReceived++;
  });

  socket.on('loadTestPong', ({ seq, sentAt }) => {
    const pingObj = pings.get(seq);
    if (pingObj && !pingObj.receivedBy.has(i)) {
      pingObj.receivedBy.add(i);
      latencies.push(performance.now() - sentAt);
    }
  });

  viewers.push(socket);
}

async function run() {
  console.log("Waiting for admin connection (15s timeout)...");
  let waitLoops = 0;
  while (!adminConnected && waitLoops < 15) {
    await new Promise(r => setTimeout(r, 1000));
    waitLoops++;
  }
  if (!adminConnected) {
    console.error("ABORT: Admin failed to connect.");
    process.exit(1);
  }

  // Ramp up
  const interval = (options.ramp * 1000) / options.users;
  for (let i = 1; i <= options.users; i++) {
    spawnViewer(i);
    await new Promise(r => setTimeout(r, interval));
  }
  
  console.log(`\nRamp completed. Holding for ${options.duration} seconds...`);
  console.log(`Requested: ${options.users}`);
  console.log(`Connected: ${connectedCount}`);
  console.log(`Failed: ${connectFailures}`);

  if (connectedCount < options.users * 0.95) {
    console.log("CONNECTION PHASE FAIL. Less than 95% connected.");
  }
  
  const testItems = ['load-item-1', 'load-item-2'];
  let currentItemIdx = 0;
  let actions = 0;
  
  const adminInterval = setInterval(() => {
    if (actions >= options.duration / 60) return;
    actions++;
    
    // Business action
    const itemId = testItems[currentItemIdx];
    currentItemIdx = (currentItemIdx + 1) % testItems.length;
    adminSocket.emit('setActiveItem', itemId);
    if (actions === 2) {
      // Throw in a reorder
      adminSocket.emit('reorderItem', { fromIndex: 0, toIndex: 1 });
    }
    if (actions === 4) {
      // Throw in an update
      adminSocket.emit('updateItem', { index: 0, updatedData: { title: 'Updated ' + Date.now() } });
    }
    
    // Telemetry ping immediately following business action
    const currentlyConnected = viewers.filter(v => v.isConnected).length;
    
    pings.set(actions, {
      sentAt: performance.now(),
      expectedRecipients: currentlyConnected,
      receivedBy: new Set()
    });
    
    adminSocket.emit('loadTestPing', { seq: actions, sentAt: performance.now() });
    
    console.log(`[Admin] Fired action ${actions} - Expecting ${currentlyConnected} telemetry responses`);
  }, 60000);

  // Hold phase
  await new Promise(r => setTimeout(r, options.duration * 1000));
  
  clearInterval(adminInterval);
  printReport();
  process.exit(0);
}

function printReport() {
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const max = latencies[latencies.length - 1] || 0;
  
  let totalExpected = 0;
  let totalReceivedPongs = 0;
  
  for (const [seq, data] of pings.entries()) {
    totalExpected += data.expectedRecipients;
    totalReceivedPongs += data.receivedBy.size;
  }
  
  const deliverySuccess = totalExpected > 0 ? ((totalReceivedPongs / totalExpected) * 100).toFixed(2) : 0;

  console.log('\n=== LOAD TEST REPORT ===');
  console.log(`Requested users        : ${options.users}`);
  console.log(`Currently connected    : ${connectedCount}`);
  console.log(`Failed connections     : ${connectFailures}`);
  console.log(`Unexpected disconnects : ${disconnects}`);
  console.log(`Reconnects             : ${reconnects}`);
  console.log(`Business Updates rcvd  : ${stateUpdatesReceived}`);
  console.log(`Telemetry expected     : ${totalExpected}`);
  console.log(`Telemetry received     : ${totalReceivedPongs}`);
  console.log(`Delivery success %     : ${deliverySuccess}%`);
  console.log(`Latency p50            : ${p50.toFixed(2)} ms`);
  console.log(`Latency p95            : ${p95.toFixed(2)} ms`);
  console.log(`Latency p99            : ${p99.toFixed(2)} ms`);
  console.log(`Latency max            : ${max.toFixed(2)} ms`);
  console.log('========================\n');
}

run();
