'use strict';

function span(transcript, text) {
  const start = text ? transcript.indexOf(text) : -1;
  return start < 0 ? null : { text, start, end: start + text.length };
}

function point(transcript, id, evidence = '') {
  const grounded = span(transcript, evidence);
  return {
    id,
    covered: Boolean(grounded),
    evidence: grounded ? grounded.text : '',
    start: grounded ? grounded.start : -1,
    end: grounded ? grounded.end : -1
  };
}

function relation(transcript, status, fromEvidence = '', toEvidence = '', relationEvidence = '') {
  return {
    id: 'R2',
    status,
    fromEvidence,
    toEvidence,
    relationEvidence,
    fromSpan: span(transcript, fromEvidence),
    toSpan: span(transcript, toEvidence),
    relationSpan: span(transcript, relationEvidence)
  };
}

function incorrectClaim(transcript, evidence) {
  const grounded = span(transcript, evidence);
  return grounded ? {
    claim: evidence,
    evidence,
    start: grounded.start,
    end: grounded.end
  } : null;
}

function round({
  transcript,
  taskStatus,
  k2 = '',
  k3 = '',
  relationStatus = 'MISSING',
  relationEvidence = '',
  incorrectEvidence = '',
  coreFactsComplete = false,
  processIssue = 'NONE',
  lexicalMarkers = [],
  orderEligible = false,
  processEvidence = '',
  routeEvidence = ''
}) {
  const r2 = relation(transcript, relationStatus, k2, k3, relationEvidence);
  const processEvidenceSpan = span(transcript, processEvidence);
  const routeEvidenceSpan = span(transcript, routeEvidence);
  return {
    transcript,
    taskResult: {
      taskStatus,
      coreMeaningClear: taskStatus === 'PASS',
      coreFactsComplete,
      missingCorePointIds: [k2 ? null : 'K2', k3 ? null : 'K3'].filter(Boolean),
      requiresNewContent: taskStatus === 'MISSING_CORE_CONTENT',
      keyPoints: [
        point(transcript, 'K1'),
        point(transcript, 'K2', k2),
        point(transcript, 'K3', k3),
        point(transcript, 'K4'),
        point(transcript, 'K5')
      ],
      relations: [r2],
      incorrectClaims: incorrectEvidence ? [incorrectClaim(transcript, incorrectEvidence)].filter(Boolean) : []
    },
    processResult: {
      processIssue,
      lexicalMarkers: lexicalMarkers.map((text) => {
        const grounded = span(transcript, text);
        return { text, start: grounded ? grounded.start : -1, end: grounded ? grounded.end : -1 };
      }),
      orderAnalysis: {
        eligible: orderEligible,
        coreFactsPresent: Boolean(k2 && k3),
        requiresNewContent: taskStatus === 'MISSING_CORE_CONTENT',
        expectedOrder: ['K2', 'K3'],
        observedOrder: orderEligible ? ['K3', 'K2'] : ['K2', 'K3'],
        reversedPairs: orderEligible ? [['K2', 'K3']] : [],
        explicitWrongRelation: taskStatus === 'INCORRECT_RELATION'
      },
      evidence: processEvidenceSpan ? [processEvidenceSpan] : [],
      ruleId: processIssue === 'NONE' ? 'PROCESS_NONE' : `PROCESS_${processIssue}`
    },
    routedResult: {
      primaryTrainingNeed: processIssue === 'NONE' ? taskStatus : processIssue,
      recommendedAction: 'FIXTURE_ACTION',
      sourceLayer: processIssue === 'NONE' ? 'TASK' : 'PROCESS',
      ruleId: 'FIXTURE_ROUTE',
      evidence: routeEvidenceSpan ? [{
        text: routeEvidenceSpan.text,
        start: routeEvidenceSpan.start,
        end: routeEvidenceSpan.end,
        type: 'fixture_evidence'
      }] : []
    }
  };
}

