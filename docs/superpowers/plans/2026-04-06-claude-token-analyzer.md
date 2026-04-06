# Claude Token Analyzer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an npx-runnable Node.js CLI that ports the Python Claude token analyzer, with pretty terminal table output, theming, multiple output formats, and per-project prompt exports.

**Architecture:** Plain function pipeline — `parser.js` reads JSONL files into session objects, `analyzer.js` aggregates them into project summaries and rankings, `reporter.js` formats and outputs results. `bin/analyze.js` wires everything together via `commander`.

**Tech Stack:** Node.js ESM, `cli-table3`, `chalk`, `commander`, Node built-in test runner (`node:test`)

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Project manifest, bin entry, dependencies |
| `bin/analyze.js` | CLI entry: parse args, load theme, orchestrate pipeline |
| `src/config.js` | Resolve paths, env vars, CLI flags, auto-detect prefix |
| `src/parser.js` | Read JSONL files → session objects; discover subagents |
| `src/analyzer.js` | Aggregate sessions → summaries, rankings, grand totals |
| `src/reporter.js` | Format selection (table/md/json/csv); stdout or file write |
| `themes/default.js` | Default theme object |
| `themes/minimal.js` | Example custom theme |
| `test/fixtures/project1/abc123.jsonl` | Test fixture: main session |
| `test/fixtures/project1/abc123/subagents/sub001.jsonl` | Test fixture: subagent session |
| `test/config.test.js` | Unit tests for config.js |
| `test/parser.test.js` | Unit tests for parser.js |
| `test/analyzer.test.js` | Unit tests for analyzer.js |
| `test/reporter.test.js` | Unit tests for reporter.js (md/json/csv formats) |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "claude-token-analyzer",
  "version": "1.0.0",
  "description": "Analyze Claude Code token usage from ~/.claude/projects/ JSONL files",
  "type": "module",
  "bin": {
    "claude-tokens": "./bin/analyze.js"
  },
  "scripts": {
    "start": "node bin/analyze.js",
    "test": "node --test test/**/*.test.js"
  },
  "dependencies": {
    "chalk": "^5.3.0",
    "cli-table3": "^0.6.3",
    "commander": "^12.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "keywords": ["claude", "token", "usage", "analyzer", "cli"],
  "license": "MIT"
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
claude-token-report/
*.log
.DS_Store
```

- [ ] **Step 3: Install dependencies**

```bash
cd /Users/pessini/Dropbox/dev/claude-token-analyzer
npm install
```

Expected: `node_modules/` created, `package-lock.json` created.

- [ ] **Step 4: Create directory structure**

```bash
mkdir -p bin src themes test/fixtures/project1/abc123/subagents
```

- [ ] **Step 5: Commit**

```bash
git init
git add package.json package-lock.json .gitignore
git commit -m "chore: initialize project with dependencies"
```

---

## Task 2: Test Fixtures

**Files:**
- Create: `test/fixtures/project1/abc123.jsonl`
- Create: `test/fixtures/project1/abc123/subagents/sub001.jsonl`

These fixtures are the ground truth for parser tests. They mirror the real JSONL format Claude Code writes.

- [ ] **Step 1: Create main session fixture**

Create `test/fixtures/project1/abc123.jsonl`:

```jsonl
{"type":"user","sessionId":"abc123","agentId":"agent-1","timestamp":"2026-03-01T10:00:00.000Z","message":{"role":"user","content":"Analyze the codebase and find all TODO comments"},"userType":"human","isSidechain":false,"entrypoint":"cli"}
{"type":"assistant","sessionId":"abc123","agentId":"agent-1","timestamp":"2026-03-01T10:00:05.000Z","message":{"role":"assistant","content":"I'll analyze the codebase now.","usage":{"input_tokens":1200,"cache_creation_input_tokens":500,"cache_read_input_tokens":300,"output_tokens":150}}}
{"type":"user","sessionId":"abc123","agentId":"agent-1","timestamp":"2026-03-01T10:01:00.000Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_01","content":"done"}]},"userType":"tool","isSidechain":false}
{"type":"assistant","sessionId":"abc123","agentId":"agent-1","timestamp":"2026-03-01T10:01:05.000Z","message":{"role":"assistant","content":"Found 3 TODOs.","usage":{"input_tokens":800,"cache_creation_input_tokens":0,"cache_read_input_tokens":400,"output_tokens":80}}}
{"type":"user","sessionId":"abc123","agentId":"agent-1","timestamp":"2026-03-01T10:02:00.000Z","message":{"role":"user","content":"Great, now fix them"},"userType":"human","isSidechain":false,"entrypoint":"cli"}
{"type":"assistant","sessionId":"abc123","agentId":"agent-1","timestamp":"2026-03-01T10:02:10.000Z","message":{"role":"assistant","content":"Fixing now.","usage":{"input_tokens":900,"cache_creation_input_tokens":0,"cache_read_input_tokens":500,"output_tokens":200}}}
```

- [ ] **Step 2: Create subagent session fixture**

Create `test/fixtures/project1/abc123/subagents/sub001.jsonl`:

```jsonl
{"type":"user","sessionId":"sub001","agentId":"subagent-1","timestamp":"2026-03-01T10:01:30.000Z","message":{"role":"user","content":"Search for TODO in src/"},"userType":"human","isSidechain":false}
{"type":"assistant","sessionId":"sub001","agentId":"subagent-1","timestamp":"2026-03-01T10:01:35.000Z","message":{"role":"assistant","content":"Searching...","usage":{"input_tokens":400,"cache_creation_input_tokens":100,"cache_read_input_tokens":50,"output_tokens":60}}}
```

- [ ] **Step 3: Commit fixtures**

```bash
git add test/
git commit -m "test: add JSONL fixtures for parser tests"
```

---

## Task 3: config.js

**Files:**
- Create: `src/config.js`
- Create: `test/config.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/config.test.js`:

```js
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
    const normalized = home.replace(/[\\/]/g, '-').replace(/^-/, '');
    const prefix = `-${normalized}-`;
    assert.equal(prefix, '-Users-testuser-');
  });

  test('normalizes backslashes (Windows-style)', () => {
    const home = 'C:\\Users\\testuser';
    const normalized = home.replace(/[\\/]/g, '-').replace(/^-/, '');
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
    const before = Date.now();
    const cutoff = buildCutoff(7, null);
    const after = Date.now();
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test test/config.test.js
```

Expected: FAIL with `Cannot find module '../src/config.js'`

- [ ] **Step 3: Implement config.js**

Create `src/config.js`:

```js
import os from 'os';
import path from 'path';

export function buildStripPrefix() {
  const home = os.homedir();
  const normalized = home.replace(/[\\/]/g, '-').replace(/^-/, '');
  return `-${normalized}-`;
}

export function buildCutoff(sinceDays, sinceDate) {
  if (sinceDate) {
    return new Date(sinceDate + 'T00:00:00Z');
  }
  if (sinceDays) {
    const d = new Date();
    d.setDate(d.getDate() - sinceDays);
    return d;
  }
  return null;
}

export function buildConfig(cliOptions = {}) {
  const sinceDays = cliOptions.sinceDays
    ?? (process.env.SINCE_DAYS ? parseInt(process.env.SINCE_DAYS, 10) : null);
  const sinceDate = cliOptions.sinceDate ?? process.env.SINCE_DATE ?? null;

  return {
    projectsDir: path.join(os.homedir(), '.claude', 'projects'),
    outputDir: cliOptions.output ?? './claude-token-report',
    format: cliOptions.format ?? 'table',
    save: cliOptions.save ?? !!cliOptions.output,
    stripPrefix: cliOptions.stripPrefix ?? buildStripPrefix(),
    cutoff: buildCutoff(sinceDays, sinceDate),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test test/config.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: add config module with prefix auto-detection and cutoff logic"
```

---

## Task 4: parser.js

**Files:**
- Create: `src/parser.js`
- Create: `test/parser.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/parser.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test test/parser.test.js
```

Expected: FAIL with `Cannot find module '../src/parser.js'`

- [ ] **Step 3: Implement parser.js**

Create `src/parser.js`:

```js
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';

function extractTextContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const item of content) {
    if (typeof item === 'string') parts.push(item);
    else if (item?.type === 'text') parts.push(item.text ?? '');
  }
  return parts.join('\n').trim();
}

function isHumanPrompt(msgObj) {
  const content = msgObj?.message?.content ?? '';
  if (Array.isArray(content)) {
    const types = content.filter(i => typeof i === 'object').map(i => i?.type);
    if (types.length > 0 && types.every(t => t === 'tool_result')) return false;
  }
  return true;
}

export function parseSession(jsonlPath, isSubagent = false) {
  let lines;
  try {
    lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean);
  } catch {
    return null;
  }

  const usage = {
    input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 0,
  };
  const prompts = [];
  let agentId = null;
  let sessionId = null;
  let timestampStart = null;

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (!timestampStart && obj.timestamp) timestampStart = obj.timestamp;
    if (!agentId) agentId = obj.agentId ?? null;
    if (!sessionId) sessionId = obj.sessionId ?? null;

    if (obj.type === 'assistant') {
      const u = obj.message?.usage ?? {};
      usage.input_tokens += u.input_tokens ?? 0;
      usage.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0;
      usage.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
      usage.output_tokens += u.output_tokens ?? 0;
    } else if (obj.type === 'user') {
      const isSidechain = obj.isSidechain ?? false;
      const userType = obj.userType ?? '';
      const content = obj.message?.content ?? '';
      const text = extractTextContent(content);
      if (text && !isSidechain && isHumanPrompt(obj) && userType !== 'tool') {
        prompts.push({
          text,
          timestamp: obj.timestamp ?? null,
          entrypoint: obj.entrypoint ?? '',
        });
      }
    }
  }

  const stem = path.basename(jsonlPath, '.jsonl');
  const subagentsDir = path.join(path.dirname(jsonlPath), stem, 'subagents');
  const subagentSessions = [];

  try {
    const subFiles = readdirSync(subagentsDir)
      .filter(f => f.endsWith('.jsonl'))
      .sort();
    for (const subFile of subFiles) {
      const sub = parseSession(path.join(subagentsDir, subFile), true);
      if (sub) {
        sub.subagentFile = subFile;
        subagentSessions.push(sub);
      }
    }
  } catch {
    // No subagents directory — normal case
  }

  const totalTokens = Object.values(usage).reduce((a, b) => a + b, 0);

  return {
    file: jsonlPath,
    sessionId: sessionId ?? stem,
    agentId,
    isSubagent,
    timestampStart,
    usage,
    totalTokens,
    prompts,
    subagentSessions,
  };
}

