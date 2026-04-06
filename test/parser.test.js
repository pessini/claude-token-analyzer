import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseSession, parseAllProjects, getProjectName } from '../src/parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, 'fixtures');

describe('parseSession', () => {
  test('parses token usage from assistant messages', () => {
    const session = parseSession(path.join(fixturesDir, 'project1/abc123.jsonl'));
    assert.ok(session, 'Expected session to be parsed');
    assert.equal(session.usage.input_tokens, 2900);   // 1200 + 800 + 900
    assert.equal(session.usage.cache_creation_input_tokens, 500);
    assert.equal(session.usage.cache_read_input_tokens, 1200); // 300 + 400 + 500
    assert.equal(session.usage.output_tokens, 430);   // 150 + 80 + 200
  });

  test('calculates correct totalTokens', () => {
    const session = parseSession(path.join(fixturesDir, 'project1/abc123.jsonl'));
    const expected = 2900 + 500 + 1200 + 430; // input + cache_create + cache_read + output
    assert.equal(session.totalTokens, expected);
  });

  test('collects only human prompts (not tool results)', () => {
    const session = parseSession(path.join(fixturesDir, 'project1/abc123.jsonl'));
    assert.equal(session.prompts.length, 2);
    assert.equal(session.prompts[0].text, 'Analyze the codebase and find all TODO comments');
    assert.equal(session.prompts[1].text, 'Great, now fix them');
  });

  test('sets sessionId from first message', () => {
    const session = parseSession(path.join(fixturesDir, 'project1/abc123.jsonl'));
    assert.equal(session.sessionId, 'abc123');
  });

  test('sets timestampStart from first message', () => {
    const session = parseSession(path.join(fixturesDir, 'project1/abc123.jsonl'));
    assert.ok(session.timestampStart.startsWith('2026-03-01'));
  });

  test('discovers subagent sessions', () => {
    const session = parseSession(path.join(fixturesDir, 'project1/abc123.jsonl'));
    assert.equal(session.subagentSessions.length, 1);
    assert.equal(session.subagentSessions[0].subagentFile, 'sub001.jsonl');
    assert.equal(session.subagentSessions[0].isSubagent, true);
  });

  test('returns null for non-existent file', () => {
    const session = parseSession('/nonexistent/path/file.jsonl');
    assert.equal(session, null);
  });
});

describe('getProjectName', () => {
  test('strips prefix from directory name', () => {
    const result = getProjectName('-Users-pessini-my-project', '-Users-pessini-');
    assert.equal(result, 'my-project');
  });

  test('returns original name when prefix does not match', () => {
    const result = getProjectName('-Users-other-my-project', '-Users-pessini-');
    assert.equal(result, '-Users-other-my-project');
  });

  test('returns original name when prefix is null', () => {
    const result = getProjectName('-Users-pessini-my-project', null);
    assert.equal(result, '-Users-pessini-my-project');
  });

  test('returns original name when stripping would produce empty string', () => {
    const result = getProjectName('-Users-pessini-', '-Users-pessini-');
    assert.equal(result, '-Users-pessini-');
  });
});

describe('parseAllProjects', () => {
  test('finds sessions in project directories', () => {
    const config = { stripPrefix: '', cutoff: null };
    const projects = parseAllProjects(fixturesDir, config);
    assert.ok('project1' in projects, 'Expected project1 to be found');
    assert.equal(projects['project1'].length, 1);
  });

  test('throws on missing projects directory', () => {
    const config = { stripPrefix: '', cutoff: null };
    assert.throws(
      () => parseAllProjects('/nonexistent/path', config),
      /Cannot read projects directory/
    );
  });

  test('filters sessions by cutoff date', () => {
    // cutoff in the future excludes all sessions
    const config = { stripPrefix: '', cutoff: new Date('2099-01-01') };
    const projects = parseAllProjects(fixturesDir, config);
    assert.equal(Object.keys(projects).length, 0);
  });
});
