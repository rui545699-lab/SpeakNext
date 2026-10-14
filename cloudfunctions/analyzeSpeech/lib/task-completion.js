const EXPERIENCE_OBJECTS = [
  '电瓶车', '电动车', '自行车', '汽车', '手机', '耳机', '电脑', '相机',
  '应用', '软件', 'App', '产品', '电影', '电视剧', '短剧', '纪录片', '书', '文章',
  '餐厅', '饭店', '火锅', '咖啡', '课程', '酒店', '云南', '旅行', '早餐'
];

function meaningfulText(transcript) {
  return String(transcript || '')
    .replace(/(?:嗯|呃|额|啊|那个|就是|然后|我想一想|不知道说什么)/g, '')
    .replace(/[\s，。！？、,.!?…]/g, '');
}

function hasConcreteObject(transcript) {
  const text = String(transcript || '');
  if (EXPERIENCE_OBJECTS.some((item) => text.includes(item))) return true;
  const classifierMatch = text.match(/[一这那](?:个|辆|部|本|台|款|家|道|种|份|次|件)([\u3400-\u9fffA-Za-z0-9]{1,12})/);
  if (classifierMatch && !/东西|事情|感觉|方面/.test(classifierMatch[1])) return true;
  const firstClause = (text.split(/[。！？!?，,]/)[0] || '')
    .replace(/^(?:我觉得|我想|可能是|应该是|大概是|就是|是)+/, '')
    .replace(/[吧呢啊呀]$/g, '')
    .trim();
  return /^[\u3400-\u9fffA-Za-z0-9]{2,12}$/.test(firstClause)
    && !/^(?:不知道|想一想|没想到|不清楚|那个什么|挺好的)$/.test(firstClause)
    && !/原来|原本|之前|以为|想象/.test(firstClause);
}

function hasAttitude(text) {
  return /喜欢|不喜欢|愿意|不愿意|推荐|不推荐|满意|不满意|值得|不值得|好用|难用|不错|一般|失望|方便|麻烦|实用|没那么好|被夸过头|有用|没用/.test(text);
}

function hasReason(text) {
  const source = String(text || '');
  const causalMatch = source.match(/(?:因为|原因是|主要是|在于)([^。！？!?]{1,80})/);
  if (causalMatch) {
    const detail = causalMatch[1].replace(/[，,、\s]/g, '').trim();
    if (detail && !/^(?:(?:很|挺|比较|还|特别|非常|蛮)?(?:好|好的|不错|可以|一般|喜欢|舒服))$/.test(detail)) {
      return true;
    }
  }
  return /所以|让我|能让我|可以|省时|节约|不用/.test(source)
    || /(?:味道|价格|服务|操作|功能|距离|环境|节奏|剧情|工作强度|薪资|福利)(?:更|很|比较|挺|太|不|没|有|方便|清楚|简单|复杂|快|慢|高|低|好|差)/.test(source);
}

function extractQuestionChoices(questionText) {
  const match = String(questionText || '').match(/([^，。？]{1,12})还是([^，。？]{1,12})/);
  return match ? [match[1].replace(/^.*?(?:你|更愿意)/, '').trim(), match[2].trim()] : [];
}

function assessExperienceCompare(transcript) {
  const text = String(transcript || '');
  return {
    object: hasConcreteObject(text),
    expectation_before: /原来|原本|之前|一开始|本来|以为|想象|出发前|还没用时|没吃之前/.test(text),
    experience_after: /实际|后来|结果|之后|以后|发现|体验起来|用起来|骑起来|吃起来|看完|用了|骑了|吃了|去了/.test(text)
      || /感觉.{0,6}(?:好|方便|不错|舒服|喜欢|一般)/.test(text)
      || /能去|节约时间|省时间|不用走路|不用晒|很方便|挺方便/.test(text)
  };
}

function assessReasonExplain(transcript) {
  const text = String(transcript || '');
  return {
    object: hasConcreteObject(text) || meaningfulText(text).length >= 5,
    attitude: hasAttitude(text),
    reason: hasReason(text)
  };
}

function assessOpinionDifference(transcript) {
  const text = String(transcript || '');
  const otherView = /朋友|别人|大家|他们|同事|身边的人|有人/.test(text)
    && /觉得|认为|喜欢|不喜欢|说|评价|推荐/.test(text);
  const myView = /我(?:觉得|认为|反而|倒是|更喜欢|不喜欢|喜欢|会选)|对我来说/.test(text);
  return {
    topic: hasConcreteObject(text) || meaningfulText(text).length >= 6,
    my_view: myView,
    other_view: otherView,
    difference: myView && otherView && /但是|但我|可我|而我|不一样|相反|反而|却/.test(text)
  };
}

function assessSimpleExperience(transcript) {
  const text = String(transcript || '');
  const meaningfulLength = meaningfulText(text).length;
  return {
    event: /最近|上次|昨天|今天|那次|有一次|刚刚|前几天|周末|我去|我买|我学|我做|我遇到|我完成/.test(text)
      || hasConcreteObject(text),
    key_detail: meaningfulLength >= 14
      && /时候|中间|当时|先|后来|突然|结果|发现|遇到|花了|等了|用了|因为|最/.test(text),
    result_or_feeling: /后来|结果|最后|觉得|感觉|满意|失望|开心|麻烦|费劲|顺利|还不错|学会|完成/.test(text)
  };
}