export function getProjectName(dirName, stripPrefix) {
  if (stripPrefix && dirName.startsWith(stripPrefix)) {
    const stripped = dirName.slice(stripPrefix.length);
    return stripped || dirName;
  }
  return dirName;
}

function sessionInRange(session, cutoff) {
  if (!cutoff || !session.timestampStart) return true;
  try {
    const ts = new Date(session.timestampStart.replace('Z', '+00:00'));
    return ts >= cutoff;
  } catch {
    return true;
  }
}

export function parseAllProjects(projectsDir, config) {
  const { stripPrefix, cutoff } = config;
  let dirNames;

  try {
    dirNames = readdirSync(projectsDir).sort();
  } catch {
    throw new Error(
      `Cannot read projects directory: ${projectsDir}\n` +
      `Make sure Claude Code has been used and ~/.claude/projects/ exists.`
    );
  }

  const projects = {};

  for (const dirName of dirNames) {
    const dirPath = path.join(projectsDir, dirName);
    try {
      if (!statSync(dirPath).isDirectory()) continue;
    } catch { continue; }

    let jsonlFiles;
    try {
      jsonlFiles = readdirSync(dirPath).filter(f => f.endsWith('.jsonl')).sort();
    } catch { continue; }

    const sessions = [];
    for (const file of jsonlFiles) {
      const session = parseSession(path.join(dirPath, file));
      if (session && session.totalTokens > 0 && sessionInRange(session, cutoff)) {
        sessions.push(session);
      }
    }

    if (sessions.length > 0) {
      const projectName = getProjectName(dirName, stripPrefix);
      projects[projectName] = sessions;
    }
  }

  return projects;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test test/parser.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/parser.js test/parser.test.js
git commit -m "feat: add JSONL parser with subagent discovery"
```

---

## Task 5: analyzer.js

**Files:**
- Create: `src/analyzer.js`
- Create: `test/analyzer.test.js`

- [ ] **Step 1: Write failing tests**

Create `test/analyzer.test.js`:

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeProjects,
  findCostlySessions,
  findCostlySubagents,
  computeGrandTotals,
} from '../src/analyzer.js';

// Minimal project fixture
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
    assert.equal(result[0][1].totalTokens, 10000); // beta sess-3
    assert.equal(result[1][1].totalTokens, 5000);  // alpha sess-1
    assert.equal(result[2][1].totalTokens, 3000);  // alpha sess-2
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
    assert.equal(result.length, 1); // only alpha has a subagent
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
    assert.equal(totals.totalTokens, 18000); // 8000 + 10000
    assert.equal(totals.subagentCount, 1);
    assert.equal(totals.subagentTokens, 1000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test test/analyzer.test.js
```

Expected: FAIL with `Cannot find module '../src/analyzer.js'`

- [ ] **Step 3: Implement analyzer.js**

Create `src/analyzer.js`:

```js
export function summarizeProjects(projects) {
  const summaries = Object.entries(projects).map(([project, sessions]) => {
    const usage = {
      input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 0,
    };
    let subagentTokens = 0;
    let subagentCount = 0;

    for (const session of sessions) {
      for (const [k, v] of Object.entries(session.usage)) {
        usage[k] = (usage[k] ?? 0) + v;
      }
      for (const sub of session.subagentSessions) {
        subagentTokens += sub.totalTokens;
        subagentCount++;
      }
    }

    return {
      project,
      sessions: sessions.length,
      usage,
      totalTokens: Object.values(usage).reduce((a, b) => a + b, 0),
      subagentTokens,
      subagentCount,
    };
  });

  return summaries.sort((a, b) => b.totalTokens - a.totalTokens);
}

export function findCostlySessions(projects, topN = 20) {
  const all = [];
  for (const [project, sessions] of Object.entries(projects)) {
    for (const session of sessions) {
      all.push([project, session]);
    }
  }
  return all
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
    .slice(0, topN);
}

export function findCostlySubagents(projects, topN = 20) {
  const all = [];
  for (const [project, sessions] of Object.entries(projects)) {
    for (const session of sessions) {
      for (const sub of session.subagentSessions) {
        all.push([project, session.sessionId, sub]);
      }
    }
  }
  return all
    .sort((a, b) => b[2].totalTokens - a[2].totalTokens)
    .slice(0, topN);
}

export function computeGrandTotals(summaries) {
  return {
    projects: summaries.length,
    sessions: summaries.reduce((a, s) => a + s.sessions, 0),
    totalTokens: summaries.reduce((a, s) => a + s.totalTokens, 0),
    input: summaries.reduce((a, s) => a + (s.usage.input_tokens ?? 0), 0),
    cacheCreate: summaries.reduce((a, s) => a + (s.usage.cache_creation_input_tokens ?? 0), 0),
    cacheRead: summaries.reduce((a, s) => a + (s.usage.cache_read_input_tokens ?? 0), 0),
    output: summaries.reduce((a, s) => a + (s.usage.output_tokens ?? 0), 0),
    subagentTokens: summaries.reduce((a, s) => a + s.subagentTokens, 0),
    subagentCount: summaries.reduce((a, s) => a + s.subagentCount, 0),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test test/analyzer.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/analyzer.js test/analyzer.test.js
git commit -m "feat: add analyzer module for project summaries and rankings"
```

---

## Task 6: Themes

**Files:**
- Create: `themes/default.js`
- Create: `themes/minimal.js`

- [ ] **Step 1: Create default theme**

Create `themes/default.js`:

```js
export default {
  // No currency rates by default — cost column is hidden unless set
  currency: null,

  topN: {
    sessions: 10,
    subagents: 5,
  },

  // Valid columns: 'project' | 'sessions' | 'total_tokens' | 'input' |
  //                'cache_create' | 'cache_read' | 'output' | 'subagents' | 'cost'
  // 'cost' only renders if currency rates are provided
  columns: ['project', 'sessions', 'total_tokens', 'input', 'cache_create', 'cache_read', 'output', 'subagents'],

  formatProject: (name) => name,

  // Override auto-detected home-path prefix (set to null to use auto-detection)
  stripPrefix: null,
};
```

- [ ] **Step 2: Create minimal theme**

Create `themes/minimal.js`:

```js
export default {
  currency: null,

  topN: {
    sessions: 5,
    subagents: 3,
  },

  columns: ['project', 'sessions', 'total_tokens'],

  formatProject: (name) => name,

  stripPrefix: null,
};
```

- [ ] **Step 3: Commit**

```bash
git add themes/
git commit -m "feat: add default and minimal themes"
```

---

## Task 7: reporter.js — md/json/csv formats

**Files:**
- Create: `src/reporter.js` (partial — md/json/csv only)
- Create: `test/reporter.test.js`

- [ ] **Step 1: Write failing tests for md/json/csv**

Create `test/reporter.test.js`:

```js
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
    assert.ok(md.includes('| alpha |') || md.includes('| ALPHA |'));
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test test/reporter.test.js
```

Expected: FAIL with `Cannot find module '../src/reporter.js'`

- [ ] **Step 3: Implement reporter.js with md/json/csv formats**

Create `src/reporter.js`:

```js
import Table from 'cli-table3';
import chalk from 'chalk';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

export function fmt(n) {
  return Number(n).toLocaleString();
}

export function calcCost(usage, currency) {
  return (
    (usage.input_tokens ?? 0) * (currency.input ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) * (currency.cacheCreate ?? 0) +
    (usage.cache_read_input_tokens ?? 0) * (currency.cacheRead ?? 0) +
    (usage.output_tokens ?? 0) * (currency.output ?? 0)
  );
}

const COL_HEADERS = {
  project: 'Project',
  sessions: 'Sessions',
  total_tokens: 'Total',
  input: 'Input',
  cache_create: 'Cache+',
  cache_read: 'Cache~',
  output: 'Output',
  subagents: 'Subagents',
  cost: 'Cost',
};

function projectRow(s, cols, theme) {
  const cost = theme.currency ? calcCost(s.usage, theme.currency) : null;
  return cols.map(c => {
    switch (c) {
      case 'project':     return theme.formatProject(s.project);
      case 'sessions':    return fmt(s.sessions);
      case 'total_tokens':return fmt(s.totalTokens);
      case 'input':       return fmt(s.usage.input_tokens ?? 0);
      case 'cache_create':return fmt(s.usage.cache_creation_input_tokens ?? 0);
      case 'cache_read':  return fmt(s.usage.cache_read_input_tokens ?? 0);
      case 'output':      return fmt(s.usage.output_tokens ?? 0);
      case 'subagents':   return `${fmt(s.subagentCount)} (${fmt(s.subagentTokens)})`;
      case 'cost':        return cost !== null ? `$${cost.toFixed(4)}` : '-';
      default:            return '';
    }
  });
}

export function renderMd(summaries, costlySessions, costlySubagents, grandTotals, theme) {
  const cols = theme.columns ?? Object.keys(COL_HEADERS);
  const lines = [];
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  lines.push('# Claude Code Token Usage Analysis');
  lines.push(`\nGenerated: ${now}\n`);

  lines.push('## Grand Totals\n');
  lines.push(`- **Projects**: ${grandTotals.projects}`);
  lines.push(`- **Sessions**: ${fmt(grandTotals.sessions)}`);
  lines.push(`- **Total tokens**: ${fmt(grandTotals.totalTokens)}`);
  lines.push(`  - Input: ${fmt(grandTotals.input)}`);
  lines.push(`  - Cache creation: ${fmt(grandTotals.cacheCreate)}`);
  lines.push(`  - Cache read: ${fmt(grandTotals.cacheRead)}`);
  lines.push(`  - Output: ${fmt(grandTotals.output)}`);
  lines.push(`- **Subagent sessions**: ${fmt(grandTotals.subagentCount)} (${fmt(grandTotals.subagentTokens)} tokens)`);
  lines.push('');

  lines.push('## By Project\n');
  lines.push(`| ${cols.map(c => COL_HEADERS[c] ?? c).join(' | ')} |`);
  lines.push(`| ${cols.map(() => '---').join(' | ')} |`);
  for (const s of summaries) {
    lines.push(`| ${projectRow(s, cols, theme).join(' | ')} |`);
  }
  lines.push('');

  lines.push('## Most Costly Sessions\n');
  for (const [i, [proj, session]] of costlySessions.entries()) {
    lines.push(`### ${i + 1}. ${theme.formatProject(proj)} — ${fmt(session.totalTokens)} tokens`);
    lines.push(`- **Session**: \`${session.sessionId}\``);
    if (session.timestampStart) {
      lines.push(`- **Started**: ${session.timestampStart.slice(0, 19).replace('T', ' ')}`);
    }
    const u = session.usage;
    lines.push(`- **Tokens**: input=${fmt(u.input_tokens ?? 0)}, cache_create=${fmt(u.cache_creation_input_tokens ?? 0)}, cache_read=${fmt(u.cache_read_input_tokens ?? 0)}, output=${fmt(u.output_tokens ?? 0)}`);
    lines.push(`- **Subagents in session**: ${session.subagentSessions.length}`);
    if (session.prompts.length > 0) {
      const first = session.prompts[0].text.slice(0, 400).replace(/\n/g, ' ');
      lines.push(`- **First prompt**:\n  > ${first}`);
    }
    lines.push('');
  }

  lines.push('## Most Costly Subagents\n');
  lines.push('| # | Project | Parent | File | Total | Input | Output |');
  lines.push('|---|---------|--------|------|-------|-------|--------|');
  for (const [i, [proj, sid, sub]] of costlySubagents.entries()) {
    const u = sub.usage;
    const totalInput = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    lines.push(`| ${i + 1} | ${theme.formatProject(proj)} | \`${sid.slice(0, 8)}...\` | \`${sub.subagentFile ?? '?'}\` | ${fmt(sub.totalTokens)} | ${fmt(totalInput)} | ${fmt(u.output_tokens ?? 0)} |`);
  }
  lines.push('');

  return lines.join('\n');
}

