const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { loadTestEnv, requireIsolatedTestDatabase } = require('../../src/tests/helpers/database-safety');

loadTestEnv();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACTS_DIR = path.resolve(__dirname, '../../../docs/phase-7b-artifacts');
const BASE_API = 'http://127.0.0.1:5055/api';

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

async function login(email, password) {
  const endpoint = email.includes('admin') ? '/admin/auth/login' : '/auth/login';
  const res = await fetch(`${BASE_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`Login failed for ${email}`);
  return data.data.token;
}

function sendCDP(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.id === id) {
          ws.removeEventListener('message', handler);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (err) {
        reject(err);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  console.log('Logging in demo actors...');
  const customerToken = await login('demo.customer@buildmate.test', 'Demo@1234');
  const storeToken = await login('demo.store@buildmate.test', 'Demo@1234');
  const adminToken = await login('demo.admin@buildmate.test', 'Admin@1234');
  console.log('Tokens retrieved successfully.');

  const tempProfile = path.join(os.tmpdir(), `cdp-profile-${Date.now()}`);
  fs.mkdirSync(tempProfile, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9333',
    `--user-data-dir=${tempProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ]);

  await new Promise((r) => setTimeout(r, 2000));

  try {
    const verRes = await fetch('http://127.0.0.1:9333/json/version');
    const verData = await verRes.json();
    console.log('Connected to Chrome CDP:', verData.Browser);

    const pagesRes = await fetch('http://127.0.0.1:9333/json/list');
    const pages = await pagesRes.json();
    const targetWsUrl = pages[0]?.webSocketDebuggerUrl;
    if (!targetWsUrl) throw new Error('No target page found in Chrome');

    const ws = new WebSocket(targetWsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });

    await sendCDP(ws, 'Page.enable');
    await sendCDP(ws, 'Runtime.enable');
    await sendCDP(ws, 'DOM.enable');

    async function capture(url, outName, options = {}) {
      console.log(`Capturing: ${outName} (${url})...`);
      const width = options.width || 1280;
      const height = options.height || 800;

      await sendCDP(ws, 'Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: Boolean(options.mobile),
      });

      // Navigate to origin first to set localStorage
      const origin = new URL(url).origin;
      await sendCDP(ws, 'Page.navigate', { url: origin });
      await new Promise((r) => setTimeout(r, 600));

      if (options.token) {
        if (options.isAdmin) {
          const authObj = JSON.stringify({
            state: {
              token: options.token,
              user: { email: 'demo.admin@buildmate.test', role: 'ADMIN', name: 'Demo Admin' },
            },
            version: 0,
          });
          await sendCDP(ws, 'Runtime.evaluate', {
            expression: `localStorage.setItem('buildmate-admin-auth', ${JSON.stringify(authObj)});`,
          });
        } else {
          await sendCDP(ws, 'Runtime.evaluate', {
            expression: `localStorage.setItem('buildmate-token', ${JSON.stringify(options.token)});`,
          });
        }
      }

      if (options.cartItem) {
        const cartObj = JSON.stringify({
          state: {
            storeId: '82a98eb32f87abb362a131ba',
            storeName: 'Demo Can Tho Materials',
            items: [
              {
                materialId: 'e329a4afbf00dd186a0aaaf9',
                name: 'Demo Portland Cement',
                price: 2000000,
                quantity: 1,
                unit: 'bag',
              },
            ],
          },
          version: 0,
        });
        await sendCDP(ws, 'Runtime.evaluate', {
          expression: `localStorage.setItem('buildmate-material-cart', ${JSON.stringify(cartObj)});`,
        });
      }

      if (options.lang) {
        await sendCDP(ws, 'Runtime.evaluate', {
          expression: `localStorage.setItem('buildmate-locale', ${JSON.stringify(options.lang)}); document.documentElement.lang = ${JSON.stringify(options.lang)};`,
        });
      }

      // Navigate to target URL
      await sendCDP(ws, 'Page.navigate', { url });
      await new Promise((r) => setTimeout(r, options.delay || 1800));

      const shot = await sendCDP(ws, 'Page.captureScreenshot', { format: 'png' });
      const buf = Buffer.from(shot.data, 'base64');
      const outPath = path.join(ARTIFACTS_DIR, outName);
      fs.writeFileSync(outPath, buf);
      console.log(`Saved ${outName} (${buf.length} bytes)`);
    }

    // 1. Customer: Store Catalog
    await capture(
      'http://127.0.0.1:5176/stores/82a98eb32f87abb362a131ba',
      'phase7b-m01-store-catalog.png',
      { token: customerToken }
    );

    // 2. Customer: Cart
    await capture(
      'http://127.0.0.1:5176/cart',
      'phase7b-m02-cart.png',
      { token: customerToken, cartItem: true }
    );

    // 3. Customer: Checkout COD
    await capture(
      'http://127.0.0.1:5176/checkout',
      'phase7b-m03-checkout-cod.png',
      { token: customerToken, cartItem: true, delay: 2500 }
    );

    // 4. Customer: Order Detail
    await capture(
      'http://127.0.0.1:5176/customer/material-orders/14a04201795edf75761e18a7',
      'phase7b-m04-customer-order-detail.png',
      { token: customerToken, delay: 2000 }
    );

    // 5. Store: Orders List
    await capture(
      'http://127.0.0.1:5176/store/orders',
      'phase7b-m05-store-orders-list.png',
      { token: storeToken, delay: 2000 }
    );

    // 6. Store: Order Detail
    await capture(
      'http://127.0.0.1:5176/store/orders/14a04201795edf75761e18a7',
      'phase7b-m06-store-order-detail.png',
      { token: storeToken, delay: 2000 }
    );

    // 7. Store: Order Detail Collected COD
    await capture(
      'http://127.0.0.1:5176/store/orders/14a04201795edf75761e18a7',
      'phase7b-m07-store-collected-cod.png',
      { token: storeToken, delay: 2000 }
    );

    // 8. Store: Earnings Dashboard
    await capture(
      'http://127.0.0.1:5176/store/earnings',
      'phase7b-m08-store-earnings.png',
      { token: storeToken, delay: 2000 }
    );

    // 9. Admin: Orders List
    await capture(
      'http://127.0.0.1:5177/orders',
      'phase7b-m09-admin-orders-list.png',
      { token: adminToken, isAdmin: true, delay: 2500 }
    );

    // 10. Admin: Order Detail
    await capture(
      'http://127.0.0.1:5177/orders/14a04201795edf75761e18a7',
      'phase7b-m09-admin-order-detail.png',
      { token: adminToken, isAdmin: true, delay: 2500 }
    );

    // 11. Admin: Analytics Dashboard
    await capture(
      'http://127.0.0.1:5177/analytics',
      'phase7b-m10-admin-analytics.png',
      { token: adminToken, isAdmin: true, delay: 2500 }
    );

    // 12. Mobile Viewport (390x844)
    await capture(
      'http://127.0.0.1:5176/customer/material-orders/14a04201795edf75761e18a7',
      'phase7b-mobile-order-view.png',
      { token: customerToken, width: 390, height: 844, mobile: true, delay: 2000 }
    );

    // 13. English Language View
    await capture(
      'http://127.0.0.1:5176/customer/material-orders/14a04201795edf75761e18a7',
      'phase7b-en-order-view.png',
      { token: customerToken, lang: 'en', delay: 2000 }
    );

    console.log('All 13 screenshots successfully captured and saved to docs/phase-7b-artifacts!');
    ws.close();
  } finally {
    chromeProc.kill('SIGKILL');
    try { fs.rmSync(tempProfile, { recursive: true, force: true }); } catch (_e) {}
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
