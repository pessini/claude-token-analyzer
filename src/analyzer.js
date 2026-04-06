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
