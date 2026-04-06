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