function assessChoiceReason(transcript, questionText) {
  const text = String(transcript || '');
  const choices = extractQuestionChoices(questionText);
  const statesChoice = /我(?:更愿意|会选|选择|更喜欢|喜欢|宁愿|倾向)|对我来说/.test(text)
    || choices.some((choice) => choice && text.includes(choice));
  return {
    choice: statesChoice,
    reason: hasReason(text)
  };
}

const ASSESSORS = Object.freeze({
  EXPERIENCE_COMPARE: (source) => assessExperienceCompare(source.transcript),
  REASON_EXPLAIN: (source) => assessReasonExplain(source.transcript),
  OPINION_DIFFERENCE: (source) => assessOpinionDifference(source.transcript),
  SIMPLE_EXPERIENCE: (source) => assessSimpleExperience(source.transcript),
  CHOICE_REASON: (source) => assessChoiceReason(source.transcript, source.question_text || source.original_question)
});

function assessTaskCompletion(input) {
  const source = input || {};
  const requiredSlots = Array.isArray(source.question_required_slots)
    ? source.question_required_slots
    : [];
  const assessor = ASSESSORS[source.question_task_type];
  if (!assessor || !requiredSlots.length) {
    return { supported: false, complete: false, slots: {}, missingSlots: [] };
  }
  const slots = assessor(source);
  const missingSlots = requiredSlots.filter((slot) => slots[slot] !== true);
  return {
    supported: true,
    complete: missingSlots.length === 0,
    slots,
    missingSlots
  };
}

function normalizeSlotState(requiredSlots, rawState) {
  const source = rawState && typeof rawState === 'object' ? rawState : {};
  return (Array.isArray(requiredSlots) ? requiredSlots : []).reduce((state, slot) => {
    const current = source[slot] && typeof source[slot] === 'object' ? source[slot] : {};
    const value = typeof current.value === 'string' ? current.value.trim().slice(0, 500) : '';
    const evidence = typeof current.evidence === 'string'
      ? current.evidence.trim().slice(0, 500)
      : value;
    state[slot] = {
      filled: current.filled === true,
      value,
      evidence
    };
    return state;
  }, {});
}

function extractSlotValue(slot, taskType, transcript) {
  const source = String(transcript || '').trim();
  if (!source) return '';
  if (slot === 'object' && taskType === 'EXPERIENCE_COMPARE') {
    const clauses = source.split(/[，,。！!？?；;]/).map((item) => item.trim()).filter(Boolean);
    for (const clause of clauses) {
      const candidate = clause
        .replace(/^(?:(?:嗯|呃|额|啊|那个|我想想|我想一下)[，,、\s]*)+/, '')
        .replace(/^(?:我觉得|我想|我选|我会选)\s*/, '')
        .replace(/^(?:可能|应该|大概)?(?:是|就是|比如说|比如|我想到的是|我选的是)\s*/, '')
        .replace(/[吧呢啊呀吗]+$/g, '')
        .trim();
      if (candidate.length >= 2
        && !/^(?:不知道|不知道说什么|不知道从哪(?:个)?说|想不到|一下想不到|想不出来|没想到|不清楚|没有|没什么|我想一下)$/.test(candidate)) {
        return candidate.slice(0, 120);
      }
    }
  }
  return source.slice(0, 500);
}

function restoreFilledSlotValues(slotState, requiredSlots, taskType, transcript) {
  const state = normalizeSlotState(requiredSlots, slotState);
  Object.keys(state).forEach((slot) => {
    if (state[slot].filled && (!state[slot].value || !state[slot].evidence)) {
      const value = extractSlotValue(slot, taskType, transcript);
      state[slot] = value
        ? { filled: true, value, evidence: value }
        : { filled: false, value: '', evidence: '' };
    }
  });
  return state;
}

function accumulateSlotState(options) {
  const source = options || {};
  const requiredSlots = Array.isArray(source.requiredSlots) ? source.requiredSlots : [];
  const state = normalizeSlotState(requiredSlots, source.currentState);
  const detectedSlots = source.detectedSlots && typeof source.detectedSlots === 'object'
    ? source.detectedSlots
    : {};

  requiredSlots.forEach((slot) => {
    if (detectedSlots[slot] === true) {
      const value = state[slot].value || extractSlotValue(
        slot,
        source.taskType,
        source.transcript
      );
      state[slot] = value
        ? { filled: true, value, evidence: state[slot].evidence || value }
        : { filled: false, value: '', evidence: '' };
    }
  });

  const targetSlot = String(source.targetSlot || '');
  if (source.targetConfirmed === true && requiredSlots.includes(targetSlot)) {
    state[targetSlot] = {
      filled: true,
      value: String(source.targetValue || '').trim().slice(0, 500),
      evidence: String(source.targetEvidence || source.targetValue || '').trim().slice(0, 500)
    };
  }

  return {
    slotState: state,
    missingSlots: requiredSlots.filter((slot) => state[slot].filled !== true)
  };
}

module.exports = {
  EXPERIENCE_OBJECTS,
  ASSESSORS,
  meaningfulText,
  hasConcreteObject,
  assessExperienceCompare,
  assessReasonExplain,
  assessOpinionDifference,
  assessSimpleExperience,
  assessChoiceReason,
  assessTaskCompletion,
  normalizeSlotState,
  extractSlotValue,
  restoreFilledSlotValues,
  accumulateSlotState
};
