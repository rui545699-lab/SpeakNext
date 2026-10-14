const { createContentExpandCopy } = require('./diagnosis-copy');

const OBJECT_ANCHORS = [
  { terms: ['纪录片'], label: '这部纪录片' },
  { terms: ['电视剧', '剧集'], label: '这部剧' },
  { terms: ['电影'], label: '这部电影' },
  { terms: ['短视频', '视频'], label: '这个视频' },
  { terms: ['文章'], label: '这篇文章' },
  { terms: ['书'], label: '这本书' },
  { terms: ['餐厅', '饭店', '店'], label: '这家店' },
  { terms: ['一道菜', '菜'], label: '这道菜' },
  { terms: ['咖啡', '饮料', '饮品'], label: '这个饮品' },
  { terms: ['火锅'], label: '这顿火锅' },
  { terms: ['公园'], label: '这个公园' },
  { terms: ['城市'], label: '这座城市' },
  { terms: ['地方', '景点'], label: '这个地方' },
  { terms: ['应用', '软件', 'App', 'APP'], label: '这个应用' },
  { terms: ['电瓶车', '电动车'], label: '这辆电瓶车' },
  { terms: ['自行车'], label: '这辆自行车' },
  { terms: ['汽车'], label: '这辆车' },
  { terms: ['手机'], label: '这部手机' },
  { terms: ['耳机'], label: '这副耳机' },
  { terms: ['电脑'], label: '这台电脑' },
  { terms: ['课程', '课'], label: '这门课' },
  { terms: ['朋友'], label: '这个朋友' },
  { terms: ['同事'], label: '这个同事' },
  { terms: ['选择'], label: '这个选择' }
];

const FALLBACK_OPTIONS = {
  CONTENT: ['短视频', '电影 / 剧集', '书 / 文章', '其他内容'],
  FILM: ['电影', '电视剧 / 长剧', '短剧', '纪录片'],
  FOOD: ['一家店', '一道菜', '零食', '饮品'],
  PLACE: ['一个城市', '一个自然地点', '一个景点', '一个住宿地'],
  GENERAL_EXPERIENCE: ['吃过的', '用过的', '看过的', '去过的'],
  CHANGED_VIEW: ['遇到的人', '看过的内容', '经历的事', '用过的东西'],
  OVERHYPED: ['吃过的', '看过的', '用过的', '去过的'],
  CHOICE: ['买过的', '去过的', '学过的', '拒绝过的'],
  DISAGREEMENT: ['一部作品', '一个产品', '一种做法', '一件小事'],
  APP_PRODUCT: ['社交 / 内容 App', '购物 App', '地图 / 出行 App', '学习 / 工具 App'],
  HABIT: ['吃饭作息', '运动', '学习', '手机使用'],
  TRAVEL: ['一个城市', '一个自然地点', '一个景点', '一个住宿地'],
  SHOPPING: ['日用品', '衣服 / 鞋包', '数码产品', '食品 / 饮料'],
  LEARNING: ['一门课', '一个软件', '一项小技能', '一本书'],
  WORK: ['沟通', '整理资料', '安排时间', '完成任务'],
  TRANSPORT: ['走路', '骑车', '公交地铁', '打车开车']
};

function getNarrowFallbackOptions(question) {
  const source = question || {};
  const text = String(source.text || '');
  if (/\bApp\b|APP|应用/.test(text)) return FALLBACK_OPTIONS.APP_PRODUCT;
  if (/电影|短剧|电视剧|剧集|影视/.test(text)) return FALLBACK_OPTIONS.FILM;
  if (/看过|内容|文章|书/.test(text)) return FALLBACK_OPTIONS.CONTENT;
  if (/吃|菜|食物|味道|餐厅|饭店/.test(text)) return FALLBACK_OPTIONS.FOOD;
  if (/地方|旅行|出发|去过|景点/.test(text)) return FALLBACK_OPTIONS.PLACE;
  if (/买|购物|商品|网购|店里买/.test(text)) return FALLBACK_OPTIONS.SHOPPING;
  return FALLBACK_OPTIONS[source.category] || FALLBACK_OPTIONS.GENERAL_EXPERIENCE;
}

function extractTranscriptAnchor(transcript) {
  const source = String(transcript || '');
  let selected = null;
  OBJECT_ANCHORS.forEach((candidate) => {
    candidate.terms.forEach((term) => {
      const index = source.indexOf(term);
      if (index === -1) return;
      if (!selected || index < selected.index || (index === selected.index && term.length > selected.term.length)) {
        selected = { term, label: candidate.label, index };
      }
    });
  });
  return selected ? { term: selected.term, label: selected.label } : null;
}

