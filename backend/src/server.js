const http = require('http');
const { env } = require('./config/env');
const { connectDatabase } = require('./config/database');
const { createApp } = require('./app');
const { initSocket } = require('./sockets');

const { isSmtpConfigured } = require('./providers/email.provider');

async function bootstrap() {
  await connectDatabase();

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

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
