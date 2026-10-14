const {
  callDeepSeek,
  parseEvaluatorResponse,
  getSafeHealthcheckDetails
} = require('./deepseek-evaluator');
const {
  assessTaskCompletion,
  normalizeSlotState,
  restoreFilledSlotValues,
  accumulateSlotState
} = require('./task-completion');

const INTERVENTIONS = [
  'ONE_DETAIL',
  'NARROW_SCOPE',
  'SEMANTIC_CONTRAST',
  'CHOOSE_FIRST_MESSAGE'
];
const MAX_CHECK_RETRIES = 1;
const CHECK_MAX_TOKENS = 420;

const INTERVENTION_CHECK_PROMPT = `你是 SpeakNext 的微训练验证器。你不做诊断、不选择 primary_issue，只判断一次干预是否完成。

只输出合法 JSON，不要输出 Markdown 或解释性文字：
{"result":"PASS","reason":"简短内部原因","original_task_complete":true,"slot_evidence":{"target_slot":"experience_after","filled":true,"value":"用户原话","evidence":"用户原话"}}

result 只允许 PASS 或 RETRY。

判断标准：
- ONE_DETAIL：第二次回答相比第一次新增了具体场景、事实、原因或例子。
- NARROW_SCOPE + phase=FIND_OBJECT：第二次回答已经给出一个明确、可继续展开的对象即可 PASS，但 original_task_complete 必须为 false。
- NARROW_SCOPE + phase=ANSWER_ORIGINAL：第二次回答只要围绕 anchor 对 original_question 新增了一个有效信息就可以 PASS；只重复对象名不能算完成。original_task_complete 由服务端根据 required_slots 另行计算，不要把“完成了缩小范围动作”和“原题已经完整”混为一件事。
- SEMANTIC_CONTRAST：第二次回答已经通过“像什么、不像什么、有什么感觉”等替代描述继续表达；不要求找回标准词。
- CHOOSE_FIRST_MESSAGE：第二次回答已经确定了一条优先表达的信息；不要求总分总结构。

其他 intervention 只判断最小动作是否完成。original_task_complete 会由服务端按 question_required_slots 覆盖。RETRY 时 original_task_complete 必须为 false。
当 target_slot 和 current_prompt 存在时，after_transcript 是用户对 current_prompt 的直接回答。请结合问题语境判断它是否回答了 target_slot，不要求用户重复“原来、后来、实际、体验后”等提示词。例如问题问“你原来以为它会怎么样？”，回答“广告会很多”可回答 expectation_before；问题问实际体验，回答“评论区里有很多真实经验”可回答 experience_after。
但不能仅因为存在 target_slot 就 PASS；“不知道”“不清楚”“没想法”等未回答内容必须 RETRY。
当 target_slot 非空时：
- PASS 必须返回 slot_evidence；target_slot 必须与输入一致，filled 必须为 true。
- evidence 必须逐字引用 after_transcript 中直接支持该 slot 的连续原文，不得改写、纠正 ASR、补词或推测用户想表达的事实。
- value 只能概括 evidence 已经明确表达的含义；服务端最终只保存 grounded evidence 原文。
- 语义破碎、句子未完成、指代不清或无法可靠判断时必须 RETRY，slot_evidence.filled=false。
- reason 不得包含 transcript、既有 slot_state 和 evidence 中都不存在的新事实。
如果第二次回答为空、主要是填充词、与任务无关、信息不足或无法可靠判断，返回 RETRY。`;

function isClearlyInvalidTargetAnswer(value) {
  const text = String(value || '').trim();
  const meaningful = text
    .replace(/(?:嗯|呃|额|啊|那个|就是|我想一想|让我想想)/g, '')
    .replace(/[\s，。！？、,.!?…]/g, '');
  return meaningful.length < 2
    || /^(?:我)?(?:不知道|不清楚|没想法|没有想法|想不起来|没什么可说的?|没有答案)$/.test(meaningful);
}

