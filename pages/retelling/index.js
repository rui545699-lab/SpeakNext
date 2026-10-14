const store = require('../../utils/retelling-store');
const trainingStore = require('../../utils/training-store');
const service = require('../../utils/retelling-service');
const retellingAnalytics = require('../../utils/retelling-analytics');
const { getSafeErrorDetails } = require('../../utils/safe-error-details');
const {
  getMaterialCoreChain,
  presentRetellingResult
} = require('../../utils/retelling-result-presenter');
const {
  buildGroundedReference,
  buildExpressionCue,
  buildMissingHintQuestion,
  buildUnresolvedConceptFeedback,
  buildResultReference,
  buildRetryPresentation,
  buildUncertainPresentation
} = require('../../utils/retelling-feedback-presenter');

const RESOLVED_TITLE_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: '中间原因补上了',
  INCORRECT_RELATION: '因果关系理顺了',
  LEXICAL_RETRIEVAL: '这次没有卡在那个词上',
  INFORMATION_ORDER: '表达顺序理顺了',
  UNCERTAIN: '本轮完成',
  WORDING_PRECISION: '这个说法更准确了',
  FORMULATION_BREAKDOWN: '这句话说完整了',
  CONCEPT_INACCURACY: '这个意思说准确了'
});

const UNRESOLVED_COPY_BY_NEED = Object.freeze({
  MISSING_CAUSAL_STEP: {
    title: '中间原因还缺一步',
    explanation: '你已经说到了结果，但中间的原因还没有补出来。'
  },
  INCORRECT_RELATION: {
    title: '因果关系还没理顺',
    explanation: '原因和结果的方向还需要重新确认。'
  },
  LEXICAL_RETRIEVAL: {
    title: '找词问题还没解决',
    explanation: '不要因为想不到一个词，就把那部分意思省略掉。'
  },
  INFORMATION_ORDER: {
    title: '表达顺序还没理顺',
    explanation: '关键信息基本都在，但先后关系还没有理顺。'
  },
  UNCERTAIN: {
    title: '信息还是太少',
    explanation: '目前的信息还不足以继续判断。'
  },
  WORDING_PRECISION: {
    title: '这个意思还可以再说准一点',
    explanation: '对照材料里的意思，再用自己的话说准确。'
  },
  FORMULATION_BREAKDOWN: {
    title: '这句话还是断开了',
    explanation: '意思已经有了，再把这句话连起来说完整。'
  },
  CONCEPT_INACCURACY: {
    title: '这个意思还没说准确',
    explanation: '对照原文里的意思，再用自己的话说准确。'
  }
});

function returnToHome() {
  if (typeof wx.navigateBack === 'function') {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.reLaunch({ url: '/pages/home/index' })
    });
    return;
  }
  wx.reLaunch({ url: '/pages/home/index' });
}

