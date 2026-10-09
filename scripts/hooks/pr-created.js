#!/usr/bin/env node
/**
 * PostToolUse Hook (Bash) - Log PR URL and review command after `gh pr create`
 *
 * Cross-platform (Windows, macOS, Linux)
 */

const { readStdinJson, log } = require('../lib/utils');

async function main() {
  const input = await readStdinJson().catch(() => ({}));
  const command = input.tool_input?.command || '';
  if (!/gh pr create/.test(command)) process.exit(0);

  const response = input.tool_response;
  const text = typeof response === 'string'
    ? response
    : [response?.stdout, response?.output, response?.stderr].filter(Boolean).join('\n');

  const match = text.match(/https:\/\/github\.com\/([^/\s]+\/[^/\s]+)\/pull\/(\d+)/);
  if (match) {
    log(`[Hook] PR created: ${match[0]}`);
    log(`[Hook] To review: gh pr review ${match[2]} --repo ${match[1]}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('[PRCreated] Error:', err.message);
  process.exit(0);
});
