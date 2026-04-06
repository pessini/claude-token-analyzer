import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderMd, renderJson, renderCsv, calcCost } from '../src/reporter.js';

const theme = {
  currency: null,
  topN: { sessions: 2, subagents: 2 },
  columns: ['project', 'sessions', 'total_tokens', 'output'],
  formatProject: (n) => n.toUpperCase(),
};

const summaries = [
  {
    project: 'alpha',
    sessions: 2,
    usage: { input_tokens: 3500, cache_creation_input_tokens: 500, cache_read_input_tokens: 1000, output_tokens: 3000 },
    totalTokens: 8000,
    subagentTokens: 1000,
    subagentCount: 1,
  },
  {
    project: 'beta',
    sessions: 1,
    usage: { input_tokens: 5000, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000, output_tokens: 3000 },
    totalTokens: 10000,
    subagentTokens: 0,
    subagentCount: 0,
  },
];

const grandTotals = {
  projects: 2, sessions: 3, totalTokens: 18000,
  input: 8500, cacheCreate: 1500, cacheRead: 2000, output: 6000,
  subagentCount: 1, subagentTokens: 1000,
};

const costlySessions = [
  ['beta', {
    sessionId: 'sess-3', totalTokens: 10000, timestampStart: '2026-03-02T10:00:00Z',
    usage: { input_tokens: 5000, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000, output_tokens: 3000 },
    prompts: [{ text: 'Big task prompt here' }],
    subagentSessions: [],
  }],
];

const costlySubagents = [
  ['alpha', 'sess-1', {
    subagentFile: 'sub001.jsonl', totalTokens: 1000,
    usage: { input_tokens: 400, cache_creation_input_tokens: 100, cache_read_input_tokens: 100, output_tokens: 400 },
  }],
];

describe('renderMd', () => {
  test('includes grand totals section', () => {
    const md = renderMd(summaries, costlySessions, costlySubagents, grandTotals, theme);
    assert.ok(md.includes('## Grand Totals'));
    assert.ok(md.includes('18,000'));
  });

  test('includes by-project table', () => {
    const md = renderMd(summaries, costlySessions, costlySubagents, grandTotals, theme);
    assert.ok(md.includes('## By Project'));
  });

  test('applies formatProject to project names', () => {
    const md = renderMd(summaries, costlySessions, costlySubagents, grandTotals, theme);
    assert.ok(md.includes('ALPHA') || md.includes('BETA'));
  });

  test('includes most costly sessions section', () => {
    const md = renderMd(summaries, costlySessions, costlySubagents, grandTotals, theme);
    assert.ok(md.includes('## Most Costly Sessions'));
    assert.ok(md.includes('10,000'));
  });
});

describe('renderJson', () => {
  test('returns valid JSON', () => {
    const json = renderJson(summaries, costlySessions, costlySubagents, grandTotals, theme);
    assert.doesNotThrow(() => JSON.parse(json));
  });

  test('JSON contains grandTotals and summaries', () => {
    const json = renderJson(summaries, costlySessions, costlySubagents, grandTotals, theme);
    const parsed = JSON.parse(json);
    assert.ok('grandTotals' in parsed);
    assert.ok('summaries' in parsed);
    assert.equal(parsed.grandTotals.totalTokens, 18000);
  });
});

describe('renderCsv', () => {
  test('first line is header row', () => {
    const csv = renderCsv(summaries, theme);
    const lines = csv.trim().split('\n');
    assert.ok(lines[0].includes('project'));
    assert.ok(lines[0].includes('sessions'));
  });

  test('has one data row per project', () => {
    const csv = renderCsv(summaries, theme);
    const lines = csv.trim().split('\n');
    assert.equal(lines.length, 3); // header + 2 projects
  });

  test('applies formatProject', () => {
    const csv = renderCsv(summaries, theme);
    assert.ok(csv.includes('ALPHA') || csv.includes('BETA'));
  });
});

describe('calcCost', () => {
  test('calculates total cost from usage and currency rates', () => {
    const usage = {
      input_tokens: 1000,
      cache_creation_input_tokens: 500,
      cache_read_input_tokens: 200,
      output_tokens: 300,
    };
    const currency = { input: 0.000003, output: 0.000015, cacheCreate: 0.00000375, cacheRead: 0.0000003 };
    const cost = calcCost(usage, currency);
    const expected = (1000 * 0.000003) + (500 * 0.00000375) + (200 * 0.0000003) + (300 * 0.000015);
    assert.ok(Math.abs(cost - expected) < 0.0000001);
  });

  test('returns 0 for zero usage', () => {
    const usage = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
    const currency = { input: 0.000003, output: 0.000015, cacheCreate: 0.00000375, cacheRead: 0.0000003 };
    assert.equal(calcCost(usage, currency), 0);
  });
});