function hasBrokenSemanticFragment(value) {
  const clauses = String(value || '').split(/[。！？!?；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!clauses.length) return true;
  return clauses.some((clause, index) => index < clauses.length - 1
    && /(?:有|还有|存在)(?:很多|一些|不少)$/.test(clause.replace(/[，,\s]/g, '')));
}

function getGroundedSlotEvidence(value, input) {
  if (!input || !input.target_slot) return '';
  const slotEvidence = value && value.slot_evidence && typeof value.slot_evidence === 'object'
    ? value.slot_evidence
    : {};
  const evidence = typeof slotEvidence.evidence === 'string'
    ? slotEvidence.evidence.trim()
    : '';
  if (slotEvidence.target_slot !== input.target_slot || slotEvidence.filled !== true || !evidence) {
    return '';
  }
  return String(input.after_transcript || '').includes(evidence) ? evidence : '';
}

function validateCheckInput(value) {
  const source = value || {};
  const interventionType = String(source.intervention_type || '').trim();
  const beforeTranscript = String(source.before_transcript || '').trim().slice(0, 2000);
  const afterTranscript = String(source.after_transcript || '').trim().slice(0, 2000);
  const anchor = String(source.anchor || '').trim().slice(0, 120);
  const phase = String(source.phase || 'COMPLETE_INTERVENTION').trim();
  const originalQuestion = String(source.original_question || '').trim().slice(0, 500);
  const questionTaskType = String(source.question_task_type || '').trim().slice(0, 64);
  const questionRequiredSlots = (Array.isArray(source.question_required_slots)
    ? source.question_required_slots
    : []).filter((item) => typeof item === 'string' && item.trim()).slice(0, 10);
  const targetSlot = String(source.target_slot || '').trim().slice(0, 64);
  const currentPrompt = String(source.current_prompt || '').trim().slice(0, 500);
  const slotState = restoreFilledSlotValues(
    normalizeSlotState(questionRequiredSlots, source.slot_state),
    questionRequiredSlots,
    questionTaskType,
    beforeTranscript
  );
  if (!INTERVENTIONS.includes(interventionType)) throw new Error('INVALID_INTERVENTION_TYPE');
  if (!['COMPLETE_INTERVENTION', 'FIND_OBJECT', 'ANSWER_ORIGINAL'].includes(phase)) {
    throw new Error('INVALID_INTERVENTION_PHASE');
  }
  if (!beforeTranscript) throw new Error('INVALID_BEFORE_TRANSCRIPT');
  if (!afterTranscript) throw new Error('INVALID_AFTER_TRANSCRIPT');
  return {
    intervention_type: interventionType,
    before_transcript: beforeTranscript,
    after_transcript: afterTranscript,
    anchor,
    phase,
    original_question: originalQuestion,
    question_task_type: questionTaskType,
    question_required_slots: questionRequiredSlots,
    slot_state: slotState,
    target_slot: targetSlot,
    current_prompt: currentPrompt
  };
}

function createCheckPayload(model, input) {
  return {
    model,
    messages: [
      { role: 'system', content: INTERVENTION_CHECK_PROMPT },
      { role: 'user', content: `请验证这次微训练：\n${JSON.stringify(input)}` }
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0,
    max_tokens: CHECK_MAX_TOKENS
  };
}

function validateCheckOutput(value, input) {
  let result = value && value.result === 'PASS' ? 'PASS' : 'RETRY';
  let groundedEvidence = '';
  if (result === 'PASS' && input && input.target_slot
    && isClearlyInvalidTargetAnswer(input.after_transcript)) {
    result = 'RETRY';
  }
  if (result === 'PASS' && input && input.target_slot) {
    groundedEvidence = getGroundedSlotEvidence(value, input);
    if (!groundedEvidence || hasBrokenSemanticFragment(input.after_transcript)) result = 'RETRY';
  }
  const isNarrow = input && input.intervention_type === 'NARROW_SCOPE';
  const taskCompletion = assessTaskCompletion({
    question_task_type: input && input.question_task_type,
    question_required_slots: input && input.question_required_slots,
    original_question: input && input.original_question,
    transcript: input ? `${input.before_transcript} ${input.after_transcript}` : ''
  });
  const accumulated = accumulateSlotState({
    requiredSlots: input && input.question_required_slots,
    currentState: input && input.slot_state,
    detectedSlots: result === 'PASS' ? taskCompletion.slots : {},
    taskType: input && input.question_task_type,
    transcript: input ? `${input.before_transcript} ${input.after_transcript}` : '',
    targetSlot: input && input.target_slot,
    targetValue: groundedEvidence,
    targetEvidence: groundedEvidence,
    targetConfirmed: result === 'PASS'
  });
  let originalTaskComplete = result === 'PASS';
  if (taskCompletion.supported) {
    originalTaskComplete = result === 'PASS' && accumulated.missingSlots.length === 0;
  }
  if (isNarrow && input.phase === 'FIND_OBJECT') originalTaskComplete = false;
  if (isNarrow && input.phase === 'ANSWER_ORIGINAL' && !taskCompletion.supported) {
    originalTaskComplete = result === 'PASS' && value.original_task_complete === true;
  }
  return {
    result,
    intervention_pass: result === 'PASS',
    original_task_complete: originalTaskComplete,
    missing_required_slots: taskCompletion.supported ? accumulated.missingSlots : [],
    slot_state: accumulated.slotState,
    slot_evidence: groundedEvidence ? {
      target_slot: input.target_slot,
      filled: true,
      value: groundedEvidence,
      evidence: groundedEvidence
    } : {
      target_slot: input && input.target_slot ? input.target_slot : '',
      filled: false,
      value: '',
      evidence: ''
    },
    reason: result === 'PASS'
      ? (input && input.target_slot ? '当前槽位有本轮原文证据。' : '本轮最小动作已完成。')
      : (input && input.target_slot ? '本轮原文不足以可靠支持当前槽位。' : '本轮最小动作尚未完成。')
  };
}

async function evaluateInterventionCheck(rawInput, request = callDeepSeek) {
  const input = validateCheckInput(rawInput);
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  const payload = createCheckPayload(model, input);
  let lastError;
  for (let retryCount = 0; retryCount <= MAX_CHECK_RETRIES; retryCount += 1) {
    try {
      const response = await request(payload);
      const parsed = parseEvaluatorResponse(response);
      const output = validateCheckOutput(parsed.parsed, input);
      console.log('[INTERVENTION CHECK] result', {
        model: response.model || model,
        result: output.result,
        interventionPass: output.intervention_pass,
        originalTaskComplete: output.original_task_complete,
        missingRequiredSlots: output.missing_required_slots,
        slotState: output.slot_state,
        slotEvidence: output.slot_evidence,
        requestId: parsed.metadata.requestId,
        retryCount
      });
      return {
        result: output.result,
        interventionPass: output.intervention_pass,
        originalTaskComplete: output.original_task_complete,
        missingRequiredSlots: output.missing_required_slots,
        slotState: output.slot_state,
        slotEvidence: output.slot_evidence,
        reason: output.reason,
        modelVersion: response.model || model,
        requestId: parsed.metadata.requestId
      };
    } catch (error) {
      lastError = error;
      const details = getSafeHealthcheckDetails(error);
      console.error('[INTERVENTION CHECK] failed', {
        errorType: details.errorType,
        providerCode: details.providerCode,
        retryCount
      });
    }
  }
  throw lastError || new Error('INTERVENTION_CHECK_FAILED');
}

module.exports = {
  INTERVENTIONS,
  INTERVENTION_CHECK_PROMPT,
  CHECK_MAX_TOKENS,
  MAX_CHECK_RETRIES,
  validateCheckInput,
  validateCheckOutput,
  isClearlyInvalidTargetAnswer,
  hasBrokenSemanticFragment,
  getGroundedSlotEvidence,
  createCheckPayload,
  evaluateInterventionCheck
};
