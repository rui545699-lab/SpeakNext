const firstUseProfile = {
  sessionCount: 0,
  totalRounds: 0,
  skills: {
    contentStart: { observedCount: 0, successfulInterventionCount: 0 },
    contentExpand: { observedCount: 0, successfulInterventionCount: 0 },
    lexicalRetrieval: { observedCount: 0, successfulInterventionCount: 0 },
    informationOrder: { observedCount: 0, successfulInterventionCount: 0 }
  },
  interventions: {
    semanticContrast: { used: 0, success: 0 },
    detailPrompt: { used: 0, success: 0 },
    directCandidate: { used: 0, success: 0 }
  }
};

const returningProfile = {
  sessionCount: 4,
  totalRounds: 7,
  skills: {
    contentStart: { observedCount: 2, successfulInterventionCount: 2 },
    contentExpand: { observedCount: 4, successfulInterventionCount: 3 },
    lexicalRetrieval: { observedCount: 5, successfulInterventionCount: 4 },
    informationOrder: { observedCount: 2, successfulInterventionCount: 1 }
  },
  interventions: {
    semanticContrast: { used: 3, success: 3 },
    detailPrompt: { used: 2, success: 2 },
    directCandidate: { used: 2, success: 1 }
  }
};

module.exports = { firstUseProfile, returningProfile };