export function renderJson(summaries, costlySessions, costlySubagents, grandTotals, theme) {
  return JSON.stringify({
    generatedAt: new Date().toISOString(),
    grandTotals,
    summaries: summaries.map(s => ({
      ...s,
      project: theme.formatProject(s.project),
    })),
    costlySessions: costlySessions.map(([proj, session]) => ({
      project: theme.formatProject(proj),
      sessionId: session.sessionId,
      totalTokens: session.totalTokens,
      usage: session.usage,
      timestampStart: session.timestampStart,
      firstPrompt: session.prompts[0]?.text ?? null,
    })),
    costlySubagents: costlySubagents.map(([proj, sid, sub]) => ({
      project: theme.formatProject(proj),
      parentSessionId: sid,
      subagentFile: sub.subagentFile,
      totalTokens: sub.totalTokens,
      usage: sub.usage,
    })),
  }, null, 2);
}

export function renderCsv(summaries, theme) {
  const cols = theme.columns ?? Object.keys(COL_HEADERS);
  const header = cols.map(c => COL_HEADERS[c] ?? c).join(',');
  const rows = summaries.map(s => projectRow(s, cols, theme).join(','));
  return [header, ...rows].join('\n') + '\n';
}

export function renderTable(summaries, costlySessions, costlySubagents, grandTotals, theme) {
  const cols = theme.columns ?? Object.keys(COL_HEADERS);
  const topNSessions = theme.topN?.sessions ?? 10;
  const topNSubagents = theme.topN?.subagents ?? 5;
  const out = [];

  // Grand totals
  out.push(chalk.bold.cyan('\n── Claude Token Usage ' + '─'.repeat(40)));
  out.push(`  Projects:  ${fmt(grandTotals.projects)}    Sessions: ${fmt(grandTotals.sessions)}`);
  out.push(`  Total:     ${chalk.bold(fmt(grandTotals.totalTokens))} tokens`);
  out.push(`    ${chalk.dim('Input:')}         ${fmt(grandTotals.input)}`);
  out.push(`    ${chalk.dim('Cache create:')}  ${fmt(grandTotals.cacheCreate)}`);
  out.push(`    ${chalk.dim('Cache read:')}    ${fmt(grandTotals.cacheRead)}`);
  out.push(`    ${chalk.dim('Output:')}        ${fmt(grandTotals.output)}`);
  out.push(`  Subagents: ${fmt(grandTotals.subagentCount)} sessions (${fmt(grandTotals.subagentTokens)} tokens)`);

  // Per-project table
  out.push(chalk.bold('\n── By Project ' + '─'.repeat(48)));
  const projTable = new Table({ head: cols.map(c => chalk.bold(COL_HEADERS[c] ?? c)) });
  for (const s of summaries) {
    projTable.push(projectRow(s, cols, theme));
  }
  out.push(projTable.toString());

  // Costliest sessions
  out.push(chalk.bold(`\n── Top ${topNSessions} Costliest Sessions ` + '─'.repeat(35)));
  for (const [proj, session] of costlySessions) {
    const ts = session.timestampStart?.slice(0, 10) ?? '?';
    out.push(`  [${ts}] ${chalk.yellow(theme.formatProject(proj))}: ${chalk.bold(fmt(session.totalTokens))} tokens`);
    if (session.prompts.length > 0) {
      const preview = session.prompts[0].text.slice(0, 80).replace(/\n/g, ' ');
      out.push(`    ${chalk.dim('→')} ${preview}`);
    }
  }

  // Costliest subagents
  out.push(chalk.bold(`\n── Top ${topNSubagents} Costliest Subagents ` + '─'.repeat(35)));
  const subTable = new Table({
    head: ['#', 'Project', 'Parent', 'File', 'Total', 'Input', 'Output'].map(h => chalk.bold(h)),
  });
  for (const [i, [proj, sid, sub]] of costlySubagents.entries()) {
    const u = sub.usage;
    const totalInput = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    subTable.push([
      i + 1,
      theme.formatProject(proj),
      sid.slice(0, 8) + '…',
      sub.subagentFile ?? '?',
      fmt(sub.totalTokens),
      fmt(totalInput),
      fmt(u.output_tokens ?? 0),
    ]);
  }
  out.push(subTable.toString());

  return out.join('\n');
}

