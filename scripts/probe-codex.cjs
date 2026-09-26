'use strict';
const { CodexBridge } = require('../src/main/codex-bridge.cjs');
const bridge = new CodexBridge();
bridge.on('status', status => console.log(JSON.stringify({ status })));
bridge.on('request', request => console.log(JSON.stringify({ approvalRequired: request.method })));
(async () => {
  try {
    await bridge.connect();
    const list = await bridge.listThreads();
    console.log(JSON.stringify({ historyCount: list.data.length, hasNextPage: !!list.nextCursor }));
    if (list.data[0]) { const read = await bridge.readThread(list.data[0].id); console.log(JSON.stringify({ readHistory: !!read.thread, turnCount: read.thread.turns.length })); }
    if (process.argv.includes('--smoke')) {
      const { thread } = await bridge.startThread(process.cwd());
      console.log(JSON.stringify({ smokeThreadId: thread.id }));
      const completed = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Smoke turn did not complete in 120 seconds')), 120000);
        bridge.on('notification', ({ method, params }) => {
          if (params.threadId !== thread.id) return;
          if (method === 'item/agentMessage/delta') process.stdout.write(params.delta);
          if (method === 'turn/completed') { clearTimeout(timer); console.log(JSON.stringify({ completed: params.turn.status, error: params.turn.error })); resolve(); }
        });
      });
      await bridge.sendTurn(thread.id, 'Reply exactly PETDOCK_OK. Do not use tools or change files.');
      await completed;
    }
  } finally { bridge.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
