const CORE_EXPRESSION_TERMS = [
  '不方便', '不好吃', '不舒服', '不实用', '不清晰', '不满意',
  '方便', '好吃', '麻烦', '舒服', '好用', '难用', '实用', '省事', '费事',
  '简单', '复杂', '安静', '吵闹', '漂亮', '难看', '有趣', '无聊', '放松',
  '紧张', '清晰', '混乱', '便宜', '昂贵', '新鲜', '顺手', '别扭', '满意',
  '失望', '值得', '轻松'
];

const EVIDENCE_TYPE_HINTS = {
  CONTENT_EXPAND: ['abstract', 'judgment', 'feeling', 'opinion', 'unsupported', 'generic', 'reason'],
  CONTENT_START: ['start', 'latency', 'hesitation', 'no_content'],
  LEXICAL_RETRIEVAL: ['lexical', 'word_search', 'self_correction', 'repair'],
  INFORMATION_ORDER: ['order', 'track', 'jump', 'insertion', 'structure']
};

function scoreEvidence(item, primaryIssue, transcript) {
  const text = item && typeof item.text === 'string' ? item.text.trim() : '';
  const type = item && typeof item.type === 'string' ? item.type.toLowerCase() : '';
  if (!text) return -1;
  let score = 0;
  (EVIDENCE_TYPE_HINTS[primaryIssue] || []).forEach((hint) => {
    if (type.includes(hint)) score += 4;
  });
  if (transcript && transcript.includes(text)) score += 2;
  if (primaryIssue === 'CONTENT_EXPAND' && findCoreExpression(text, '')) score += 6;
  if (primaryIssue === 'LEXICAL_RETRIEVAL' && /怎么说|怎么形容|想不起|叫什么|哪个词/.test(text)) score += 6;
  if (primaryIssue === 'CONTENT_START' && /不知道|想一想|没想到|从哪/.test(text)) score += 5;
  return score;
}

function selectEvidenceForIssue(diagnosis, transcript) {
  const evidence = diagnosis && Array.isArray(diagnosis.evidence) ? diagnosis.evidence : [];
  const primaryIssue = diagnosis && diagnosis.primaryIssue ? diagnosis.primaryIssue : '';
  let selected = null;
  let selectedScore = -1;
  evidence.forEach((item) => {
    const score = scoreEvidence(item, primaryIssue, transcript || '');
    if (score > selectedScore) {
      selected = item;
      selectedScore = score;
    }
  });
  if (selected && typeof selected.text === 'string' && selected.text.trim()) {
    return {
      text: selected.text.trim(),
      type: typeof selected.type === 'string' ? selected.type : 'other'
    };
  }
  const direct = diagnosis && typeof diagnosis.evidenceText === 'string'
    ? diagnosis.evidenceText.trim()
    : '';
  return direct ? { text: direct, type: 'legacy' } : null;
}

function getEvidenceText(diagnosis, transcript) {
  const selected = selectEvidenceForIssue(diagnosis, transcript);
  return selected ? selected.text : '';
}

function createEvidenceContext(transcript, evidenceText) {
  const source = String(transcript || '').trim();
  const marker = String(evidenceText || '').trim();
  if (!source || !marker) return marker;
  const index = source.indexOf(marker);
  if (index === -1) return marker;
  const boundaryPattern = /[。！？!?]/;
  let start = Math.max(0, index - 24);
  let end = Math.min(source.length, index + marker.length + 24);
  for (let cursor = index - 1; cursor >= start; cursor -= 1) {
    if (boundaryPattern.test(source[cursor])) {
      start = cursor + 1;
      break;
    }
  }
  for (let cursor = index + marker.length; cursor < end; cursor += 1) {
    if (boundaryPattern.test(source[cursor])) {
      end = cursor + 1;
      break;
    }
  }
  return source.slice(start, end).trim().replace(/^[，,。！？!?\s]+|[，,\s]+$/g, '');
}

function findCoreExpression(evidenceText, transcript) {
  const sources = [evidenceText, transcript]
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());

  for (const source of sources) {
    let bestMatch = null;
    CORE_EXPRESSION_TERMS.forEach((term) => {
      const index = source.indexOf(term);
      if (index === -1) return;
      if (!bestMatch || index < bestMatch.index || (index === bestMatch.index && term.length > bestMatch.term.length)) {
        bestMatch = { term, index };
      }
    });
    if (bestMatch) return bestMatch.term;
  }
  return '';
}