const fixtures = [
  {
    id: 'P01_missing_resolved',
    originalTrainingNeed: 'MISSING_CAUSAL_STEP',
    firstRoundResult: round({ transcript: '通知很多，所以重要消息容易漏掉。', taskStatus: 'MISSING_CORE_CONTENT', k3: '重要消息容易漏掉', routeEvidence: '重要消息容易漏掉' }),
    secondRoundResult: round({ transcript: '通知多了以后人会习惯忽略提醒，所以重要消息也容易漏掉。', taskStatus: 'PASS', k2: '人会习惯忽略提醒', k3: '重要消息也容易漏掉', relationStatus: 'CORRECT', relationEvidence: '人会习惯忽略提醒，所以重要消息也容易漏掉', coreFactsComplete: true }),
    gold: { secondTask: 'PASS', secondProcess: 'NONE', resolved: true, improvementType: 'CAUSAL_LINK_ADDED', reasonCode: 'CORE_CHAIN_COMPLETED' }
  },
  {
    id: 'P02_missing_unresolved',
    originalTrainingNeed: 'MISSING_CAUSAL_STEP',
    firstRoundResult: round({ transcript: '通知很多，所以重要消息容易漏掉。', taskStatus: 'MISSING_CORE_CONTENT', k3: '重要消息容易漏掉', routeEvidence: '重要消息容易漏掉' }),
    secondRoundResult: round({ transcript: '通知还是很多，重要消息还是容易漏掉。', taskStatus: 'MISSING_CORE_CONTENT', k3: '重要消息还是容易漏掉', coreFactsComplete: false }),
    gold: { secondTask: 'MISSING_CORE_CONTENT', secondProcess: 'NONE', resolved: false, improvementType: null, reasonCode: 'CORE_CONTENT_STILL_MISSING' }
  },
  {
    id: 'P03_incorrect_resolved',
    originalTrainingNeed: 'INCORRECT_RELATION',
    firstRoundResult: round({ transcript: '因为重要消息被漏掉，所以人开始忽略普通通知。', taskStatus: 'INCORRECT_RELATION', k2: '人开始忽略普通通知', k3: '重要消息被漏掉', relationStatus: 'INCORRECT', relationEvidence: '因为重要消息被漏掉，所以人开始忽略普通通知', incorrectEvidence: '因为重要消息被漏掉，所以人开始忽略普通通知' }),
    secondRoundResult: round({ transcript: '人习惯忽略普通通知以后，重要消息也会一起被漏掉。', taskStatus: 'PASS', k2: '人习惯忽略普通通知', k3: '重要消息也会一起被漏掉', relationStatus: 'CORRECT', relationEvidence: '人习惯忽略普通通知以后，重要消息也会一起被漏掉', coreFactsComplete: true }),
    gold: { secondTask: 'PASS', secondProcess: 'NONE', resolved: true, improvementType: 'RELATION_CORRECTED', reasonCode: 'RELATION_CORRECTED' }
  },
  {
    id: 'P04_incorrect_still_incorrect',
    originalTrainingNeed: 'INCORRECT_RELATION',
    firstRoundResult: round({ transcript: '重要消息漏掉导致人忽略通知。', taskStatus: 'INCORRECT_RELATION', k2: '人忽略通知', k3: '重要消息漏掉', relationStatus: 'INCORRECT', relationEvidence: '重要消息漏掉导致人忽略通知', incorrectEvidence: '重要消息漏掉导致人忽略通知' }),
    secondRoundResult: round({ transcript: '还是因为重要消息漏掉，人们才忽略通知。', taskStatus: 'INCORRECT_RELATION', k2: '人们才忽略通知', k3: '重要消息漏掉', relationStatus: 'INCORRECT', relationEvidence: '因为重要消息漏掉，人们才忽略通知', incorrectEvidence: '因为重要消息漏掉，人们才忽略通知' }),
    gold: { secondTask: 'INCORRECT_RELATION', secondProcess: 'NONE', resolved: false, improvementType: null, reasonCode: 'RELATION_STILL_INCORRECT' }
  },
  {
    id: 'P05_lexical_resolved',
    originalTrainingNeed: 'LEXICAL_RETRIEVAL',
    firstRoundResult: round({ transcript: '通知多了会那个……怎么说……人就不想看。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人就不想看', coreFactsComplete: true, processIssue: 'LEXICAL_RETRIEVAL', lexicalMarkers: ['怎么说'], processEvidence: '怎么说' }),
    secondRoundResult: round({ transcript: '人会习惯忽略通知，重要消息也容易一起漏掉。', taskStatus: 'PASS', k2: '人会习惯忽略通知', k3: '重要消息也容易一起漏掉', relationStatus: 'CORRECT', relationEvidence: '人会习惯忽略通知，重要消息也容易一起漏掉', coreFactsComplete: true }),
    gold: { secondTask: 'PASS', secondProcess: 'NONE', resolved: true, improvementType: 'LEXICAL_BLOCK_RESOLVED', reasonCode: 'LEXICAL_BLOCK_REMOVED' }
  },
  {
    id: 'P06_lexical_content_deleted',
    originalTrainingNeed: 'LEXICAL_RETRIEVAL',
    firstRoundResult: round({ transcript: '通知多了会那个……怎么说……人就不想看。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人就不想看', coreFactsComplete: true, processIssue: 'LEXICAL_RETRIEVAL', lexicalMarkers: ['怎么说'], processEvidence: '怎么说' }),
    secondRoundResult: round({ transcript: '通知确实很多。', taskStatus: 'MISSING_CORE_CONTENT', coreFactsComplete: false }),
    gold: { secondTask: 'MISSING_CORE_CONTENT', secondProcess: 'NONE', resolved: false, improvementType: null, reasonCode: 'CONTENT_REMOVED_WITH_LEXICAL_BLOCK' }
  },
  {
    id: 'P07_order_resolved',
    originalTrainingNeed: 'INFORMATION_ORDER',
    firstRoundResult: round({ transcript: '重要消息先漏掉，然后人不看通知，反正通知很多。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人不看通知', k3: '重要消息先漏掉', coreFactsComplete: true, processIssue: 'INFORMATION_ORDER', orderEligible: true, processEvidence: '重要消息先漏掉，然后人不看通知' }),
    secondRoundResult: round({ transcript: '人先习惯忽略通知，之后重要消息也会被漏掉。', taskStatus: 'PASS', k2: '人先习惯忽略通知', k3: '重要消息也会被漏掉', relationStatus: 'CORRECT', relationEvidence: '人先习惯忽略通知，之后重要消息也会被漏掉', coreFactsComplete: true }),
    gold: { secondTask: 'PASS', secondProcess: 'NONE', resolved: true, improvementType: 'ORDER_CLARIFIED', reasonCode: 'ORDER_ISSUE_REMOVED' }
  },
  {
    id: 'P08_order_still_disordered',
    originalTrainingNeed: 'INFORMATION_ORDER',
    firstRoundResult: round({ transcript: '重要消息先漏掉，然后人不看通知，反正通知很多。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人不看通知', k3: '重要消息先漏掉', coreFactsComplete: true, processIssue: 'INFORMATION_ORDER', orderEligible: true, processEvidence: '重要消息先漏掉，然后人不看通知' }),
    secondRoundResult: round({ transcript: '重要消息漏掉，然后人不看通知，最后又说通知很多。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人不看通知', k3: '重要消息漏掉', coreFactsComplete: true, processIssue: 'INFORMATION_ORDER', orderEligible: true, processEvidence: '重要消息漏掉，然后人不看通知' }),
    gold: { secondTask: 'RELATION_NOT_ESTABLISHED', secondProcess: 'INFORMATION_ORDER', resolved: false, improvementType: null, reasonCode: 'ORDER_ISSUE_STILL_PRESENT' }
  },
  {
    id: 'P09_order_new_incorrect_relation',
    originalTrainingNeed: 'INFORMATION_ORDER',
    firstRoundResult: round({ transcript: '重要消息先漏掉，然后人不看通知。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人不看通知', k3: '重要消息先漏掉', coreFactsComplete: true, processIssue: 'INFORMATION_ORDER', orderEligible: true, processEvidence: '重要消息先漏掉，然后人不看通知' }),
    secondRoundResult: round({ transcript: '因为重要消息被漏掉，所以人开始忽略通知。', taskStatus: 'INCORRECT_RELATION', k2: '人开始忽略通知', k3: '重要消息被漏掉', relationStatus: 'INCORRECT', relationEvidence: '因为重要消息被漏掉，所以人开始忽略通知', incorrectEvidence: '因为重要消息被漏掉，所以人开始忽略通知', coreFactsComplete: true }),
    gold: { secondTask: 'INCORRECT_RELATION', secondProcess: 'NONE', resolved: false, improvementType: null, reasonCode: 'NEW_CORE_ERROR_AFTER_REORDER' }
  },
  {
    id: 'P10_order_resolved_supporting_omission',
    originalTrainingNeed: 'INFORMATION_ORDER',
    firstRoundResult: round({ transcript: '重要消息先漏掉，然后人不看通知。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人不看通知', k3: '重要消息先漏掉', coreFactsComplete: true, processIssue: 'INFORMATION_ORDER', orderEligible: true, processEvidence: '重要消息先漏掉，然后人不看通知' }),
    secondRoundResult: round({ transcript: '人习惯忽略提醒后，重要消息也容易错过。', taskStatus: 'PASS', k2: '人习惯忽略提醒', k3: '重要消息也容易错过', relationStatus: 'CORRECT', relationEvidence: '人习惯忽略提醒后，重要消息也容易错过', coreFactsComplete: true }),
    gold: { secondTask: 'PASS', secondProcess: 'NONE', resolved: true, improvementType: 'ORDER_CLARIFIED', reasonCode: 'ORDER_ISSUE_REMOVED' }
  },
  {
    id: 'P11_uncertain_became_evaluable',
    originalTrainingNeed: 'UNCERTAIN',
    firstRoundResult: round({ transcript: '嗯，我没太看懂。', taskStatus: 'UNCERTAIN', routeEvidence: '没太看懂' }),
    secondRoundResult: round({ transcript: '至少我明白了，人会慢慢忽略通知。', taskStatus: 'MISSING_CORE_CONTENT', k2: '人会慢慢忽略通知' }),
    gold: { secondTask: 'MISSING_CORE_CONTENT', secondProcess: 'NONE', resolved: false, improvementType: 'EVIDENCE_CLARIFIED', reasonCode: 'UNCERTAIN_CLARIFIED_ISSUE_REMAINS' }
  },
  {
    id: 'P12_uncertain_still_uncertain',
    originalTrainingNeed: 'UNCERTAIN',
    firstRoundResult: round({ transcript: '嗯，我没太看懂。', taskStatus: 'UNCERTAIN', routeEvidence: '没太看懂' }),
    secondRoundResult: round({ transcript: '还是不太明白。', taskStatus: 'UNCERTAIN' }),
    gold: { secondTask: 'UNCERTAIN', secondProcess: 'NONE', resolved: false, improvementType: null, reasonCode: 'SECOND_ROUND_STILL_UNCERTAIN' }
  },
  {
    id: 'P13_lexical_contextual_control',
    originalTrainingNeed: 'LEXICAL_RETRIEVAL',
    firstRoundResult: round({ transcript: '通知多了会那个……怎么说……人就不看了。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人就不看了', coreFactsComplete: true, processIssue: 'LEXICAL_RETRIEVAL', lexicalMarkers: ['怎么说'], processEvidence: '怎么说' }),
    secondRoundResult: round({ transcript: '怎么说都可以，关键是人会忽略提醒，重要消息也会漏掉。', taskStatus: 'PASS', k2: '人会忽略提醒', k3: '重要消息也会漏掉', relationStatus: 'CORRECT', relationEvidence: '人会忽略提醒，重要消息也会漏掉', coreFactsComplete: true }),
    gold: { secondTask: 'PASS', secondProcess: 'NONE', resolved: true, improvementType: 'LEXICAL_BLOCK_RESOLVED', reasonCode: 'LEXICAL_BLOCK_REMOVED' }
  },
  {
    id: 'P14_incorrect_resolved_with_filler',
    originalTrainingNeed: 'INCORRECT_RELATION',
    firstRoundResult: round({ transcript: '重要消息漏掉，所以人忽略通知。', taskStatus: 'INCORRECT_RELATION', k2: '人忽略通知', k3: '重要消息漏掉', relationStatus: 'INCORRECT', relationEvidence: '重要消息漏掉，所以人忽略通知', incorrectEvidence: '重要消息漏掉，所以人忽略通知' }),
    secondRoundResult: round({ transcript: '嗯，人习惯忽略通知以后，呃，重要消息也会一起漏掉。', taskStatus: 'PASS', k2: '人习惯忽略通知', k3: '重要消息也会一起漏掉', relationStatus: 'CORRECT', relationEvidence: '人习惯忽略通知以后，呃，重要消息也会一起漏掉', coreFactsComplete: true }),
    gold: { secondTask: 'PASS', secondProcess: 'NONE', resolved: true, improvementType: 'RELATION_CORRECTED', reasonCode: 'RELATION_CORRECTED' }
  },
  {
    id: 'P15_order_resolved_relation_not_established',
    originalTrainingNeed: 'INFORMATION_ORDER',
    firstRoundResult: round({ transcript: '重要消息先漏，然后人不看，最后通知很多。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人不看', k3: '重要消息先漏', coreFactsComplete: true, processIssue: 'INFORMATION_ORDER', orderEligible: true, processEvidence: '重要消息先漏，然后人不看' }),
    secondRoundResult: round({ transcript: '人先习惯忽略通知。重要消息也会被漏掉。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人先习惯忽略通知', k3: '重要消息也会被漏掉', relationStatus: 'MISSING', coreFactsComplete: true }),
    gold: { secondTask: 'RELATION_NOT_ESTABLISHED', secondProcess: 'NONE', resolved: true, improvementType: 'ORDER_CLARIFIED', reasonCode: 'ORDER_ISSUE_REMOVED' }
  },
  {
    id: 'P16_missing_points_present_relation_missing',
    originalTrainingNeed: 'MISSING_CAUSAL_STEP',
    firstRoundResult: round({ transcript: '通知很多，重要消息漏掉。', taskStatus: 'MISSING_CORE_CONTENT', k3: '重要消息漏掉', routeEvidence: '重要消息漏掉' }),
    secondRoundResult: round({ transcript: '人会忽略提醒。重要消息也会漏掉。', taskStatus: 'RELATION_NOT_ESTABLISHED', k2: '人会忽略提醒', k3: '重要消息也会漏掉', relationStatus: 'MISSING', coreFactsComplete: true }),
    gold: { secondTask: 'RELATION_NOT_ESTABLISHED', secondProcess: 'NONE', resolved: false, improvementType: null, reasonCode: 'CORE_RELATION_NOT_ESTABLISHED' }
  }
];

module.exports = Object.freeze(fixtures);