function getResultCopy(state) {
  if (!state.secondTranscript) {
    return {
      resultTitle: '主要意思已说清楚',
      resultAssist: '这次主要意思已经表达清楚。不必为了说得更长继续补充。',
      resultExplanation: '',
      showRetryActions: false,
      showMissingStructure: false,
      showConceptIncompleteStructure: false,
      compactResult: true,
      showResultEyebrow: true
    };
  }
  if (state.progressResult && state.progressResult.resolved) {
    return {
      resultTitle: RESOLVED_TITLE_BY_NEED[state.originalTrainingNeed] || '本轮完成',
      resultAssist: state.originalTrainingNeed === 'UNCERTAIN'
        ? '第二次已经说出了具体内容。'
        : '',
      resultExplanation: '',
      showRetryActions: false,
      showMissingStructure: false,
      showConceptIncompleteStructure: false,
      compactResult: false,
      showResultEyebrow: state.originalTrainingNeed !== 'UNCERTAIN'
    };
  }
  if (state.originalTrainingNeed === 'CONCEPT_INACCURACY'
    && state.progressResult
    && state.progressResult.reasonCode === 'CONCEPT_CORRECTED_CONTENT_INCOMPLETE') {
    return {
      resultTitle: '这里已经改对了，还差一步',
      resultAssist: '',
      resultExplanation: '刚才的原因已经说准确了，但这次还没有说到最后的结果。',
      showRetryActions: true,
      showMissingStructure: false,
      showConceptIncompleteStructure: true,
      compactResult: false,
      showResultEyebrow: true
    };
  }
  if (state.originalTrainingNeed === 'UNCERTAIN'
    && state.progressResult
    && state.progressResult.reasonCode === 'UNCERTAIN_CLARIFIED_ISSUE_REMAINS') {
    const currentNeed = state.secondRoundResult
      && state.secondRoundResult.routedResult
      && state.secondRoundResult.routedResult.primaryTrainingNeed;
    const explanationByNeed = {
      MISSING_CAUSAL_STEP: '第二次已经能看出你想表达的意思，但还有一个关键内容没有说完整。',
      INCORRECT_RELATION: '第二次已经能看出你想表达的意思，但原因和结果的方向还需要确认。',
      CONCEPT_INACCURACY: '第二次已经能看出你想表达的意思，但还有一个关键意思没有说准确。',
      INFORMATION_ORDER: '第二次已经能看出你想表达的意思，但信息的先后关系还没有理顺。',
      LEXICAL_RETRIEVAL: '第二次已经能看出你想表达的意思，但找词问题还没有解决。',
      WORDING_PRECISION: '第二次已经能看出你想表达的意思，但还有一个说法不够准确。',
      FORMULATION_BREAKDOWN: '第二次已经能看出你想表达的意思，但还有一句话没有说完整。'
    };
    return {
      resultTitle: '现在更清楚了，还差一步',
      resultAssist: '',
      resultExplanation: explanationByNeed[currentNeed]
        || '第二次已经能看出你想表达的意思，但当前问题还没有解决。',
      showRetryActions: true,
      showMissingStructure: currentNeed === 'MISSING_CAUSAL_STEP',
      resultStructureLabel: currentNeed === 'MISSING_CAUSAL_STEP' ? '还缺的关键意思' : '',
      showConceptIncompleteStructure: false,
      compactResult: false,
      showResultEyebrow: false
    };
  }
  const unresolved = UNRESOLVED_COPY_BY_NEED[state.originalTrainingNeed]
    || UNRESOLVED_COPY_BY_NEED.UNCERTAIN;
  return {
    resultTitle: unresolved.title,
    resultAssist: '',
    resultExplanation: unresolved.explanation,
    showRetryActions: true,
    showMissingStructure: state.originalTrainingNeed === 'MISSING_CAUSAL_STEP',
    showConceptIncompleteStructure: false,
    compactResult: false,
    showResultEyebrow: true
  };
}

function emitRetellingEvent(eventName, fields, sourceState) {
  const state = sourceState || store.getState();
  retellingAnalytics.trackRetellingEvent(Object.assign({
    eventName,
    sessionId: state.sessionId,
    materialId: state.materialId,
    stage: state.phase || null,
    recordingRound: null,
    primaryTrainingNeed: null,
    resolved: null
  }, fields || {}));
}

