import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'os';
import { buildStripPrefix, buildCutoff, buildConfig } from '../src/config.js';

describe('buildStripPrefix', () => {
  test('builds prefix from home directory', () => {
    const prefix = buildStripPrefix();
    const home = os.homedir();
    // On Mac: /Users/pessini → -Users-pessini-
    assert.ok(prefix.startsWith('-'), `Expected prefix to start with "-", got: ${prefix}`);
    assert.ok(prefix.endsWith('-'), `Expected prefix to end with "-", got: ${prefix}`);
    assert.ok(prefix.length > 2, 'Expected a non-empty prefix body');
  });

  test('normalizes forward slashes', () => {
    // Simulate a unix home dir
    const home = '/Users/testuser';
    const normalized = home.replace(/[\\/:]/g, '-').replace(/^-/, '');
    const prefix = `-${normalized}-`;
    assert.equal(prefix, '-Users-testuser-');
  });

  test('normalizes backslashes (Windows-style)', () => {
    const home = 'C:\\Users\\testuser';
    const normalized = home.replace(/[\\/:]/g, '-').replace(/^-/, '').replace(/-+/g, '-');
    const prefix = `-${normalized}-`;
    assert.equal(prefix, '-C-Users-testuser-');
  });
});

describe('buildCutoff', () => {
  test('returns null when neither sinceDays nor sinceDate provided', () => {
    assert.equal(buildCutoff(null, null), null);
  });

  test('returns a Date from sinceDate string', () => {
    const cutoff = buildCutoff(null, '2026-03-30');
    assert.ok(cutoff instanceof Date);
    assert.equal(cutoff.toISOString().startsWith('2026-03-30'), true);
  });

  test('returns a Date approximately sinceDays ago', () => {
    const cutoff = buildCutoff(7, null);
    assert.ok(cutoff instanceof Date);
    const expectedMs = 7 * 24 * 60 * 60 * 1000;
    const diff = Date.now() - cutoff.getTime();
    assert.ok(diff >= expectedMs - 1000 && diff <= expectedMs + 1000,
      `Expected ~${expectedMs}ms ago, got ${diff}ms ago`);
  });

  test('sinceDate takes precedence over sinceDays', () => {
    const cutoff = buildCutoff(7, '2026-03-30');
    assert.equal(cutoff.toISOString().startsWith('2026-03-30'), true);
  });
});

describe('buildConfig', () => {
  test('returns default config when no options provided', () => {
    const config = buildConfig({});
    assert.ok(config.projectsDir.endsWith('.claude/projects'));
    assert.equal(config.outputDir, './claude-token-report');
    assert.equal(config.format, 'table');
    assert.equal(config.save, false);
    assert.equal(config.cutoff, null);
  });

  test('--output implies save=true', () => {
    const config = buildConfig({ output: './my-reports' });
    assert.equal(config.save, true);
    assert.equal(config.outputDir, './my-reports');
  });

  test('explicit save flag works', () => {
    const config = buildConfig({ save: true });
    assert.equal(config.save, true);
  });
});
