# claude-token-analyzer

Analyze [Claude Code](https://docs.anthropic.com/en/docs/claude-code) token usage across all your projects. Get a clear breakdown of token spend per project, per session, and per subagent — directly in your terminal.

```
npx claude-token-analyzer
```

## What it does

Claude Code stores conversation data as JSONL files in `~/.claude/projects/`. This tool reads those files and gives you:

- **Grand totals** — total tokens across all projects, broken down by type (input, cache creation, cache read, output)
- **Per-project table** — sessions, token counts, and subagent usage for each project
- **Top costliest sessions** — ranked by total tokens, with the first prompt as context
- **Top costliest subagents** — ranked subagent sessions across all projects

## Install

```bash
# Run directly (no install needed)
npx claude-token-analyzer

# Or install globally
npm install -g claude-token-analyzer
claude-tokens
```

## Usage

```
claude-tokens [options]

Options:
  -V, --version            output the version number
  -f, --format <type>      output format: table | md | json | csv (default: "table")
  -s, --save               save output to disk (./claude-token-report/ by default)
  -o, --output <dir>       output directory (implies --save)
  -t, --theme <path>       path to custom theme file
  --strip-prefix <prefix>  override auto-detected home-path prefix
  --since-days <n>         only include sessions from last N days
  --since-date <date>      only include sessions since date (YYYY-MM-DD)
  -h, --help               display help for command
```

### Examples

```bash
# Default — pretty table to terminal
claude-tokens

# Last 7 days only
claude-tokens --since-days 7

# Since a specific date
claude-tokens --since-date 2025-03-01

# Markdown output
claude-tokens --format md

# JSON output (pipe to jq, etc.)
claude-tokens --format json | jq '.grandTotals'

# CSV for spreadsheets
claude-tokens --format csv > tokens.csv

# Save full report + prompt exports to disk
claude-tokens --save

# Save to custom directory
claude-tokens --output ./my-reports

# Environment variables work too
SINCE_DAYS=7 claude-tokens
```

## Output formats

### Table (default)

The default output is a colorized terminal table:

```
── Claude Token Usage ────────────────────────────────────────
  Projects:  12    Sessions: 87
  Total:     450,231,000 tokens
    Input:         120,000
    Cache create:  18,500,000
    Cache read:    430,100,000
    Output:        1,511,000
  Subagents: 95 sessions (180,000,000 tokens)

── By Project ────────────────────────────────────────────────
┌──────────────────────┬──────────┬───────────────┬─────────┬────────────┬───────────────┬─────────┬───────────────────┐
│ Project              │ Sessions │ Total         │ Input   │ Cache+     │ Cache~        │ Output  │ Subagents         │
├──────────────────────┼──────────┼───────────────┼─────────┼────────────┼───────────────┼─────────┼───────────────────┤
│ my-project           │ 45       │ 280,000,000   │ 80,000  │ 12,000,000 │ 267,000,000   │ 920,000 │ 50 (100,000,000)  │
│ another-project      │ 22       │ 100,000,000   │ 25,000  │  4,000,000 │  95,500,000   │ 475,000 │ 30 (55,000,000)   │
└──────────────────────┴──────────┴───────────────┴─────────┴────────────┴───────────────┴─────────┴───────────────────┘

── Top 10 Costliest Sessions ───────────────────────────────
  [2025-04-01] my-project: 15,000,000 tokens
    → refactor the authentication module to use JWT

── Top 5 Costliest Subagents ───────────────────────────────
┌───┬──────────────┬──────────┬──────────┬───────────┬─────────┬────────┐
│ # │ Project      │ Parent   │ File     │ Total     │ Input   │ Output │
├───┼──────────────┼──────────┼──────────┼───────────┼─────────┼────────┤
│ 1 │ my-project   │ abc123…  │ sub1.jsonl│ 5,000,000│ 4,800,000│200,000│
└───┴──────────────┴──────────┴──────────┴───────────┴─────────┴────────┘
```

### Markdown

```bash
claude-tokens --format md
```

Generates a GitHub-compatible Markdown report with tables and sections.

### JSON

```bash
claude-tokens --format json
```

Structured JSON with `grandTotals`, `summaries`, `costlySessions`, and `costlySubagents`. Pipe to `jq` for filtering:

```bash
# Top 3 projects by token usage
claude-tokens --format json | jq '.summaries[:3] | .[].project'
```

### CSV

```bash
claude-tokens --format csv
```

One row per project. Import into Google Sheets, Excel, etc.

## Saving reports

When `--save` is used, the tool writes:

```
claude-token-report/
├── token_report.md      # (or .json, .csv depending on --format)
└── prompts/
    ├── my-project.md    # all human prompts from this project
    └── another-project.md
```

The `prompts/` directory contains every human prompt sent to Claude, organized by project and sorted chronologically.

## Theming

Create a custom theme to control display, costs, and column selection:

```js
// my-theme.js
export default {
  // Cost per token (USD) — enables the "cost" column
  currency: {
    input: 0.000003,
    output: 0.000015,
    cacheCreate: 0.00000375,
    cacheRead: 0.0000003,
  },

  // How many rows in ranking tables
  topN: {
    sessions: 20,
    subagents: 10,
  },

  // Which columns to show
  // Options: project, sessions, total_tokens, input, cache_create, cache_read, output, subagents, cost
  columns: ['project', 'sessions', 'total_tokens', 'cost'],

  // Transform project names
  formatProject: (name) => name.replace(/-/g, '/'),

  // Override auto-detected home-path prefix
  stripPrefix: null,
};
```

```bash
claude-tokens --theme ./my-theme.js
```

### Cost calculation

Cost is only shown when your theme provides `currency` rates. The default theme ships without rates, so no cost column appears unless you add one.

## Project name detection

Claude Code names project directories after the absolute path with separators replaced by `-`. For example:

```
/Users/you/my-project → -Users-you-my-project
```

The tool auto-detects your home directory prefix and strips it, so you see `my-project` instead of `-Users-you-my-project`. Use `--strip-prefix` to override if the auto-detection doesn't work for your setup.

## Programmatic API

You can also import individual modules:

```js
import { buildConfig } from 'claude-token-analyzer/config';
import { parseAllProjects } from 'claude-token-analyzer/parser';
import { summarizeProjects, computeGrandTotals } from 'claude-token-analyzer/analyzer';

const config = buildConfig({ sinceDays: 7 });
const projects = parseAllProjects(config.projectsDir, config);
const summaries = summarizeProjects(projects);
const totals = computeGrandTotals(summaries);

console.log(`${totals.projects} projects, ${totals.totalTokens} total tokens`);
```

Or import everything from the barrel:

```js
import { buildConfig, parseAllProjects, summarizeProjects } from 'claude-token-analyzer';
```

## Requirements

- Node.js >= 18
- Claude Code must have been used at least once (`~/.claude/projects/` must exist)

## License

[MIT](LICENSE)
