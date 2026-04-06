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
