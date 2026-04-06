export default {
  currency: null,

  topN: {
    sessions: 5,
    subagents: 3,
  },

  columns: ['project', 'sessions', 'total_tokens'],

  formatProject: (name) => name,

  stripPrefix: null,
};
