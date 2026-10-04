const http = require('http');
const { env } = require('./config/env');
const { connectDatabase } = require('./config/database');
const { ensureDefaultPolicies } = require('./services/policy.service');
const { ensureSystemCatalog } = require('./services/catalogService');
const { createApp } = require('./app');
const { initSocket } = require('./sockets');

const { isSmtpConfigured } = require('./providers/emailProvider');

async function bootstrap() {
  await connectDatabase();
  await ensureDefaultPolicies();
  await ensureSystemCatalog();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`[server] Port ${env.port} is already in use.`);
      console.error(`[server] Stop the active process or rerun with PORT=<another-port>.`);
      console.error(`[server] Windows example: netstat -ano | findstr :${env.port}`);
      console.error(`[server] Then: taskkill /PID <pid> /F`);
      process.exit(1);
    }

    console.error('[server] Unhandled server error:', error);
    process.exit(1);
  });

  server.listen(env.port, () => {
    console.log(`[server] BuildMate API listening on http://localhost:${env.port}`);
    console.log(`[server] Environment: ${env.nodeEnv}`);
    console.log(
      isSmtpConfigured()
        ? '[server] Email SMTP: ready (OTP will be sent to inbox)'
        : '[server] Email SMTP: not configured — OTP is printed in this console'
    );
  });
}

bootstrap().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
