const source = require('./fixtures/retelling-001-notification-legacy');
const material = Object.freeze({
  id: source.id,
  title: source.title,
  core_message: source.coreMessage,
  key_points: source.keyPoints,
  relations: source.relations
});

const ACTION_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: 'ADD_CAUSAL_LINK',
  INCORRECT_RELATION: 'RETHINK_RELATION',
  INFORMATION_ORDER: 'REORDER_CAUSAL_CHAIN',
  LEXICAL_RETRIEVAL: 'PARAPHRASE_AROUND_WORD',
  UNCERTAIN: 'OBSERVE_AGAIN'
});

function liveCase(id, transcript, primaryTrainingNeed, labels = []) {
  return Object.freeze({
    id,
    material,
    transcript,
    gold: Object.freeze({
      coreMeaningClear: primaryTrainingNeed == null,
      primaryTrainingNeed,
      recommendedAction: primaryTrainingNeed == null ? 'PASS' : ACTION_BY_NEED[primaryTrainingNeed]
    }),
    labels: Object.freeze(labels.slice())
  });
}

module.exports = Object.freeze([
  liveCase('L01', '通知一直弹出来以后，人慢慢就习惯不认真看提醒，所以真正重要的消息也可能一起被忽略。', null),
  liveCase('L02', '很多通知其实都不重要，看多了人会形成直接划掉提醒的习惯，最后重要信息出现时也可能没注意到。', null),
  liveCase('L03', '提醒太频繁会让人逐渐麻木，看到通知就顺手忽略，结果真正需要处理的信息也容易被一起错过。', null),
  liveCase('L04', '通知很多，所以重要消息容易漏掉。', 'MISSING_CAUSAL_STEP'),
  liveCase('L05', '手机每天会收到很多提醒，重要的信息有时候也看不到。', 'MISSING_CAUSAL_STEP'),
  liveCase('L06', '通知会打断工作，而且重要消息也有可能漏掉。', 'MISSING_CAUSAL_STEP'),
  liveCase('L07', '因为重要消息经常被漏掉，所以人后来才开始忽略普通通知。', 'INCORRECT_RELATION'),
  liveCase('L08', '通知越多，人越会认真查看提醒，所以真正重要的信息反而更容易被发现。', 'INCORRECT_RELATION'),
  liveCase('L09', '重要消息会被漏，然后人不看通知，然后通知很多，就是普通提醒太多，最后大家就会忽略。', 'INFORMATION_ORDER'),
  liveCase('L10', '最后重要信息没看到，然后普通通知很多，人后来会不看，反正这些提醒一直出现。', 'INFORMATION_ORDER'),
  liveCase('L11', '通知太多以后人会有一种……那个词怎么说……就是看到提醒也不太想点开的状态。', 'LEXICAL_RETRIEVAL'),
  liveCase('L12', '提醒一直弹，人慢慢会……怎么形容，就是有点不想再认真看的感觉。', 'LEXICAL_RETRIEVAL'),
  liveCase('L13', '这个事情怎么说都可以，反正通知多了以后人会习惯忽略提醒，最后重要消息也容易漏掉。', null, ['LEXICAL_FALSE_POSITIVE_CONTROL']),
  liveCase('L14', '嗯……我其实没太看懂这段是什么意思。', 'UNCERTAIN'),
  liveCase('L15', '通知那个很多……然后就是消息……那个重要……', 'UNCERTAIN'),
  liveCase('L16', '通知太多会不断打断正在做的事情，让人重新集中注意力，所以最好关掉一些没必要的通知。', 'MISSING_CAUSAL_STEP', ['SUPPORTING_ONLY_BOUNDARY'])
]);