function createOriginalTaskPrompt(taskType, originalQuestion, anchor) {
  if (taskType === 'EXPERIENCE_COMPARE') {
    return `好，那就从${anchor}开始。它实际体验起来，有哪一点比你原来想象中更好？`;
  }
  if (taskType === 'REASON_EXPLAIN') {
    return `好，那就从${anchor}开始。你对它的评价是什么？为什么？`;
  }
  if (taskType === 'OPINION_DIFFERENCE') {
    return `那就说${anchor}。你觉得它怎么样？朋友又怎么看？你们最不一样的是哪一点？`;
  }
  if (taskType === 'SIMPLE_EXPERIENCE') {
    return `好，那就从${anchor}开始。当时发生了什么，后来怎么样？`;
  }
  if (taskType === 'CHOICE_REASON') {
    return `好，那就从${anchor}开始。你会选哪一个？为什么？`;
  }
  return `好，那就从${anchor}开始。请围绕它继续回答原题。`;
}

const INITIAL_TARGET_SLOTS = Object.freeze({
  EXPERIENCE_COMPARE: 'experience_after',
  REASON_EXPLAIN: 'attitude',
  OPINION_DIFFERENCE: 'my_view',
  SIMPLE_EXPERIENCE: 'key_detail',
  CHOICE_REASON: 'choice'
});

function extractInitialSlotValue(slot, taskType, transcript) {
  const source = String(transcript || '').trim();
  if (!source) return '';
  if (slot === 'object' && taskType === 'EXPERIENCE_COMPARE') {
    const clauses = source.split(/[，,。！!？?；;]/).map((item) => item.trim()).filter(Boolean);
    for (const clause of clauses) {
      const candidate = cleanSpokenAnchor(clause)
        .replace(/^(?:我觉得|我想|我选|我会选)\s*/, '')
        .trim();
      if (candidate.length >= 2
        && !/^(?:不知道|不知道说什么|不知道从哪(?:个)?说|想不到|一下想不到|想不出来|没想到|不清楚|没有|没什么|我想一下)$/.test(candidate)) {
        return candidate.slice(0, 120);
      }
    }
  }
  return source.slice(0, 500);
}

function createInitialSlotState(question, diagnosis, transcript) {
  const requiredSlots = question && Array.isArray(question.requiredSlots)
    ? question.requiredSlots
    : [];
  const taskType = question && question.taskType ? question.taskType : '';
  const hasMissingState = diagnosis && Array.isArray(diagnosis.missingRequiredSlots);
  const missingSlots = hasMissingState ? diagnosis.missingRequiredSlots : [];
  return requiredSlots.reduce((state, slot) => {
    const filled = hasMissingState && !missingSlots.includes(slot);
    state[slot] = {
      filled,
      value: filled ? extractInitialSlotValue(slot, taskType, transcript) : '',
      evidence: filled ? extractInitialSlotValue(slot, taskType, transcript) : ''
    };
    return state;
  }, {});
}

function fillSlotState(slotState, slot, value) {
  const next = Object.keys(slotState || {}).reduce((state, key) => {
    state[key] = Object.assign({}, slotState[key]);
    return state;
  }, {});
  if (slot && next[slot]) {
    const groundedValue = String(value || '').trim().slice(0, 500);
    next[slot] = { filled: true, value: groundedValue, evidence: groundedValue };
  }
  return next;
}

