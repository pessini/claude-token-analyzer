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
  const header = cols.join(',');
  const rows = summaries.map(s => projectRow(s, cols, theme).join(','));
  return [header, ...rows].join('\n') + '\n';
}

export function renderTable(summaries, costlySessions, costlySubagents, grandTotals, theme) {
  const cols = theme.columns ?? Object.keys(COL_HEADERS);
  const topNSessions = theme.topN?.sessions ?? 10;
  const topNSubagents = theme.topN?.subagents ?? 5;
  const out = [];

  out.push(chalk.bold.cyan('\n── Claude Token Usage ' + '─'.repeat(40)));
  out.push(`  Projects:  ${fmt(grandTotals.projects)}    Sessions: ${fmt(grandTotals.sessions)}`);
  out.push(`  Total:     ${chalk.bold(fmt(grandTotals.totalTokens))} tokens`);
  out.push(`    ${chalk.dim('Input:')}         ${fmt(grandTotals.input)}`);
  out.push(`    ${chalk.dim('Cache create:')}  ${fmt(grandTotals.cacheCreate)}`);
  out.push(`    ${chalk.dim('Cache read:')}    ${fmt(grandTotals.cacheRead)}`);
  out.push(`    ${chalk.dim('Output:')}        ${fmt(grandTotals.output)}`);
  out.push(`  Subagents: ${fmt(grandTotals.subagentCount)} sessions (${fmt(grandTotals.subagentTokens)} tokens)`);

  out.push(chalk.bold('\n── By Project ' + '─'.repeat(48)));
  const projTable = new Table({ head: cols.map(c => chalk.bold(COL_HEADERS[c] ?? c)) });
  for (const s of summaries) {
    projTable.push(projectRow(s, cols, theme));
  }
  out.push(projTable.toString());

  out.push(chalk.bold(`\n── Top ${topNSessions} Costliest Sessions ` + '─'.repeat(35)));
  for (const [proj, session] of costlySessions) {
    const ts = session.timestampStart?.slice(0, 10) ?? '?';
    out.push(`  [${ts}] ${chalk.yellow(theme.formatProject(proj))}: ${chalk.bold(fmt(session.totalTokens))} tokens`);
    if (session.prompts.length > 0) {
      const preview = session.prompts[0].text.slice(0, 80).replace(/\n/g, ' ');
      out.push(`    ${chalk.dim('→')} ${preview}`);
    }
  }

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

  const ext = format === 'table' ? 'md' : format;
  mkdirSync(outputDir, { recursive: true });
  const filePath = path.join(outputDir, `token_report.${ext}`);
  writeFileSync(filePath, content + '\n');
  console.error(`Report written: ${filePath}`);
}
