import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeProjects,
  findCostlySessions,
  findCostlySubagents,
  computeGrandTotals,
} from '../src/analyzer.js';

const projects = {
  'alpha': [
    {
      sessionId: 'sess-1',
      totalTokens: 5000,
      usage: { input_tokens: 2000, cache_creation_input_tokens: 500, cache_read_input_tokens: 500, output_tokens: 2000 },
      prompts: [{ text: 'Hello world', timestamp: '2026-03-01T10:00:00Z' }],
      subagentSessions: [
        {
          sessionId: 'sub-1', totalTokens: 1000,
          usage: { input_tokens: 400, cache_creation_input_tokens: 100, cache_read_input_tokens: 100, output_tokens: 400 },
          prompts: [], subagentSessions: [],
        }
      ],
    },
    {
      sessionId: 'sess-2',
      totalTokens: 3000,
      usage: { input_tokens: 1500, cache_creation_input_tokens: 0, cache_read_input_tokens: 500, output_tokens: 1000 },
      prompts: [],
      subagentSessions: [],
    },
  ],
  'beta': [
    {
      sessionId: 'sess-3',
      totalTokens: 10000,
      usage: { input_tokens: 5000, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000, output_tokens: 3000 },
      prompts: [{ text: 'Big task', timestamp: '2026-03-02T10:00:00Z' }],
      subagentSessions: [],
    },
  ],
};

describe('summarizeProjects', () => {
  test('sorts projects by totalTokens descending', () => {
    const summaries = summarizeProjects(projects);
    assert.equal(summaries[0].project, 'beta');
    assert.equal(summaries[1].project, 'alpha');
  });

  test('counts sessions per project', () => {
    const summaries = summarizeProjects(projects);
    const alpha = summaries.find(s => s.project === 'alpha');
    assert.equal(alpha.sessions, 2);
  });

  test('aggregates usage across sessions', () => {
    const summaries = summarizeProjects(projects);
    const alpha = summaries.find(s => s.project === 'alpha');
    assert.equal(alpha.usage.input_tokens, 3500); // 2000 + 1500
    assert.equal(alpha.totalTokens, 8000); // 5000 + 3000
  });

  test('counts subagents across sessions', () => {
    const summaries = summarizeProjects(projects);
    const alpha = summaries.find(s => s.project === 'alpha');
    assert.equal(alpha.subagentCount, 1);
    assert.equal(alpha.subagentTokens, 1000);
  });
});

describe('findCostlySessions', () => {
  test('returns sessions sorted by totalTokens descending', () => {
    const result = findCostlySessions(projects, 10);
    assert.equal(result[0][1].totalTokens, 10000);
    assert.equal(result[1][1].totalTokens, 5000);
    assert.equal(result[2][1].totalTokens, 3000);
  });

  test('respects topN limit', () => {
    const result = findCostlySessions(projects, 2);
    assert.equal(result.length, 2);
  });

  test('includes project name with each session', () => {
    const result = findCostlySessions(projects, 1);
    assert.equal(result[0][0], 'beta');
  });
});

describe('findCostlySubagents', () => {
  test('returns subagents sorted by totalTokens', () => {
    const result = findCostlySubagents(projects, 5);
    assert.equal(result.length, 1);
    assert.equal(result[0][2].totalTokens, 1000);
  });

  test('returns empty array when no subagents exist', () => {
    const noSubs = { 'x': [{ sessionId: 'a', totalTokens: 100, usage: {}, prompts: [], subagentSessions: [] }] };
    const result = findCostlySubagents(noSubs, 5);
    assert.equal(result.length, 0);
  });
});

describe('computeGrandTotals', () => {
  test('sums all metrics across summaries', () => {
    const summaries = summarizeProjects(projects);
    const totals = computeGrandTotals(summaries);
    assert.equal(totals.projects, 2);
    assert.equal(totals.sessions, 3);
    assert.equal(totals.totalTokens, 18000);
    assert.equal(totals.subagentCount, 1);
    assert.equal(totals.subagentTokens, 1000);
  });
});
