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

The default output is a colorized terminal display with a summary panel, borderless tables with inline bar charts, and compact number formatting:

```
╭ Claude Token Usage ──────────────────────────────────────────╮
│                                                              │
│  Projects  12    Sessions  87                                │
│                                                              │
│  Total tokens  2,499,731,501                                 │
│    ▸ Input              518,390  0.0%                        │
│    ▸ Cache create    93,164,656  3.7%                        │
│    ▸ Cache read   2,400,148,933  96.0%                       │
│    ▸ Output           5,899,522  0.2%                        │
│                                                              │
│  Subagents  515 sessions  (1,021,536,546 tokens)             │
│                                                              │
╰──────────────────────────────────────────────────────────────╯

── By Project ─────────────────────────────────────────────────

  Project                Sessions   Total  Input  Cache+  Cache~  Output  Subagents
  ──────────────────────────────────────────────────────────────────────────────────
  my-project                  45    1.8B  █████████████████████░░░  80.0K  12.0M  267.0M  920.0K  50 (100.0M)
  another-project             22  100.0M  █████░░░░░░░░░░░░░░░░░░  25.0K   4.0M   95.5M  475.0K  30 (55.0M)
  small-project                5   12.5M  █░░░░░░░░░░░░░░░░░░░░░░   3.2K  800.0K  11.5M   42.1K   2 (1.2M)

  Top 10 Sessions
  ──────────────────────────────────────────────────────────────
   1.    1.8B  my-project              2025-04-01  abc12345…
         → refactor the authentication module to use JWT
   2.  100.0M  another-project         2025-03-28  def67890…
         → add search indexing for products

  Top 5 Subagents
  ──────────────────────────────────────────────────────────────
    Total  Project          Parent     File           Input  Output
     5.0M  my-project       abc123…    sub1.jsonl     4.8M  200.0K
     2.1M  another-project  def678…    sub2.jsonl     1.9M  150.3K
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