export function writePromptFiles(projects, outputDir, theme) {
  const promptsDir = path.join(outputDir, 'prompts');
  mkdirSync(promptsDir, { recursive: true });

  for (const [projectName, sessions] of Object.entries(projects)) {
    const allPrompts = [];
    for (const session of sessions) {
      for (const prompt of session.prompts) {
        allPrompts.push({ ...prompt, sessionId: session.sessionId });
      }
    }
    if (allPrompts.length === 0) continue;

    allPrompts.sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''));

    const safeName = projectName.replace(/[/\\]/g, '_').slice(0, 80);
    const lines = [];
    lines.push(`# Prompts: ${theme.formatProject(projectName)}`);
    lines.push(`\n${allPrompts.length} prompts across ${sessions.length} sessions\n`);

    for (const [i, p] of allPrompts.entries()) {
      const ts = p.timestamp ? p.timestamp.slice(0, 19).replace('T', ' ') : 'unknown';
      lines.push(`## ${i + 1}. [${ts}] Session \`${p.sessionId.slice(0, 8)}\``);
      if (p.entrypoint) lines.push(`*entrypoint: ${p.entrypoint}*`);
      lines.push('');
      lines.push(p.text);
      lines.push('');
    }

    writeFileSync(path.join(promptsDir, `${safeName}.md`), lines.join('\n'));
  }
}

