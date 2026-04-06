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

  // Override auto-detected home-path prefix (null = use auto-detection)
  stripPrefix: null,
};
