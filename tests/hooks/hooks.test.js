/**
 * Tests for hook scripts
 *
 * Run with: node tests/hooks/hooks.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');

// Test helper
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

// Async test helper
async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`    Error: ${err.message}`);
    return false;
  }
}

// Run a script and capture output
function runScript(scriptPath, input = '', env = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', data => stdout += data);
    proc.stderr.on('data', data => stderr += data);

    if (input) {
      proc.stdin.write(input);
    }
    proc.stdin.end();

    proc.on('close', code => {
      resolve({ code, stdout, stderr });
    });

    proc.on('error', reject);
  });
}

// Create a temporary test directory
function createTestDir() {
  const testDir = path.join(os.tmpdir(), `hooks-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  return testDir;
}

// Clean up test directory
function cleanupTestDir(testDir) {
  fs.rmSync(testDir, { recursive: true, force: true });
}

// Test suite
async function runTests() {
  console.log('\n=== Testing Hook Scripts ===\n');

  let passed = 0;
  let failed = 0;

  const scriptsDir = path.join(__dirname, '..', '..', 'scripts', 'hooks');

  // session-start.js tests
  console.log('session-start.js:');

  if (await asyncTest('runs without error', async () => {
    const result = await runScript(path.join(scriptsDir, 'session-start.js'));
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('outputs session info to stderr', async () => {
    const result = await runScript(path.join(scriptsDir, 'session-start.js'));
    assert.ok(
      result.stderr.includes('[SessionStart]') ||
      result.stderr.includes('Package manager'),
      'Should output session info'
    );
  })) passed++; else failed++;

  // session-end.js tests
  console.log('\nsession-end.js:');

  if (await asyncTest('runs without error', async () => {
    const result = await runScript(path.join(scriptsDir, 'session-end.js'));
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('creates or updates session file', async () => {
    // Run the script
    await runScript(path.join(scriptsDir, 'session-end.js'));

    // Check if session file was created
    const sessionsDir = path.join(os.homedir(), '.claude', 'sessions');
    const today = new Date().toISOString().split('T')[0];
    const sessionFile = path.join(sessionsDir, `${today}-session.tmp`);

    assert.ok(fs.existsSync(sessionFile), 'Session file should exist');
  })) passed++; else failed++;

  // pre-compact.js tests
  console.log('\npre-compact.js:');

  if (await asyncTest('runs without error', async () => {
    const result = await runScript(path.join(scriptsDir, 'pre-compact.js'));
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('outputs PreCompact message', async () => {
    const result = await runScript(path.join(scriptsDir, 'pre-compact.js'));
    assert.ok(result.stderr.includes('[PreCompact]'), 'Should output PreCompact message');
  })) passed++; else failed++;

  if (await asyncTest('creates compaction log', async () => {
    await runScript(path.join(scriptsDir, 'pre-compact.js'));
    const logFile = path.join(os.homedir(), '.claude', 'sessions', 'compaction-log.txt');
    assert.ok(fs.existsSync(logFile), 'Compaction log should exist');
  })) passed++; else failed++;

  // suggest-compact.js tests
  console.log('\nsuggest-compact.js:');

  if (await asyncTest('runs without error', async () => {
    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: 'test-session-' + Date.now()
    });
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('increments counter on each call', async () => {
    const sessionId = 'test-counter-' + Date.now();

    // Run multiple times
    for (let i = 0; i < 3; i++) {
      await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
        CLAUDE_SESSION_ID: sessionId
      });
    }

    // Check counter file
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    const count = parseInt(fs.readFileSync(counterFile, 'utf8').trim(), 10);
    assert.strictEqual(count, 3, `Counter should be 3, got ${count}`);

    // Cleanup
    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  if (await asyncTest('suggests compact at threshold', async () => {
    const sessionId = 'test-threshold-' + Date.now();
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);

    // Set counter to threshold - 1
    fs.writeFileSync(counterFile, '49');

    const result = await runScript(path.join(scriptsDir, 'suggest-compact.js'), '', {
      CLAUDE_SESSION_ID: sessionId,
      COMPACT_THRESHOLD: '50'
    });

    assert.ok(
      result.stderr.includes('50 tool calls reached'),
      'Should suggest compact at threshold'
    );

    // Cleanup
    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  // evaluate-session.js tests
  console.log('\nevaluate-session.js:');

  if (await asyncTest('runs without error when no transcript', async () => {
    const result = await runScript(path.join(scriptsDir, 'evaluate-session.js'));
    assert.strictEqual(result.code, 0, `Exit code should be 0, got ${result.code}`);
  })) passed++; else failed++;

  if (await asyncTest('skips short sessions', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // Create a short transcript (less than 10 user messages)
    const transcript = Array(5).fill('{"type":"user","content":"test"}\n').join('');
    fs.writeFileSync(transcriptPath, transcript);

    const result = await runScript(path.join(scriptsDir, 'evaluate-session.js'), '', {
      CLAUDE_TRANSCRIPT_PATH: transcriptPath
    });

    assert.ok(
      result.stderr.includes('Session too short'),
      'Should indicate session is too short'
    );

    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('processes sessions with enough messages', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');

    // Create a longer transcript (more than 10 user messages)
    const transcript = Array(15).fill('{"type":"user","content":"test"}\n').join('');
    fs.writeFileSync(transcriptPath, transcript);

    const result = await runScript(path.join(scriptsDir, 'evaluate-session.js'), '', {
      CLAUDE_TRANSCRIPT_PATH: transcriptPath
    });

    assert.ok(
      result.stderr.includes('15 messages'),
      'Should report message count'
    );

    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('reads transcript_path from stdin hook input', async () => {
    const testDir = createTestDir();
    const transcriptPath = path.join(testDir, 'transcript.jsonl');
    fs.writeFileSync(transcriptPath, Array(12).fill('{"type":"user","content":"test"}\n').join(''));

    const result = await runScript(
      path.join(scriptsDir, 'evaluate-session.js'),
      JSON.stringify({ transcript_path: transcriptPath }),
      { CLAUDE_TRANSCRIPT_PATH: '' }
    );

    assert.ok(result.stderr.includes('12 messages'), 'Should read transcript_path from stdin');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  // suggest-compact.js stdin session id
  console.log('\nsuggest-compact.js (stdin):');

  if (await asyncTest('counts across calls using session_id from stdin', async () => {
    const sessionId = 'stdin-session-' + Date.now();
    const input = JSON.stringify({ session_id: sessionId });
    const env = { CLAUDE_SESSION_ID: '' };
    for (let i = 0; i < 3; i++) {
      await runScript(path.join(scriptsDir, 'suggest-compact.js'), input, env);
    }
    const counterFile = path.join(os.tmpdir(), `claude-tool-count-${sessionId}`);
    assert.strictEqual(fs.readFileSync(counterFile, 'utf8').trim(), '3');
    fs.unlinkSync(counterFile);
  })) passed++; else failed++;

  // post-edit.js
  console.log('\npost-edit.js:');

  if (await asyncTest('warns about console.log in edited file', async () => {
    const testDir = createTestDir();
    const file = path.join(testDir, 'a.js');
    fs.writeFileSync(file, 'console.log("x");\n');

    const result = await runScript(
      path.join(scriptsDir, 'post-edit.js'),
      JSON.stringify({ tool_input: { file_path: file } })
    );

    assert.strictEqual(result.code, 0);
    assert.ok(result.stderr.includes('console.log found'), 'Should warn about console.log');
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('does not run shell commands from file names', async () => {
    const testDir = createTestDir();
    const markerName = `pwned-${Date.now()}`;
    const markers = [path.join(testDir, markerName), path.join(process.cwd(), markerName)];
    const file = path.join(testDir, `x$(touch ${markerName}).js`);
    fs.writeFileSync(file, 'const a = 1;\n');

    // Fake local prettier so the formatting step actually runs
    const binDir = path.join(testDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const fakePrettier = path.join(binDir, process.platform === 'win32' ? 'prettier.cmd' : 'prettier');
    fs.writeFileSync(fakePrettier, process.platform === 'win32' ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n');
    fs.chmodSync(fakePrettier, 0o755);

    await runScript(
      path.join(scriptsDir, 'post-edit.js'),
      JSON.stringify({ tool_input: { file_path: file } })
    );

    for (const marker of markers) {
      assert.ok(!fs.existsSync(marker), 'File name must not be interpreted by a shell');
    }
    cleanupTestDir(testDir);
  })) passed++; else failed++;

  if (await asyncTest('ignores non JS/TS files', async () => {
    const result = await runScript(
      path.join(scriptsDir, 'post-edit.js'),
      JSON.stringify({ tool_input: { file_path: '/tmp/readme.md' } })
    );
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stderr, '');
  })) passed++; else failed++;

  // pr-created.js
  console.log('\npr-created.js:');

  if (await asyncTest('logs PR URL from tool_response', async () => {
    const result = await runScript(
      path.join(scriptsDir, 'pr-created.js'),
      JSON.stringify({
        tool_input: { command: 'gh pr create --fill' },
        tool_response: { stdout: 'https://github.com/acme/app/pull/42\n' }
      })
    );
    assert.ok(result.stderr.includes('gh pr review 42 --repo acme/app'));
  })) passed++; else failed++;

  // hooks.json validation
  console.log('\nhooks.json Validation:');

  if (test('matchers are tool names, not expressions', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    for (const event of ['PreToolUse', 'PostToolUse']) {
      for (const entry of hooks.hooks[event]) {
        assert.ok(
          /^[A-Za-z|]+$/.test(entry.matcher),
          `${event} matcher should be a tool name list: ${entry.matcher}`
        );
      }
    }
  })) passed++; else failed++;

  if (test('hooks.json is valid JSON', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const content = fs.readFileSync(hooksPath, 'utf8');
    JSON.parse(content); // Will throw if invalid
  })) passed++; else failed++;

  if (test('hooks.json has required event types', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    assert.ok(hooks.hooks.PreToolUse, 'Should have PreToolUse hooks');
    assert.ok(hooks.hooks.PostToolUse, 'Should have PostToolUse hooks');
    assert.ok(hooks.hooks.SessionStart, 'Should have SessionStart hooks');
    assert.ok(hooks.hooks.Stop, 'Should have Stop hooks');
    assert.ok(hooks.hooks.PreCompact, 'Should have PreCompact hooks');
  })) passed++; else failed++;

  if (test('all hook commands use node', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    const checkHooks = (hookArray) => {
      for (const entry of hookArray) {
        for (const hook of entry.hooks) {
          if (hook.type === 'command') {
            assert.ok(
              hook.command.startsWith('node'),
              `Hook command should start with 'node': ${hook.command.substring(0, 50)}...`
            );
          }
        }
      }
    };

    for (const [eventType, hookArray] of Object.entries(hooks.hooks)) {
      checkHooks(hookArray);
    }
  })) passed++; else failed++;

  if (test('script references use CLAUDE_PLUGIN_ROOT variable', () => {
    const hooksPath = path.join(__dirname, '..', '..', 'hooks', 'hooks.json');
    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));

    const checkHooks = (hookArray) => {
      for (const entry of hookArray) {
        for (const hook of entry.hooks) {
          if (hook.type === 'command' && hook.command.includes('scripts/hooks/')) {
            // Check for the literal string "${CLAUDE_PLUGIN_ROOT}" in the command
            const hasPluginRoot = hook.command.includes('${CLAUDE_PLUGIN_ROOT}');
            assert.ok(
              hasPluginRoot,
              `Script paths should use CLAUDE_PLUGIN_ROOT: ${hook.command.substring(0, 80)}...`
            );
          }
        }
      }
    };

    for (const [eventType, hookArray] of Object.entries(hooks.hooks)) {
      checkHooks(hookArray);
    }
  })) passed++; else failed++;

  // Summary
  console.log('\n=== Test Results ===');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
