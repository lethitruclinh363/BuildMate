#!/usr/bin/env node
const path = require('path');
const { spawnSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(backendRoot, '..');
const composeFile = path.join(repoRoot, 'docker-compose.test.yml');
const envDocker = path.join(backendRoot, '.env.test.docker');

const args = ['compose', '-f', composeFile, 'down'];
if (fsExists(envDocker)) args.splice(2, 0, '--env-file', envDocker);

const result = spawnSync('docker', args, { cwd: repoRoot, stdio: 'inherit' });
process.exit(result.status || 0);

function fsExists(file) {
  try {
    require('fs').accessSync(file);
    return true;
  } catch {
    return false;
  }
}
