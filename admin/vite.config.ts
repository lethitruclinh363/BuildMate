import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

function excludeE2EAuthPlugin() {
  return {
    name: 'exclude-e2e-auth-from-build',
    closeBundle() {
      const distE2E = path.resolve(fileURLToPath(new URL('.', import.meta.url)), 'dist/e2e-auth.html');
      if (fs.existsSync(distE2E)) {
        fs.unlinkSync(distE2E);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isTest = mode === 'test' || process.argv.includes('5177') || process.argv.some(arg => String(arg).includes('5177'));
  const effectiveMode = isTest ? 'test' : mode;
  const env = loadEnv(effectiveMode, process.cwd(), '');
  const defaultTarget = isTest ? 'http://127.0.0.1:5055' : 'http://localhost:5000';
  const proxyTarget = env.VITE_PROXY_TARGET || env.BACKEND_URL || (env.VITE_API_URL ? new URL(env.VITE_API_URL).origin : defaultTarget);

  return {
    plugins: [react(), excludeE2EAuthPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5174,
      strictPort: true,
      proxy: {
        '/api': proxyTarget,
        '/uploads': proxyTarget,
      },
    },
    preview: {
      port: 5174,
      strictPort: true,
    },
  };
});
