#!/usr/bin/env node
/**
 * Stop Hook - Warn about console.log in modified JS/TS files
 *
 * Cross-platform (Windows, macOS, Linux)
 */

const fs = require('fs');
const { getGitModifiedFiles, readFile, log } = require('../lib/utils');

async function main() {
  const files = getGitModifiedFiles(['\\.(ts|tsx|js|jsx)$']).filter(f => fs.existsSync(f));

  let hasConsole = false;
  for (const file of files) {
    const content = readFile(file);
    if (content && content.includes('console.log')) {
      log(`[Hook] WARNING: console.log found in ${file}`);
      hasConsole = true;
    }
  }
  if (hasConsole) log('[Hook] Remove console.log statements before committing');

  process.exit(0);
}

main().catch(err => {
  console.error('[CheckConsoleLog] Error:', err.message);
  process.exit(0);
});
