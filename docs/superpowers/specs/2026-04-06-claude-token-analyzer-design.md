# Claude Token Analyzer — Design Spec

**Date:** 2026-04-06  
**Status:** Approved

---

## Overview

A Node.js CLI tool that analyzes `~/.claude/projects/` JSONL files for token usage patterns. It is a direct port of an existing Python script, shaped into an npx-runnable terminal-first tool with themed output, multiple output formats, and per-project prompt exports.

Primary use case: run from the terminal (`npx claude-token-analyzer`) and get a clear, readable breakdown of token spend across Claude Code sessions.

---

## Goals

- **Terminal-first** — default output is a pretty table in the terminal, no files written unless explicitly requested
- **npx-runnable** — no global install required; `npx claude-token-analyzer` works out of the box
- **Themeable** — a plain JS object controls display, costs, and column choices
- **Multiple output formats** — `table` (default), `md`, `json`, `csv`
- **Auto-detect project name prefix** — strips the home-path prefix from Claude's directory names automatically, with easy override

---

## Architecture & Data Flow

```
bin/analyze.js
  ↓  parse CLI args via commander, load theme
src/config.js       → resolves ~/.claude/projects path, env vars, output dir, prefix
  ↓
src/parser.js       → reads JSONL files, returns session objects (including subagents)
  ↓
src/analyzer.js     → aggregates sessions into project summaries + rankings
  ↓
src/reporter.js     → formats and outputs (table → stdout, md/json/csv → stdout or file)
```

Each module is a plain function pipeline — no classes, no streams, no framework. Data is loaded fully into memory, which is appropriate for the scale of `~/.claude/projects/`.

---

## File Structure

```
claude-token-analyzer/
├── package.json
├── bin/
│   └── analyze.js          # CLI entry point
├── src/
│   ├── parser.js           # JSONL parsing (port of Python)
│   ├── analyzer.js         # Aggregation and summaries
│   ├── reporter.js         # Format selection and output
│   └── config.js           # Paths, env vars, CLI flags, prefix detection
├── themes/
│   ├── default.js          # Default color/format config
│   └── minimal.js          # Example custom theme
└── docs/
    └── superpowers/specs/  # This file
```

---

## CLI Interface

```bash
# Default — pretty table to terminal
npx claude-token-analyzer

# Time filters (env vars, matching Python behavior)
SINCE_DAYS=7 npx claude-token-analyzer
SINCE_DATE=2026-03-30 npx claude-token-analyzer

# Output formats (all to stdout unless --save is also passed)
claude-tokens --format table   # default
claude-tokens --format md
claude-tokens --format json
claude-tokens --format csv

# Save output to disk
claude-tokens --save                    # writes to ./claude-token-report/
claude-tokens --format md --save        # writes md to ./claude-token-report/
claude-tokens --output ./reports/       # implies --save, custom dir

# Custom theme
claude-tokens --theme ./themes/my-theme.js

# Prefix override (for non-standard setups or Windows)
claude-tokens --strip-prefix "-Users-myname-"

# Help and version
claude-tokens --help
claude-tokens --version
```

**`--save` behavior:**
- Writes `<output-dir>/token_report.<ext>` (ext matches --format, defaults to `md`)
- When `--format table` is used with `--save`, the saved file is written as `md` (table format is terminal-only)
- Writes `<output-dir>/prompts/<project>.md` for every project with human prompts
- Default output dir: `./claude-token-report/`
- `--output <dir>` implies `--save`

---

## Terminal Table Output (default)

Four sections printed to stdout:

1. **Grand totals** — projects, sessions, total tokens, per-type breakdown (input / cache create / cache read / output), subagent count + tokens
2. **Per-project table** — columns: project, sessions, total tokens, input, cache create, cache read, output, subagents (count + tokens)
3. **Top N costliest sessions** — default `topN.sessions = 10`, configurable via theme
4. **Top N costliest subagents** — default `topN.subagents = 5`, configurable via theme

Rendered with `cli-table3` for aligned columns. Section headers and totals use `chalk` for color.

---

## Theming

Themes are plain ES module default exports loaded at runtime via `--theme <path>`. All fields are optional — the default theme fills in anything not specified.

