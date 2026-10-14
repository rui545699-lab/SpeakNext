const UNCERTAIN_COPY = Object.freeze({
  TOO_OPEN: Object.freeze({
    lead: '我听到了停顿或犹豫。',
    body: '但这个问题太开放，现在还不能可靠判断主要卡在哪。'
  }),
  ASR_UNCERTAIN: Object.freeze({
    lead: '已经听到一些表达信号。',
    body: '但这次语音识别不够稳定，暂时无法可靠判断属于哪一类卡点。'
  }),
  NONE: Object.freeze({
    lead: '这次的信息还不够。',
    body: '目前暂时无法可靠判断属于哪一类卡点，可以换一道题再观察一次。'
  }),
  SMOOTH: Object.freeze({
    lead: '这次表达比较顺。',
    body: '目前没有看到需要立刻练习的明显行为信号。'
  }),
  OTHER: Object.freeze({
    lead: '已经听到一些值得继续观察的信号。',
    body: '但目前证据不足，暂时无法可靠判断属于哪一类卡点。'
  })
});

function hasBehaviorSignal(signals) {
  if (!signals || typeof signals !== 'object') return null;
  return Number(signals.long_pause_count) > 0
    || Number(signals.filler_count) > 0
    || Number(signals.start_latency_ms) > 1200
    || (Array.isArray(signals.explicit_lexical_markers) && signals.explicit_lexical_markers.length > 0);
}

function getUncertainCopy(questionFactor, signals) {
  if (questionFactor === 'NONE' && hasBehaviorSignal(signals) === false) {
    return UNCERTAIN_COPY.SMOOTH;
  }
  return UNCERTAIN_COPY[questionFactor] || UNCERTAIN_COPY.OTHER;
}

module.exports = { UNCERTAIN_COPY, hasBehaviorSignal, getUncertainCopy };
