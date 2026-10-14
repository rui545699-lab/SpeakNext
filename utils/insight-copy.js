const { createContentExpandCopy, getEvidenceText } = require('./diagnosis-copy');
const { getUncertainCopy } = require('./uncertain-copy');

const CTA_BY_INTERVENTION = Object.freeze({
  ONE_DETAIL: '补一句',
  NARROW_SCOPE: '找个开头',
  SEMANTIC_CONTRAST: '换种方式说',
  CHOOSE_FIRST_MESSAGE: '先说一条',
  OBSERVE_AGAIN: '换一道题'
});

function withInterventionCta(copy, interventionType) {
  return Object.assign({}, copy, {
    cta: CTA_BY_INTERVENTION[interventionType] || '继续'
  });
}

function createInsightCopy(diagnosis, transcript, signals, question) {
  const source = diagnosis || {};
  if (source.questionApplicable === false) {
    return {
      lead: '这题可能不太适合你。',
      body: '换一道更容易接上自己的经历就好。',
      evidenceText: '',
      factorNote: '',
      cta: '换一道题',
      secondaryCta: ''
    };
  }
  if (source.needsIntervention === false) {
    return {
      lead: '这次说得挺完整。',
      body: '你已经把主要意思表达清楚了。',
      evidenceText: '',
      factorNote: '',
      cta: '换一道题',
      secondaryCta: '同题再说一次'
    };
  }
  const issue = source.primaryIssue || 'UNCERTAIN';
  const factorNote = source.questionFactor === 'TOO_OPEN'
    ? '这道题本身比较开放，也增加了判断难度。'
    : '';

  if (issue === 'CONTENT_EXPAND') {
    const expand = createContentExpandCopy(source, transcript, question);
    return withInterventionCta({
      lead: '这里还少了一块信息。',
      body: expand.explanation,
      evidenceText: expand.evidenceText,
      actionPrompt: expand.followUpQuestion,
      factorNote
    }, source.interventionType);
  }
  if (issue === 'CONTENT_START') {
    return withInterventionCta({
      lead: '这题一下子不太好想也正常。',
      body: '先找一个具体对象，会更容易开始。',
      evidenceText: getEvidenceText(source, transcript),
      factorNote
    }, source.interventionType);
  }
  if (issue === 'LEXICAL_RETRIEVAL') {
    return withInterventionCta({
      lead: '你知道自己想表达什么，只是那个词暂时没出来。',
      body: '先不用找准确的词，把刚才想表达的意思换一种方式说出来。',
      evidenceText: source.evidenceContext || getEvidenceText(source, transcript),
      factorNote
    }, source.interventionType);
  }
  if (issue === 'INFORMATION_ORDER') {
    return withInterventionCta({
      lead: '你有内容，只是还没决定先说哪个。',
      body: '先确定第一条信息就够了，不需要重新组织整段。',
      evidenceText: getEvidenceText(source, transcript),
      factorNote
    }, source.interventionType);
  }

  const uncertain = getUncertainCopy(source.questionFactor, signals);
  return withInterventionCta({
    lead: uncertain.lead,
    body: uncertain.body,
    evidenceText: '',
    factorNote: '',
    secondaryCta: '今天先到这'
  }, source.interventionType || 'OBSERVE_AGAIN');
}

module.exports = { CTA_BY_INTERVENTION, createInsightCopy };