function createMissingSlotQuestion(diagnosis, question) {
  const missingSlots = diagnosis && Array.isArray(diagnosis.missingRequiredSlots)
    ? diagnosis.missingRequiredSlots
    : [];
  const requiredSlots = question && Array.isArray(question.requiredSlots)
    ? question.requiredSlots
    : [];
  const slotState = diagnosis && diagnosis.slotState && typeof diagnosis.slotState === 'object'
    ? diagnosis.slotState
    : {};
  const isFilled = (slot) => slotState[slot]
    ? slotState[slot].filled === true
    : requiredSlots.includes(slot) && !missingSlots.includes(slot);
  if (question && question.taskType === 'EXPERIENCE_COMPARE') {
    const objectFilled = isFilled('object');
    const expectationFilled = isFilled('expectation_before');
    const experienceFilled = isFilled('experience_after');
    let explanation = '这里还缺少完成原题需要的信息。';
    if (objectFilled && !expectationFilled && !experienceFilled) {
      explanation = '你已经说出了对象，还缺原来的预期和实际体验。';
    } else if (objectFilled && !expectationFilled && experienceFilled) {
      explanation = '你已经说出了对象和实际体验，还缺原来的预期。';
    } else if (objectFilled && expectationFilled && !experienceFilled) {
      explanation = '你已经说出了对象和原来的预期，还缺实际体验。';
    }
    const targetSlot = requiredSlots.find((slot) => missingSlots.includes(slot));
    if (targetSlot === 'expectation_before') {
      return { slot: targetSlot, explanation, question: '你原来以为它会怎么样？' };
    }
    if (targetSlot === 'experience_after') {
      return {
        slot: targetSlot,
        explanation,
        question: '真正体验以后，哪一点和你原来想的不一样？'
      };
    }
  }
  const slotCopy = {
    object: ['还没有听到你说的是哪个具体对象。', '你想到的是哪个东西？'],
    expectation_before: ['你已经说出了对象和现在的感受，还少了原来的预期。', '你原来以为它会怎么样？'],
    experience_after: ['你已经说出了对象和原来的预期，还少了真正体验后的变化。', '真正体验以后，哪一点和你原来想的不一样？'],
    attitude: ['对象已经说清楚了，还少了你的态度。', '你对它的评价是什么？'],
    reason: ['你的态度已经很清楚，还少了原因。', '你为什么会这样想？'],
    topic: ['还没有听到你们具体在评价什么。', '你们说的是哪件事或哪个东西？'],
    my_view: ['还少了你自己的看法。', '你自己是怎么看的？'],
    other_view: ['还少了对方的看法。', '朋友或其他人是怎么看的？'],
    difference: ['两边的看法都有了，还少了分歧在哪里。', '你们最不一样的地方是什么？'],
    event: ['还没有听到这次经历具体是什么。', '当时发生了什么？'],
    key_detail: ['事情已经说出来了，还少了一个关键细节。', '当时哪个细节最有印象？'],
    result_or_feeling: ['经过已经有了，还少了最后的结果或感受。', '后来怎么样了？你是什么感觉？'],
    choice: ['还没有听到你的选择。', '你更愿意选哪一个？']
  };
  const missingSlot = requiredSlots.find((slot) => missingSlots.includes(slot));
  if (missingSlot && slotCopy[missingSlot]) {
    return {
      slot: missingSlot,
      explanation: slotCopy[missingSlot][0],
      question: slotCopy[missingSlot][1]
    };
  }
  if (requiredSlots.length) {
    return {
      slot: missingSlots[0] || 'detail',
      explanation: '这里还少了一块完成原题需要的信息。',
      question: '是什么让你产生这种感觉？'
    };
  }
  return {
    slot: 'legacy_detail',
    explanation: '这里还少一个具体场景、事实或例子。',
    question: '补一个具体场景、事实或例子。'
  };
}

function createContentExpandCopy(diagnosis, transcript, question) {
  const evidenceText = getEvidenceText(diagnosis, transcript);
  const coreExpression = findCoreExpression(evidenceText, evidenceText ? '' : transcript);
  const guidance = createMissingSlotQuestion(diagnosis, question);
  return {
    evidenceText,
    coreExpression,
    missingSlot: guidance.slot,
    explanation: guidance.explanation,
    followUpQuestion: guidance.question
  };
}

module.exports = {
  EVIDENCE_TYPE_HINTS,
  scoreEvidence,
  selectEvidenceForIssue,
  getEvidenceText,
  createEvidenceContext,
  findCoreExpression,
  createMissingSlotQuestion,
  createContentExpandCopy
};