```js
// themes/my-theme.js
export default {
  // Cost per token in USD
  currency: {
    input: 0.000003,
    output: 0.000015,
    cacheCreate: 0.00000375,
    cacheRead: 0.0000003,
  },

  // How many rows to show in ranking tables
  topN: {
    sessions: 10,
    subagents: 5,
  },

  // Which columns appear in the per-project table
  // Valid values: 'project' | 'sessions' | 'total_tokens' | 'input' |
  //               'cache_create' | 'cache_read' | 'output' | 'subagents' | 'cost'
  // 'cost' only renders if currency rates are provided
  columns: ['project', 'sessions', 'total_tokens', 'cost'],

  // Transform project name before display
  formatProject: (name) => name.toUpperCase(),

  // Override auto-detected home-path prefix strip
  // Auto-detected as: os.homedir().replace(/[\\/]/g, '-').replace(/^-/, '')
  stripPrefix: null,  // set to e.g. "-Users-myname-" to override
}
```

---

## Project Name Auto-Detection

Claude Code names project directories after the absolute path with separators replaced by `-`. For example: `/Users/pessini/my-project` → `-Users-pessini-my-project`.

The prefix (`-Users-pessini-`) is stripped for display. Detection logic:

```js
// config.js
import os from 'os';

function buildStripPrefix() {
  // /Users/pessini  →  Users-pessini  →  -Users-pessini-
  const home = os.homedir();
  const normalized = home.replace(/[\\/]/g, '-').replace(/^-/, '');
  return `-${normalized}-`;
}
```

This is best-effort: it works correctly on Mac/Linux and makes a reasonable attempt on Windows. The `--strip-prefix` flag and the theme's `stripPrefix` field both override it. If stripping produces an empty string, the original directory name is used as-is.

---

## Data Model

### Session object (output of `parser.js`)

```js
{
  file: string,
  sessionId: string,
  agentId: string | null,
  isSubagent: boolean,
  timestampStart: string | null,
  usage: {
    input_tokens: number,
    cache_creation_input_tokens: number,
    cache_read_input_tokens: number,
    output_tokens: number,
  },
  totalTokens: number,
  prompts: Array<{ text: string, timestamp: string, entrypoint: string }>,
  subagentSessions: Session[],
}
```

### Project summary object (output of `analyzer.js`)

```js
{
  project: string,
  sessions: number,
  usage: { input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens },
  totalTokens: number,
  subagentTokens: number,
  subagentCount: number,
}
```

---

## Error Handling

- `~/.claude/projects/` does not exist → print a clear error message and exit 1
- Individual JSONL files that fail to parse → skip with a stderr warning, continue
- Theme file not found → exit 1 with a clear message
- `--output` directory cannot be created → exit 1 with OS error

---

## Dependencies

```json
{
  "dependencies": {
    "cli-table3": "^0.6.3",
    "chalk": "^5.3.0",
    "commander": "^12.0.0"
  }
}
```

- **`cli-table3`** — terminal table rendering
- **`chalk`** — section headers and summary colors
- **`commander`** — CLI argument parsing, `--help` generation, `--version`

`md`, `json`, and `csv` formats are pure string formatting — no additional deps.

---

## Cost Calculation

Cost is an optional v1 feature — it only activates when the theme provides `currency` rates. The Python script does not calculate costs; this is additive.

- When `currency` is set in the theme, a `cost` column is available in `columns` and a cost total appears in the grand summary
- Cost = `(input_tokens * currency.input) + (output_tokens * currency.output) + (cache_creation_input_tokens * currency.cacheCreate) + (cache_read_input_tokens * currency.cacheRead)`
- The default theme ships with **no currency rates** — the `cost` column is hidden unless the user adds their own theme with rates
- This keeps the default output consistent with the Python script's behavior

---

## Out of Scope

- Importing as a library (`import { analyze } from 'claude-token-analyzer'`) — not a goal for v1
- Streaming / memory-efficient processing — not needed at this scale
- Publishing to npm — can be done later; for now `npx` from a git repo works
- Windows path testing — best-effort auto-detection; manual `--strip-prefix` override is the escape hatch
