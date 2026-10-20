#!/usr/bin/env node
const { spawnSync } = require('child_process');

function redact(text) {
  return String(text || '')
    .replace(/postgresql:\/\/[^\s"'`]+/gi, 'postgresql://***')
    .replace(/mongodb(\+srv)?:\/\/[^\s"'`]+/gi, 'mongodb://***')
    .replace(/PASSWORD[=:][^\s"'`]+/gi, 'PASSWORD=***')
    .replace(/SECRET[=:][^\s"'`]+/gi, 'SECRET=***');
}

const ps = `
$conns = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if (-not $conns) { Write-Output 'NO_LISTENER'; exit 0 }
$procId = @($conns)[0].OwningProcess
$proc = Get-CimInstance Win32_Process -Filter ("ProcessId=$procId")
Write-Output ("pid=" + $procId)
Write-Output ("name=" + $proc.Name)
Write-Output ("cmd=" + $proc.CommandLine)
`;

const result = spawnSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' });
process.stdout.write(redact(result.stdout || ''));
process.stderr.write(redact(result.stderr || ''));
process.exit(result.status || 0);