function cleanSpokenAnchor(value) {
  return String(value || '')
    .trim()
    .replace(/^(?:(?:嗯|呃|额|那个|我想想|我想一下)[，,、\s]*)+/, '')
    .replace(/^(?:可能|应该|大概)?(?:是|就是|比如说|比如|我想到的是|我选的是)\s*/, '')
    .replace(/[吧呢啊呀吗]+$/g, '')
    .replace(/^[“”'"\s]+|[“”'"\s]+$/g, '')
    .trim()
    .slice(0, 30);
}

function extractSpokenAnchor(transcript) {
  const source = String(transcript || '').trim();
  if (!source) return '';
  const directPatterns = [
    /(?:可能|应该|大概)(?:是|选|说)\s*([^，。！？!?]{2,30}?)(?:吧|呢|啊|呀)?(?:[。！？!?]|$)/g,
    /(?:我想到的|我选的|我说的)(?:是)?\s*([^，。！？!?]{2,30}?)(?:吧|呢|啊|呀)?(?:[。！？!?]|$)/g,
    /(?:就是|比如说|比如)\s*([^，。！？!?]{2,30}?)(?:吧|呢|啊|呀)?(?:[。！？!?]|$)/g
  ];
  for (const pattern of directPatterns) {
    const matches = Array.from(source.matchAll(pattern));
    if (matches.length) {
      const anchor = cleanSpokenAnchor(matches[matches.length - 1][1]);
      if (anchor.length >= 2) return anchor;
    }
  }
  const clauses = source.split(/[，,。！!？?；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/吗$/.test(item));
  for (let index = clauses.length - 1; index >= 0; index -= 1) {
    const anchor = cleanSpokenAnchor(clauses[index]);
    if (anchor.length >= 2 && !/^(?:不知道|想不到|没想到|不清楚|没有|没什么)$/.test(anchor)) {
      return anchor;
    }
  }
  return '';
}

function detectLexicalStrategy(contextText, evidenceType) {
  const text = String(contextText || '');
  const type = String(evidenceType || '').toLowerCase();
  const umbrella = /这些|那些|几项|方面|因素|包括|薪资|福利|工作强度|待遇|条件|内容|东西|类别|统称/.test(text)
    || /category|umbrella|list/.test(type);
  const adjective = /(?:很|特别|比较|有点|非常|挺|太)[^。！？]{0,8}(?:怎么说|怎么形容|那个词)/.test(text)
    || /adjective|descriptive|feeling/.test(type);
  if (umbrella && !adjective) return 'UMBRELLA';
  if (adjective) return 'ADJECTIVE';
  return 'GENERAL';
}

function createLexicalPrompt(strategy) {
  if (strategy === 'UMBRELLA') {
    return '不用先找概括词，直接把你想到的具体几项说出来。';
  }
  if (strategy === 'ADJECTIVE') {
    return '不用找准确的词，先说它更接近什么感觉。';
  }
  return '不用先找到那个词，直接说你指的是哪些方面或具体是什么。';
}

function createInterventionPlan(runtime) {
  const source = runtime || {};
  const diagnosis = source.diagnosis || {};
  const interventionType = diagnosis.interventionType || '';
  const originalQuestion = source.question && source.question.text ? source.question.text : '';
  const taskType = source.question && source.question.taskType ? source.question.taskType : '';
  if (interventionType === 'ONE_DETAIL') {
    const copy = createContentExpandCopy(diagnosis, source.transcript, source.question);
    return {
      interventionType,
      originalQuestion,
      taskType,
      phase: 'COMPLETE_INTERVENTION',
      prompt: copy.followUpQuestion,
      targetSlot: copy.missingSlot === 'legacy_detail' ? '' : copy.missingSlot,
      anchor: copy.coreExpression,
      fallbackRequired: false,
      options: []
    };
  }
  if (interventionType === 'NARROW_SCOPE') {
    const anchor = extractTranscriptAnchor(source.transcript);
    if (anchor) {
      return {
        interventionType,
        originalQuestion,
        taskType,
        phase: 'ANSWER_ORIGINAL',
        prompt: createOriginalTaskPrompt(taskType, originalQuestion, anchor.label),
        targetSlot: INITIAL_TARGET_SLOTS[taskType] || '',
        anchor: anchor.label,
        fallbackRequired: false,
        options: []
      };
    }
    return {
      interventionType,
      originalQuestion,
      taskType,
      phase: 'SELECT_OBJECT',
      prompt: '先选一个最容易开始的对象。',
      targetSlot: 'object',
      anchor: '',
      fallbackRequired: true,
      options: getNarrowFallbackOptions(source.question)
    };
  }
  if (interventionType === 'SEMANTIC_CONTRAST') {
    const contextText = diagnosis.evidenceContext || diagnosis.evidenceText || '';
    const selectedEvidence = Array.isArray(diagnosis.evidence)
      ? diagnosis.evidence.find((item) => item && item.text === diagnosis.evidenceText)
      : null;
    const lexicalStrategy = detectLexicalStrategy(contextText, selectedEvidence && selectedEvidence.type);
    return {
      interventionType,
      originalQuestion,
      taskType,
      phase: 'COMPLETE_INTERVENTION',
      prompt: createLexicalPrompt(lexicalStrategy),
      targetSlot: '',
      contextText,
      lexicalStrategy,
      anchor: '',
      fallbackRequired: false,
      options: []
    };
  }
  if (interventionType === 'CHOOSE_FIRST_MESSAGE') {
    return {
      interventionType,
      originalQuestion,
      taskType,
      phase: 'COMPLETE_INTERVENTION',
      prompt: '如果只先说一条，你最想先让对方知道什么？',
      targetSlot: '',
      anchor: '',
      fallbackRequired: false,
      options: []
    };
  }
  return {
    interventionType,
    originalQuestion,
    taskType,
    phase: 'COMPLETE_INTERVENTION',
    prompt: '',
    targetSlot: '',
    anchor: '',
    fallbackRequired: false,
    options: []
  };
}

function applyFallbackAnchor(plan, anchor) {
  const label = String(anchor || '').trim();
  return Object.assign({}, plan, {
    prompt: `在“${label}”里，先说出一个具体对象。`,
    anchor: label,
    phase: 'FIND_OBJECT',
    targetSlot: 'object',
    fallbackRequired: false,
    options: []
  });
}

function createNarrowOriginalTaskPlan(plan, objectText) {
  const anchor = extractSpokenAnchor(objectText);
  return Object.assign({}, plan, {
    anchor,
    phase: 'ANSWER_ORIGINAL',
    prompt: createOriginalTaskPrompt(plan.taskType, plan.originalQuestion, `“${anchor}”`),
    targetSlot: INITIAL_TARGET_SLOTS[plan.taskType] || '',
    fallbackRequired: false,
    options: []
  });
}

module.exports = {
  OBJECT_ANCHORS,
  FALLBACK_OPTIONS,
  getNarrowFallbackOptions,
  extractTranscriptAnchor,
  extractSpokenAnchor,
  createOriginalTaskPrompt,
  INITIAL_TARGET_SLOTS,
  extractInitialSlotValue,
  createInitialSlotState,
  fillSlotState,
  detectLexicalStrategy,
  createLexicalPrompt,
  createInterventionPlan,
  applyFallbackAnchor,
  createNarrowOriginalTaskPlan
};