export function output(content, format, config, outputDir) {
  if (!config.save) {
    process.stdout.write(content + '\n');
    return;
  }

  // When saving table format, write as md
  const ext = format === 'table' ? 'md' : format;
  mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `token_report.${ext}`);
  writeFileSync(filePath, content + '\n');
  console.error(`Report written: ${filePath}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test test/reporter.test.js
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/reporter.js test/reporter.test.js
git commit -m "feat: add reporter with table, md, json, csv formats and file writing"
```

---

## Task 8: bin/analyze.js — CLI entry point

**Files:**
- Create: `bin/analyze.js`

- [ ] **Step 1: Create the CLI entry point**

Create `bin/analyze.js`:

```js
#!/usr/bin/env node
import { program } from 'commander';
import { createRequire } from 'module';
import path from 'path';
import { pathToFileURL } from 'url';

import { buildConfig } from '../src/config.js';
import { parseAllProjects } from '../src/parser.js';
import { summarizeProjects, findCostlySessions, findCostlySubagents, computeGrandTotals } from '../src/analyzer.js';
import { renderTable, renderMd, renderJson, renderCsv, writePromptFiles, output } from '../src/reporter.js';
import defaultTheme from '../themes/default.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

program
  .name('claude-tokens')
  .description('Analyze Claude Code token usage from ~/.claude/projects/')
  .version(pkg.version)
  .option('-f, --format <type>', 'output format: table | md | json | csv', 'table')
  .option('-s, --save', 'save output to disk (./claude-token-report/ by default)')
  .option('-o, --output <dir>', 'output directory (implies --save)')
  .option('-t, --theme <path>', 'path to custom theme file')
  .option('--strip-prefix <prefix>', 'override auto-detected home-path prefix')
  .option('--since-days <n>', 'only include sessions from last N days', parseInt)
  .option('--since-date <date>', 'only include sessions since date (YYYY-MM-DD)')
  .parse(process.argv);

const opts = program.opts();

async function loadTheme(themePath) {
  if (!themePath) return defaultTheme;
  try {
    const resolved = path.resolve(themePath);
    const mod = await import(pathToFileURL(resolved).href);
    return { ...defaultTheme, ...mod.default };
  } catch (err) {
    console.error(`Error loading theme: ${themePath}\n${err.message}`);
    process.exit(1);
  }
}

async function main() {
  const theme = await loadTheme(opts.theme);

  const config = buildConfig({
    format: opts.format,
    save: opts.save,
    output: opts.output,
    stripPrefix: opts.stripPrefix ?? theme.stripPrefix ?? null,
    sinceDays: opts.sinceDays,
    sinceDate: opts.sinceDate,
  });

  let projects;
  try {
    projects = parseAllProjects(config.projectsDir, config);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const summaries = summarizeProjects(projects);
  const topNSessions = theme.topN?.sessions ?? 10;
  const topNSubagents = theme.topN?.subagents ?? 5;
  const costlySessions = findCostlySessions(projects, topNSessions);
  const costlySubagents = findCostlySubagents(projects, topNSubagents);
  const grandTotals = computeGrandTotals(summaries);

  let content;
  switch (config.format) {
    case 'md':
      content = renderMd(summaries, costlySessions, costlySubagents, grandTotals, theme);
      break;
    case 'json':
      content = renderJson(summaries, costlySessions, costlySubagents, grandTotals, theme);
      break;
    case 'csv':
      content = renderCsv(summaries, theme);
      break;
    default:
      content = renderTable(summaries, costlySessions, costlySubagents, grandTotals, theme);
  }

  output(content, config.format, config, config.outputDir);

  if (config.save) {
    writePromptFiles(projects, config.outputDir, theme);
    console.error(`Prompts: ${config.outputDir}/prompts/`);
  }
}

main();
```

- [ ] **Step 2: Make the entry point executable**

```bash
chmod +x bin/analyze.js
```

- [ ] **Step 3: Smoke test — run the CLI**

```bash
node bin/analyze.js --help
```

Expected output: commander-generated help showing all flags with descriptions.

- [ ] **Step 4: Commit**

```bash
git add bin/analyze.js
git commit -m "feat: add CLI entry point with commander"
```

---

## Task 9: Integration Smoke Test

**Files:** No new files — run against real data.

- [ ] **Step 1: Run unit test suite to confirm everything passes**

```bash
node --test test/**/*.test.js
```

Expected: all tests PASS (config, parser, analyzer, reporter)

- [ ] **Step 2: Run against real ~/.claude/projects/**

```bash
node bin/analyze.js
```

Expected: terminal table output with your actual projects and sessions. Verify:
- Project names look correct (home-path prefix stripped)
- Token counts are non-zero
- Subagent counts appear where expected

- [ ] **Step 3: Test time filter**

```bash
SINCE_DAYS=7 node bin/analyze.js
```

Expected: fewer projects/sessions than the unfiltered run (or same if all sessions are recent).

- [ ] **Step 4: Test md format to stdout**

```bash
node bin/analyze.js --format md | head -30
```

Expected: markdown output starting with `# Claude Code Token Usage Analysis`

- [ ] **Step 5: Test save behavior**

```bash
node bin/analyze.js --save
```

Expected:
- `./claude-token-report/token_report.md` created
- `./claude-token-report/prompts/` directory with per-project `.md` files

- [ ] **Step 6: Test json format**

```bash
node bin/analyze.js --format json | python3 -m json.tool | head -20
```

Expected: valid JSON with `grandTotals`, `summaries`, `costlySessions` keys.

- [ ] **Step 7: Test csv format**

```bash
node bin/analyze.js --format csv
```

Expected: CSV with header row and one data row per project.

- [ ] **Step 8: Test custom theme**

```bash
node bin/analyze.js --theme themes/minimal.js
```

Expected: terminal table with only the columns defined in `themes/minimal.js` (`project`, `sessions`, `total_tokens`).

- [ ] **Step 9: Final commit**

```bash
git add -A
git commit -m "feat: complete claude-token-analyzer CLI"
```
