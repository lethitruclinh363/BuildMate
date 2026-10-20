#!/usr/bin/env node
const { spawnSync } = require('child_process');
const result = spawnSync('powershell', ['-NoProfile', '-Command', `
$proc = Get-CimInstance Win32_Process -Filter "ProcessId=16740"
$owner = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $proc.ParentProcessId)
Write-Output ("parent=" + $owner.Name)
Write-Output ("parentCmd=" + $owner.CommandLine)
try {
  $wmi = Get-CimInstance Win32_Process -Filter "ProcessId=16740"
  Write-Output ("executable=" + $wmi.ExecutablePath)
} catch {}
`], { encoding: 'utf8' });
const text = String(result.stdout || '').replace(/postgresql:\/\/[^\s]+/gi, 'postgresql://***');
process.stdout.write(text);
