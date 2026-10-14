const material = require('./fixtures/retelling-001-notification-legacy');
const serverMaterial = {
  id: material.id,
  title: material.title,
  core_message: material.coreMessage,
  key_points: material.keyPoints,
  relations: material.relations
};

function emptyPoints() {
  return material.keyPoints.map((item) => ({ id: item.id, covered: false, evidence: '' }));
}

function emptyRelations() {
  return material.relations.map((item) => ({
    id: item.id,
    status: 'MISSING',
    from_evidence: '',
    to_evidence: '',
    relation_evidence: ''
  }));
}

function candidate(options) {
  const source = options || {};
  const points = emptyPoints();
  const relations = emptyRelations();
  Object.keys(source.points || {}).forEach((id) => {
    const point = points.find((item) => item.id === id);
    if (point) Object.assign(point, { covered: true, evidence: source.points[id] });
  });
  Object.keys(source.relations || {}).forEach((id) => {
    const relation = relations.find((item) => item.id === id);
    if (relation) Object.assign(relation, { status: 'CORRECT' }, source.relations[id]);
  });
  Object.keys(source.incorrectRelations || {}).forEach((id) => {
    const relation = relations.find((item) => item.id === id);
    if (relation) Object.assign(relation, { status: 'INCORRECT' }, source.incorrectRelations[id]);
  });
  Object.keys(source.missingRelations || {}).forEach((id) => {
    const relation = relations.find((item) => item.id === id);
    if (relation) Object.assign(relation, { status: 'MISSING' }, source.missingRelations[id]);
  });
  return {
    core_meaning_clear: source.need == null,
    key_points: points,
    relations,
    incorrect_claims: source.incorrectEvidence
      ? [{ claim: source.incorrectEvidence, evidence: source.incorrectEvidence }]
      : [],
    primary_training_need: source.need == null ? null : source.need,
    recommended_action: source.action || 'PASS',
    evidence: source.primaryEvidence
      ? [{ text: source.primaryEvidence, type: 'primary_need' }]
      : [],
    reason: 'fixture'
  };
}

module.exports = [
  {
    id: 'R01',
    transcript: '通知多以后大家慢慢就懒得看提醒，所以重要消息也容易一起漏掉。',
    gold: null,
    modelOutput: candidate({
      points: {
        K2: '通知多以后大家慢慢就懒得看提醒',
        K3: '重要消息也容易一起漏掉'
      },
      relations: {
        R2: {
          from_evidence: '大家慢慢就懒得看提醒',
          to_evidence: '重要消息也容易一起漏掉',
          relation_evidence: '大家慢慢就懒得看提醒，所以重要消息也容易一起漏掉'
        }
      }
    })
  },
  {
    id: 'R02',
    transcript: '通知很多，所以重要消息容易漏掉。',
    gold: 'MISSING_CAUSAL_STEP',
    modelOutput: candidate({
      points: { K1: '通知很多', K3: '重要消息容易漏掉' },
      missingRelations: { R2: { to_evidence: '重要消息容易漏掉' } },
      need: 'MISSING_CAUSAL_STEP',
      action: 'ADD_CAUSAL_LINK',
      primaryEvidence: '通知很多，所以重要消息容易漏掉'
    })
  },
  {
    id: 'R03',
    transcript: '因为重要通知太多，所以大家开始忽略普通消息。',
    gold: 'INCORRECT_RELATION',
    modelOutput: candidate({
      points: {
        K2: '大家开始忽略普通消息',
        K3: '重要通知太多'
      },
      need: 'INCORRECT_RELATION',
      action: 'RETHINK_RELATION',
      incorrectRelations: {
        R2: {
          from_evidence: '大家开始忽略普通消息',
          to_evidence: '重要通知太多',
          relation_evidence: '因为重要通知太多，所以大家开始忽略普通消息'
        }
      },
      incorrectEvidence: '因为重要通知太多，所以大家开始忽略普通消息',
      primaryEvidence: '因为重要通知太多，所以大家开始忽略普通消息'
    })
  },
  {
    id: 'R04',
    transcript: '重要消息会漏，然后通知很多，人就不看了，反正很多通知。',
    gold: 'INFORMATION_ORDER',
    modelOutput: candidate({
      points: {
        K2: '人就不看了',
        K3: '重要消息会漏'
      },
      need: 'INFORMATION_ORDER',
      action: 'REORDER_CAUSAL_CHAIN',
      primaryEvidence: '重要消息会漏，然后通知很多，人就不看了'
    })
  },
  {
    id: 'R05',
    transcript: '通知太多以后会那个……怎么说……就是看到也不想点。',
    gold: 'LEXICAL_RETRIEVAL',
    modelOutput: candidate({
      need: 'LEXICAL_RETRIEVAL',
      action: 'PARAPHRASE_AROUND_WORD',
      primaryEvidence: '那个……怎么说'
    })
  },
  {
    id: 'R06',
    transcript: '通知一直出现，人久了会习惯忽略，所以真正重要的消息也可能错过。',
    gold: null,
    modelOutput: candidate({
      points: {
        K2: '人久了会习惯忽略',
        K3: '真正重要的消息也可能错过'
      },
      relations: {
        R2: {
          from_evidence: '人久了会习惯忽略',
          to_evidence: '真正重要的消息也可能错过',
          relation_evidence: '人久了会习惯忽略，所以真正重要的消息也可能错过'
        }
      }
    })
  },
  {
    id: 'R07',
    transcript: '通知越多信息越充分，所以重要信息反而更不容易漏。',
    gold: 'INCORRECT_RELATION',
    modelOutput: candidate({
      points: {
        K2: '通知越多信息越充分',
        K3: '重要信息反而更不容易漏'
      },
      need: 'INCORRECT_RELATION',
      action: 'RETHINK_RELATION',
      incorrectRelations: {
        R2: {
          from_evidence: '通知越多信息越充分',
          to_evidence: '重要信息反而更不容易漏',
          relation_evidence: '通知越多信息越充分，所以重要信息反而更不容易漏'
        }
      },
      incorrectEvidence: '通知越多信息越充分，所以重要信息反而更不容易漏',
      primaryEvidence: '通知越多信息越充分，所以重要信息反而更不容易漏'
    })
  },
  {
    id: 'R08',
    transcript: '嗯……我没太看懂这段在说什么。',
    gold: 'UNCERTAIN',
    modelOutput: candidate({
      need: 'UNCERTAIN',
      action: 'OBSERVE_AGAIN',
      primaryEvidence: '我没太看懂这段在说什么'
    })
  }
].map((item) => Object.assign({ material: serverMaterial }, item));
