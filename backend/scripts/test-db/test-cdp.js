const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function sendCDP(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timer = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP timed out: ${method}`));
    }, 10000);

    const handler = async (evt) => {
      try {
        let str;
        if (typeof evt.data === 'string') {
          str = evt.data;
        } else if (evt.data instanceof Blob) {
          str = await evt.data.text();
        } else if (Buffer.isBuffer(evt.data)) {
          str = evt.data.toString('utf8');
        } else if (evt.data instanceof ArrayBuffer) {
          str = Buffer.from(evt.data).toString('utf8');
        } else {
          str = String(evt.data);
        }

        console.log('RECV:', str.slice(0, 100));
        const msg = JSON.parse(str);
        if (msg.id === id) {
          clearTimeout(timer);
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (err) {
        console.error('CDP handler error:', err.message);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function run() {
  const tempProfile = path.join(os.tmpdir(), `cdp-test-${Date.now()}`);
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=old',
    '--remote-debugging-port=9444',
    '--window-size=1280,800',
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const pagesRes = await fetch('http://127.0.0.1:9444/json/list');
    const pages = await pagesRes.json();
    const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    console.log('Connected!');
    await sendCDP(ws, 'Page.enable');
    console.log('Page enabled');
    await sendCDP(ws, 'Page.navigate', { url: 'http://127.0.0.1:5176/stores/82a98eb32f87abb362a131ba' });
    console.log('Navigated, waiting 3s...');
    await new Promise((r) => setTimeout(r, 3000));

    const shot = await sendCDP(ws, 'Page.captureScreenshot', { format: 'png' });
    console.log('Screenshot captured, size base64:', shot.data.length);
    const buf = Buffer.from(shot.data, 'base64');
    fs.writeFileSync('docs/phase-7b-artifacts/test-store-catalog.png', buf);
    console.log('Wrote test-store-catalog.png, size:', buf.length);
    ws.close();
  } finally {
    chromeProc.kill('SIGKILL');
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_e) {}
  }
}

run().catch(console.error);