Page({
  data: {
    phase: 'READING',
    material: null,
    hint: '',
    hintAssist: '',
    hintEyebrow: '只调整一个地方',
    hintTitle: '',
    hintDescription: '',
    hintButtonText: '再完整说一次',
    uncertainVariant: '',
    expressionCueText: '',
    secondRecordingEyebrow: '再完整复述一次',
    secondRecordingTitle: '用自己的话把主要意思说清楚',
    secondRecordingHint: '完整复述即可，不需要逐句背诵。',
    showTranscriptResult: true,
    firstTranscript: '',
    secondTranscript: '',
    firstRoundResult: null,
    originalTrainingNeed: '',
    secondRoundResult: null,
    progressResult: null,
    firstEvaluation: null,
    progressEvaluation: null,
    processingLabel: '',
    errorMessage: '',
    resultTitle: '',
    resultAssist: '',
    resultExplanation: '',
    showRetryActions: false,
    showMissingStructure: false,
    showConceptIncompleteStructure: false,
    compactResult: false,
    showResultEyebrow: true,
    missingStructureItems: [],
    conceptIncompleteStructureItems: [],
    resultPresentation: null,
    expressionTarget: null,
    conceptTarget: null,
    conceptReferenceText: '',
    wordingReferenceText: '',
    missingHintQuestion: '',
    resultReferenceText: '',
    unresolvedMaterialEvidence: '',
    unresolvedMaterialLabel: '材料里的意思',
    unresolvedConceptUserEvidence: '',
    showUnresolvedConceptFeedback: false
  },
  onLoad() {
    this.pageActive = true;
    this.exitRequested = false;
    store.startNewSession();
    this.sync();
    emitRetellingEvent(retellingAnalytics.EVENT_NAMES.SESSION_STARTED, {
      stage: store.PHASES.READING
    });
  },
  sync(extra) {
    if (this.pageActive === false || this.exitRequested) return;
    const state = store.getState();
    const resultCopy = getResultCopy(state);
    const uncertainPresentation = buildUncertainPresentation({
      firstRoundResult: state.firstRoundResult
    });
    const retryPresentation = buildRetryPresentation({
      trainingNeed: state.originalTrainingNeed,
      retryScope: state.originalRetryScope
    });
    const resultPresentation = presentRetellingResult({
      originalTrainingNeed: state.originalTrainingNeed,
      firstRoundResult: state.firstRoundResult,
      secondRoundResult: state.secondRoundResult,
      progressResult: state.progressResult,
      material: state.material
    });
    const conceptReference = buildGroundedReference({
      material: state.material,
      target: state.originalConceptTarget,
      trainingNeed: 'CONCEPT_INACCURACY'
    });
    const wordingReference = buildGroundedReference({
      material: state.material,
      target: state.originalExpressionTarget,
      trainingNeed: 'WORDING_PRECISION'
    });
    const expressionCue = state.originalTrainingNeed === 'FORMULATION_BREAKDOWN'
      ? buildExpressionCue({
        material: state.material,
        target: state.originalExpressionTarget
      })
      : null;
    const missingHint = state.originalTrainingNeed === 'MISSING_CAUSAL_STEP'
      ? buildMissingHintQuestion({
        material: state.material,
        taskResult: state.firstRoundResult && state.firstRoundResult.taskResult
      })
      : null;
    const resultCanShowReference = state.phase === store.PHASES.RESULT
      && (state.originalTrainingNeed === 'PASS'
        || (state.progressResult && state.progressResult.resolved === true));
    const resultTarget = state.originalTrainingNeed === 'CONCEPT_INACCURACY'
      ? state.originalConceptTarget
      : ['WORDING_PRECISION', 'FORMULATION_BREAKDOWN'].includes(state.originalTrainingNeed)
        ? state.originalExpressionTarget
        : null;
    const resultReference = resultCanShowReference
      ? buildResultReference({
        material: state.material,
        trainingNeed: state.originalTrainingNeed,
        target: resultTarget
      })
      : null;
    const unresolvedConceptFeedback = state.phase === store.PHASES.RESULT
      && state.originalTrainingNeed === 'CONCEPT_INACCURACY'
      && state.progressResult
      && state.progressResult.resolved === false
      ? buildUnresolvedConceptFeedback({
        material: state.material,
        secondRoundResult: state.secondRoundResult,
        originalTarget: state.originalConceptTarget
      })
      : null;
    if (resultPresentation && resultPresentation.title) {
      resultCopy.resultTitle = resultPresentation.title;
    }
    this.setData(Object.assign({}, state, resultCopy, {
      hintEyebrow: retryPresentation
        ? retryPresentation.eyebrow
        : uncertainPresentation
          ? uncertainPresentation.eyebrow
        : '只调整一个地方',
      hintTitle: retryPresentation
        ? retryPresentation.title
        : uncertainPresentation ? uncertainPresentation.title : state.hint,
      hintDescription: retryPresentation
        ? retryPresentation.description
        : uncertainPresentation
          ? uncertainPresentation.description
        : state.hintAssist,
      hintButtonText: retryPresentation
        ? retryPresentation.buttonText
        : uncertainPresentation
          ? uncertainPresentation.buttonText
        : '再完整说一次',
      uncertainVariant: uncertainPresentation
        ? uncertainPresentation.uncertainVariant
        : '',
      expressionCueText: expressionCue ? expressionCue.text : '',
      secondRecordingEyebrow: state.originalRetryScope === 'TARGET_EXPRESSION'
        ? '只重说这一句'
        : '再完整复述一次',
      secondRecordingTitle: state.originalRetryScope === 'TARGET_EXPRESSION'
        ? '把刚才这句话说清楚'
        : '用自己的话把主要意思说清楚',
      secondRecordingHint: state.originalRetryScope === 'TARGET_EXPRESSION'
        ? '只说目标表达，不用重新说整篇。'
        : '完整复述即可，不需要逐句背诵。',
      showTranscriptResult: state.originalRetryScope !== 'TARGET_EXPRESSION',
      missingStructureItems: getMaterialCoreChain(state.material),
      resultStructureLabel: resultCopy.resultStructureLabel || '',
      conceptIncompleteStructureItems: getMaterialCoreChain(state.material).slice(1),
      resultPresentation,
      expressionTarget: state.originalExpressionTarget,
      conceptTarget: state.originalConceptTarget,
      conceptReferenceText: conceptReference ? conceptReference.text : '',
      wordingReferenceText: wordingReference ? wordingReference.text : '',
      missingHintQuestion: missingHint ? missingHint.text : '',
      resultReferenceText: resultReference ? resultReference.text : '',
      unresolvedMaterialLabel: state.originalTrainingNeed === 'CONCEPT_INACCURACY'
        ? '关键意思'
        : '材料里的意思',
      unresolvedConceptUserEvidence: unresolvedConceptFeedback
        ? unresolvedConceptFeedback.userEvidenceText
        : '',
      showUnresolvedConceptFeedback: Boolean(unresolvedConceptFeedback),
      unresolvedMaterialEvidence: (() => {
        if (!resultCopy.showRetryActions) return '';
        if (state.originalTrainingNeed === 'CONCEPT_INACCURACY') {
          if (state.progressResult
            && state.progressResult.reasonCode === 'CONCEPT_CORRECTED_CONTENT_INCOMPLETE') return '';
          return unresolvedConceptFeedback
            ? unresolvedConceptFeedback.referenceText
            : conceptReference ? conceptReference.text : '';
        }
        if (state.originalTrainingNeed === 'WORDING_PRECISION') {
          return wordingReference ? wordingReference.text : '';
        }
        return '';
      })()
    }, extra || {}));
  },
  startFirstRecording() {
    if (store.beginFirstRecording()) {
      this.sync();
      emitRetellingEvent(retellingAnalytics.EVENT_NAMES.READING_COMPLETED, {
        stage: store.PHASES.FIRST_RECORDING,
        recordingRound: 1
      });
    }
  },
  switchMaterial() {
    if (store.getState().phase !== store.PHASES.READING) return;
    store.startNewSession();
    this.sync({ processingLabel: '' });
    emitRetellingEvent(retellingAnalytics.EVENT_NAMES.SESSION_STARTED, {
      stage: store.PHASES.READING
    });
  },
  startSecondRecording() {
    if (store.beginSecondRecording()) this.sync();
  },
  handleRecordingError(event) {
    if (this.pageActive === false || this.exitRequested) return;
    const round = this.data.phase === 'SECOND_RECORDING' ? 2 : 1;
    console.error('[RETELLING] recorder failed', getSafeErrorDetails(event && event.detail));
    store.fail(round, '未能使用麦克风，请检查权限后重试。');
    this.sync();
  },
  handleRecordingComplete(event) {
    if (this.pageActive === false || this.exitRequested) return Promise.resolve();
    const recording = event && event.detail ? event.detail : {};
    const round = this.data.phase === 'SECOND_RECORDING' ? 2 : 1;
    if (!recording.recorded || !recording.tempFilePath
      || Number(recording.durationMs) <= 500 || Number(recording.fileSize) <= 0) {
      store.fail(round, '这段录音太短或没有录到声音，请重新录音。');
      this.sync();
      return;
    }
    if (!store.startProcessing(round)) return;
    emitRetellingEvent(
      round === 1
        ? retellingAnalytics.EVENT_NAMES.FIRST_RECORDING_COMPLETED
        : retellingAnalytics.EVENT_NAMES.SECOND_RECORDING_COMPLETED,
      {
        stage: round === 1 ? store.PHASES.FIRST_RECORDING : store.PHASES.SECOND_RECORDING,
        recordingRound: round
      }
    );
    this.sync({ processingLabel: '正在分析你的复述…' });
    const state = store.getState();
    const sessionId = state.sessionId;
    const isActiveSession = () => this.pageActive !== false
      && !this.exitRequested
      && store.getState().sessionId === sessionId;
    return service.transcribeRetellingRecording(recording, state.sessionId, round)
      .then((asrResult) => {
        if (!isActiveSession()) return false;
        this.setData({ processingLabel: '正在分析你的复述…' });
        if (round === 1) {
          return service.callRetellingEvaluation(state.material, asrResult.transcript)
            .then((result) => {
              if (!isActiveSession()) return null;
              const saved = store.setFirstResult(asrResult.transcript, result.firstRoundResult);
              return saved ? { type: 'FIRST_EVALUATION' } : null;
            });
        }
        return service.callRetellingProgress(
          state.material,
          state.firstRoundResult,
          state.originalTrainingNeed,
          asrResult.transcript,
          state.originalRetryScope,
          state.originalConceptTarget,
          state.originalExpressionTarget
        ).then((result) => {
          if (!isActiveSession()) return null;
          const saved = store.setProgressResult(
            asrResult.transcript,
            result.secondRoundResult,
            result.progressResult
          );
          return saved ? { type: 'PROGRESS_EVALUATION' } : null;
        });
      })
      .then((outcome) => {
        if (!isActiveSession()) return;
        this.sync({ processingLabel: '' });
        if (!outcome) return;
        const completedState = store.getState();
        if (outcome.type === 'FIRST_EVALUATION') {
          emitRetellingEvent(retellingAnalytics.EVENT_NAMES.FIRST_EVALUATION_COMPLETED, {
            stage: 'FIRST_EVALUATION',
            recordingRound: 1,
            primaryTrainingNeed: completedState.originalTrainingNeed || null
          }, completedState);
          if (completedState.phase === store.PHASES.MICRO_HINT) {
            emitRetellingEvent(retellingAnalytics.EVENT_NAMES.INTERVENTION_SHOWN, {
              stage: store.PHASES.MICRO_HINT,
              recordingRound: 1,
              primaryTrainingNeed: completedState.originalTrainingNeed || null
            }, completedState);
          }
          return;
        }
        emitRetellingEvent(retellingAnalytics.EVENT_NAMES.PROGRESS_COMPLETED, {
          stage: 'PROGRESS_EVALUATION',
          recordingRound: 2,
          primaryTrainingNeed: completedState.originalTrainingNeed || null,
          resolved: completedState.progressResult
            ? completedState.progressResult.resolved === true
            : null
        }, completedState);
      })
      .catch((error) => {
        if (!isActiveSession()) return;
        console.error('[RETELLING] round failed', Object.assign(
          { stage: error && error.stage ? error.stage : 'RETELLING_FAILED' },
          getSafeErrorDetails(error)
        ));
        store.fail(round, '这次没有完成，请检查网络后重新录音。');
        this.sync({ processingLabel: '' });
      });
  },
  retryRecording() {
    if (store.retry()) this.sync();
  },
  restartTraining() {
    const previousState = store.getState();
    if (previousState.phase !== store.PHASES.RESULT
      || !previousState.progressResult
      || previousState.progressResult.resolved !== false) return;
    emitRetellingEvent(retellingAnalytics.EVENT_NAMES.RETRY_STARTED, {
      stage: store.PHASES.RESULT,
      recordingRound: previousState.recordingCount || 2,
      primaryTrainingNeed: previousState.originalTrainingNeed || null,
      resolved: false
    }, previousState);
    store.restartCurrentMaterial();
    this.sync({ processingLabel: '' });
    emitRetellingEvent(retellingAnalytics.EVENT_NAMES.SESSION_STARTED, {
      stage: store.PHASES.READING
    });
  },
  finishSession() {
    if (this.completionPending) return Promise.resolve(false);
    const state = store.getState();
    if (state.phase !== store.PHASES.RESULT || !state.sessionId) return Promise.resolve(false);
    this.completionPending = true;
    const completion = trainingStore.completePracticeSession(state.sessionId);
    if (!completion.ok) {
      this.completionPending = false;
      console.error('[RETELLING] completion persistence failed', { sessionId: state.sessionId });
      if (typeof wx.showToast === 'function') {
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      }
      return Promise.resolve(false);
    }
    emitRetellingEvent(retellingAnalytics.EVENT_NAMES.ROUND_COMPLETED, {
      stage: store.PHASES.RESULT,
      recordingRound: state.recordingCount || null,
      primaryTrainingNeed: state.originalTrainingNeed || null,
      resolved: state.secondTranscript && state.progressResult
        ? state.progressResult.resolved === true
        : null
    }, state);
    return Promise.resolve(this.backHome())
      .then(() => true)
      .finally(() => { this.completionPending = false; });
  },
  backHome() {
    if (this.exitRequested) return Promise.resolve();
    this.exitRequested = true;
    this.pageActive = false;
    const recorder = typeof this.selectComponent === 'function'
      ? this.selectComponent('#retellingRecorder')
      : null;
    if (!recorder || typeof recorder.stopForExit !== 'function') {
      returnToHome();
      return Promise.resolve();
    }
    return Promise.resolve(recorder.stopForExit())
      .catch((error) => {
        console.error('[RETELLING] recorder release failed', getSafeErrorDetails(error));
      })
      .then(() => returnToHome());
  },
  onUnload() {
    this.pageActive = false;
    this.exitRequested = true;
  }
});
