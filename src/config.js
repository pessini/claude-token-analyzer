import os from 'os';
import path from 'path';

export function buildStripPrefix() {
  const home = os.homedir();
  const normalized = home.replace(/[\\/:]/g, '-').replace(/^-/, '').replace(/-+/g, '-');
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
