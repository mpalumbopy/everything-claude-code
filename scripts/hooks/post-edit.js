#!/usr/bin/env node
/**
 * PostToolUse Hook (Edit/Write) - Format, typecheck and lint JS/TS files
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * - Runs the project's Prettier on the edited file (never downloads it)
 * - Runs tsc --noEmit and reports errors for the edited file only
 * - Warns about console.log statements left in the file
 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { readStdinJson, readFile, log } = require('../lib/utils');

const isWindows = process.platform === 'win32';

// Find a locally installed binary (node_modules/.bin) walking up from dir
function findLocalBin(dir, name) {
  const binName = isWindows ? `${name}.cmd` : name;
  let current = dir;
  while (true) {
    const candidate = path.join(current, 'node_modules', '.bin', binName);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function findUp(dir, fileName) {
  let current = dir;
  while (true) {
    if (fs.existsSync(path.join(current, fileName))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// Arguments are passed as an array (no shell), so file names cannot inject commands
function run(bin, args, cwd) {
  return spawnSync(bin, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows && bin.endsWith('.cmd'),
    timeout: 60000
  });
}

function formatWithPrettier(filePath) {
  const prettier = findLocalBin(path.dirname(filePath), 'prettier');
  if (!prettier) return;
  run(prettier, ['--write', '--', filePath], path.dirname(filePath));
}

function typecheck(filePath) {
  if (!/\.(ts|tsx)$/.test(filePath)) return;
  const projectDir = findUp(path.dirname(filePath), 'tsconfig.json');
  if (!projectDir) return;
  const tsc = findLocalBin(projectDir, 'tsc');
  if (!tsc) return;

  const result = run(tsc, ['--noEmit', '--pretty', 'false'], projectDir);
  const relative = path.relative(projectDir, filePath);
  const lines = `${result.stdout || ''}${result.stderr || ''}`
    .split('\n')
    .filter(l => l.includes(relative) || l.includes(filePath))
    .slice(0, 10);
  if (lines.length) {
    log(`[Hook] TypeScript errors in ${filePath}:`);
    log(lines.join('\n'));
  }
}

function warnConsoleLog(filePath) {
  const content = readFile(filePath);
  if (!content) return;
  const matches = [];
  content.split('\n').forEach((line, idx) => {
    if (/console\.log/.test(line)) matches.push(`${idx + 1}: ${line.trim()}`);
  });
  if (matches.length) {
    log(`[Hook] WARNING: console.log found in ${filePath}`);
    matches.slice(0, 5).forEach(m => log(m));
    log('[Hook] Remove console.log before committing');
  }
}

async function main() {
  const input = await readStdinJson().catch(() => ({}));
  const filePath = input.tool_input?.file_path;

  if (!filePath || !/\.(ts|tsx|js|jsx)$/.test(filePath) || !fs.existsSync(filePath)) {
    process.exit(0);
  }

  formatWithPrettier(filePath);
  typecheck(filePath);
  warnConsoleLog(filePath);

  process.exit(0);
}

main().catch(err => {
  console.error('[PostEdit] Error:', err.message);
  process.exit(0);
});
