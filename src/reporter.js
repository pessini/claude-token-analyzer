import chalk from 'chalk';
import boxen from 'boxen';
import terminalLink from 'terminal-link';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

export function fmt(n) {
  return Number(n).toLocaleString();
}

export function fmtCompact(n) {
  const v = Number(n);
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 10_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toLocaleString();
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
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
      case 'project':      return theme.formatProject(s.project);
      case 'sessions':     return fmt(s.sessions);
      case 'total_tokens': return fmt(s.totalTokens);
      case 'input':        return fmt(s.usage.input_tokens ?? 0);
      case 'cache_create': return fmt(s.usage.cache_creation_input_tokens ?? 0);
      case 'cache_read':   return fmt(s.usage.cache_read_input_tokens ?? 0);
      case 'output':       return fmt(s.usage.output_tokens ?? 0);
      case 'subagents':    return `${fmt(s.subagentCount)} (${fmt(s.subagentTokens)})`;
      case 'cost':         return cost !== null ? `$${cost.toFixed(4)}` : '-';
      default:             return '';
    }
  });
}

function projectRowCompact(s, cols, theme, maxProjectLen) {
  const cost = theme.currency ? calcCost(s.usage, theme.currency) : null;
  return cols.map(c => {
    switch (c) {
      case 'project':      return truncate(theme.formatProject(s.project), maxProjectLen);
      case 'sessions':     return { content: String(s.sessions), hAlign: 'right' };
      case 'total_tokens': return { content: chalk.bold(fmtCompact(s.totalTokens)), hAlign: 'right' };
      case 'input':        return { content: fmtCompact(s.usage.input_tokens ?? 0), hAlign: 'right' };
      case 'cache_create': return { content: fmtCompact(s.usage.cache_creation_input_tokens ?? 0), hAlign: 'right' };
      case 'cache_read':   return { content: fmtCompact(s.usage.cache_read_input_tokens ?? 0), hAlign: 'right' };
      case 'output':       return { content: fmtCompact(s.usage.output_tokens ?? 0), hAlign: 'right' };
      case 'subagents':    return { content: `${s.subagentCount} (${fmtCompact(s.subagentTokens)})`, hAlign: 'right' };
      case 'cost':         return { content: cost !== null ? `$${cost.toFixed(2)}` : '-', hAlign: 'right' };
      default:             return '';
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

function csvRow(s, cols, theme) {
  const cost = theme.currency ? calcCost(s.usage, theme.currency) : null;
  return cols.map(c => {
    let val;
    switch (c) {
      case 'project':      val = theme.formatProject(s.project); break;
      case 'sessions':     val = s.sessions; break;
      case 'total_tokens': val = s.totalTokens; break;
      case 'input':        val = s.usage.input_tokens ?? 0; break;
      case 'cache_create': val = s.usage.cache_creation_input_tokens ?? 0; break;
      case 'cache_read':   val = s.usage.cache_read_input_tokens ?? 0; break;
      case 'output':       val = s.usage.output_tokens ?? 0; break;
      case 'subagents':    val = s.subagentCount; break;
      case 'cost':         val = cost !== null ? cost.toFixed(4) : ''; break;
      default:             val = '';
    }
    const str = String(val);
    return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
  });
}

export function renderCsv(summaries, theme) {
  const cols = theme.columns ?? Object.keys(COL_HEADERS);
  const header = cols.join(',');
  const rows = summaries.map(s => csvRow(s, cols, theme).join(','));
  return [header, ...rows].join('\n') + '\n';
}

function pct(part, total) {
  if (!total) return chalk.dim('0%');
  return chalk.dim(`${((part / total) * 100).toFixed(1)}%`);
}

function bar(value, max, width = 20) {
  const filled = max > 0 ? Math.round((value / max) * width) : 0;
  const empty = width - filled;
  return chalk.cyan('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function padRight(str, len) {
  const visible = stripAnsi(str).length;
  return str + ' '.repeat(Math.max(0, len - visible));
}

function padLeft(str, len) {
  const visible = stripAnsi(str).length;
  return ' '.repeat(Math.max(0, len - visible)) + str;
}

function renderColumns(rows, aligns) {
  const colWidths = [];
  for (const row of rows) {
    for (let i = 0; i < row.length; i++) {
      const w = stripAnsi(String(row[i])).length;
      colWidths[i] = Math.max(colWidths[i] ?? 0, w);
    }
  }
  return rows.map(row =>
    row.map((cell, i) => {
      const s = String(cell);
      return (aligns[i] === 'r') ? padLeft(s, colWidths[i]) : padRight(s, colWidths[i]);
    }).join('  ')
  );
}

export function renderTable(summaries, costlySessions, costlySubagents, grandTotals, theme) {
  const cols = theme.columns ?? Object.keys(COL_HEADERS);
  const topNSessions = theme.topN?.sessions ?? 10;
  const topNSubagents = theme.topN?.subagents ?? 5;
  const out = [];

  const totalsContent = [
    `${chalk.bold.white('Projects')}  ${chalk.cyan(fmt(grandTotals.projects))}    ${chalk.bold.white('Sessions')}  ${chalk.cyan(fmt(grandTotals.sessions))}`,
    '',
    `${chalk.bold.white('Total tokens')}  ${chalk.bold.cyan(fmt(grandTotals.totalTokens))}`,
    `  ${chalk.green('▸')} Input          ${fmt(grandTotals.input).padStart(15)}  ${pct(grandTotals.input, grandTotals.totalTokens)}`,
    `  ${chalk.yellow('▸')} Cache create   ${fmt(grandTotals.cacheCreate).padStart(15)}  ${pct(grandTotals.cacheCreate, grandTotals.totalTokens)}`,
    `  ${chalk.blue('▸')} Cache read     ${fmt(grandTotals.cacheRead).padStart(15)}  ${pct(grandTotals.cacheRead, grandTotals.totalTokens)}`,
    `  ${chalk.magenta('▸')} Output         ${fmt(grandTotals.output).padStart(15)}  ${pct(grandTotals.output, grandTotals.totalTokens)}`,
    '',
    `${chalk.bold.white('Subagents')}  ${chalk.cyan(fmt(grandTotals.subagentCount))} sessions  ${chalk.dim('(')}${fmt(grandTotals.subagentTokens)} tokens${chalk.dim(')')}`,
  ].join('\n');

  out.push('');
  out.push(boxen(totalsContent, {
    title: chalk.bold.cyan('Claude Token Usage'),
    titleAlignment: 'left',
    padding: 1,
    borderStyle: 'round',
    borderColor: 'cyan',
  }));

  // ── By Project (borderless columns + bar chart) ──
  const termWidth = process.stdout.columns ?? 100;
  const maxProjectLen = Math.min(35, Math.max(15, termWidth - 80));
  const maxTokens = summaries.length > 0 ? summaries[0].totalTokens : 1;
  const barWidth = Math.min(25, Math.max(10, termWidth - 85));

  const cost = theme.currency ? calcCost : null;
  const projRows = summaries.map(s => {
    const cells = [];
    for (const c of cols) {
      switch (c) {
        case 'project':      cells.push(chalk.white(truncate(theme.formatProject(s.project), maxProjectLen))); break;
        case 'sessions':     cells.push(chalk.dim(String(s.sessions))); break;
        case 'total_tokens':
          cells.push(chalk.bold.cyan(fmtCompact(s.totalTokens)));
          cells.push(bar(s.totalTokens, maxTokens, barWidth));
          break;
        case 'input':        cells.push(chalk.green(fmtCompact(s.usage.input_tokens ?? 0))); break;
        case 'cache_create': cells.push(chalk.yellow(fmtCompact(s.usage.cache_creation_input_tokens ?? 0))); break;
        case 'cache_read':   cells.push(chalk.blue(fmtCompact(s.usage.cache_read_input_tokens ?? 0))); break;
        case 'output':       cells.push(chalk.magenta(fmtCompact(s.usage.output_tokens ?? 0))); break;
        case 'subagents':    cells.push(chalk.dim(`${s.subagentCount} (${fmtCompact(s.subagentTokens)})`)); break;
        case 'cost': {
          const c = theme.currency ? calcCost(s.usage, theme.currency) : null;
          cells.push(c !== null ? chalk.green(`$${c.toFixed(2)}`) : chalk.dim('-'));
          break;
        }
        default: cells.push('');
      }
    }
    return cells;
  });

  const headerCells = [];
  const aligns = [];
  for (const c of cols) {
    headerCells.push(chalk.bold(COL_HEADERS[c] ?? c));
    aligns.push(c === 'project' ? 'l' : 'r');
    if (c === 'total_tokens') {
      headerCells.push(chalk.bold(''));
      aligns.push('l');
    }
  }

  out.push('');
  const allRows = [headerCells, ...projRows];
  const rendered = renderColumns(allRows, aligns);
  const headerLine = rendered[0];
  out.push('  ' + headerLine);
  out.push('  ' + chalk.dim('─'.repeat(stripAnsi(headerLine).length)));
  for (let i = 1; i < rendered.length; i++) {
    const prefix = (i % 2 === 0) ? chalk.bgHex('#1a1a2e')('') : '';
    out.push('  ' + rendered[i]);
  }

  // ── Costliest Sessions ──
  out.push(chalk.bold.cyan(`\n  Top ${topNSessions} Sessions`));
  out.push('  ' + chalk.dim('─'.repeat(60)));

  for (const [i, [proj, session]] of costlySessions.entries()) {
    const ts = session.timestampStart?.slice(0, 10) ?? '?';
    const rank = chalk.dim(`${String(i + 1).padStart(2)}.`);
    const sessionLabel = `${session.sessionId.slice(0, 8)}…`;
    const link = terminalLink(sessionLabel, `file://${session.file}`, { fallback: () => sessionLabel });
    const tokens = chalk.bold.cyan(fmtCompact(session.totalTokens));
    const projName = chalk.yellow(truncate(theme.formatProject(proj), maxProjectLen));
    out.push(`  ${rank} ${tokens.padStart(8)}  ${projName}  ${chalk.dim(ts)}  ${chalk.dim(link)}`);
    if (session.prompts.length > 0) {
      const preview = session.prompts[0].text.slice(0, 70).replace(/\n/g, ' ');
      out.push(`      ${chalk.dim('→ ' + preview)}`);
    }
  }

  // ── Costliest Subagents ──
  out.push(chalk.bold.cyan(`\n  Top ${topNSubagents} Subagents`));
  out.push('  ' + chalk.dim('─'.repeat(60)));

  const subRows = costlySubagents.map(([proj, sid, sub], i) => {
    const u = sub.usage;
    const totalInput = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    return [
      chalk.dim(`${String(i + 1).padStart(2)}.`),
      chalk.bold.cyan(fmtCompact(sub.totalTokens)),
      chalk.yellow(truncate(theme.formatProject(proj), 20)),
      chalk.dim(sid.slice(0, 8) + '…'),
      chalk.dim(sub.subagentFile ?? '?'),
      chalk.green(fmtCompact(totalInput)),
      chalk.magenta(fmtCompact(u.output_tokens ?? 0)),
    ];
  });

  const subHeader = [
    chalk.dim('  '),
    chalk.bold('Total'),
    chalk.bold('Project'),
    chalk.bold('Parent'),
    chalk.bold('File'),
    chalk.bold('Input'),
    chalk.bold('Output'),
  ];
  const subAligns = ['l', 'r', 'l', 'l', 'l', 'r', 'r'];
  const subRendered = renderColumns([subHeader, ...subRows], subAligns);
  for (const line of subRendered) {
    out.push('  ' + line);
  }

  out.push('');
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

  const ext = format === 'table' ? 'md' : format;
  mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `token_report.${ext}`);
  writeFileSync(filePath, content + '\n');
  console.error(`Report written: ${filePath}`);
}
