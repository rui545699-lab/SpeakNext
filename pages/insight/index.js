const { STATES, ISSUE_TYPES } = require('../../utils/constants');
const store = require('../../utils/training-store');
const { trackEvent } = require('../../utils/analytics');
const { createInsightCopy } = require('../../utils/insight-copy');
const { callAsrFunction, callInterventionCheck } = require('../../utils/diagnosis-service');
const { getSafeErrorDetails } = require('../../utils/safe-error-details');
const { createInterventionPlan, createInitialSlotState } = require('../../utils/intervention-plan');
const { createContentExpandCopy } = require('../../utils/diagnosis-copy');

Page({
  data: {
    diagnosis: {}, insightCopy: {}, question: {},
    inlineIntervention: false, inlineState: 'RECORDING', inlineError: ''
  },
  onLoad() {
    this.inlineCancelled = false;
    this.inlineHistory = [];
    const runtime = store.getRuntime();
    this.setData({
      diagnosis: runtime.diagnosis,
      question: runtime.question,
      insightCopy: createInsightCopy(runtime.diagnosis, runtime.transcript, runtime.signals, runtime.question)
    });
    trackEvent('insight_view', {
      question_id: runtime.question.id,
      issue_type: runtime.diagnosis.primaryIssue || '',
      intervention_type: runtime.diagnosis.interventionType || '',
      needs_intervention: runtime.diagnosis.needsIntervention,
      diagnosis_confidence: runtime.diagnosis.confidence,
      session_round: runtime.sessionRound
    });
  },
  handlePrimary() {
    const runtime = store.getRuntime();
    if (runtime.diagnosis.needsIntervention === false) {
      const question = store.pickNextQuestion(runtime.question.id);
      store.transition(STATES.RECORDING, store.createNextRoundPatch(question, runtime.sessionRound + 1));
      wx.redirectTo({ url: '/pages/recording/index' });
      return;
    }
    if (runtime.diagnosis.primaryIssue === ISSUE_TYPES.UNCERTAIN) {
      const question = store.pickNextQuestion(runtime.question.id);
      store.transition(
        STATES.RECORDING,
        store.createNextRoundPatch(question, runtime.sessionRound + 1)
      );
      wx.redirectTo({ url: '/pages/recording/index' });
      return;
    }
    store.transition(STATES.INTERVENTION);
    trackEvent('intervention_start', {
      issue_type: runtime.diagnosis.primaryIssue,
      intervention_type: runtime.diagnosis.interventionType,
      session_round: runtime.sessionRound
    });
    if (runtime.diagnosis.interventionType === 'ONE_DETAIL') {
      const plan = createInterventionPlan(runtime);
      this.inlineSlotState = createInitialSlotState(
        runtime.question,
        runtime.diagnosis,
        runtime.transcript
      );
      this.inlineTargetSlot = plan.targetSlot || '';
      this.setData({ inlineIntervention: true, inlineState: 'RECORDING', inlineError: '' });
      return;
    }
    wx.redirectTo({ url: '/pages/intervention/index' });
  },
  handleInlineRecorded(event) {
    const recording = Object.assign({}, event.detail || {});
    const validAudio = recording.recorded === true && Boolean(recording.tempFilePath)
      && Number(recording.durationMs) > 500 && Number(recording.fileSize) > 0;
    if (!validAudio) {
      this.showInlineRetry('这次没有录下来，请重新说一次。');
      return Promise.resolve();
    }
    const runtime = store.getRuntime();
    const cloudPath = `speech/${runtime.sessionId}/${runtime.roundId}-intervention-${Date.now()}.mp3`;
    this.setData({ inlineState: 'CHECKING', inlineError: '' });
    console.log('[INSIGHT ONE_DETAIL] upload start', {
      cloudPath, durationMs: Number(recording.durationMs) || 0
    });
    let asrResult;
    return wx.cloud.uploadFile({ cloudPath, filePath: recording.tempFilePath })
      .then((uploadResult) => {
        if (!uploadResult || !uploadResult.fileID) throw new Error('INTERVENTION_UPLOAD_NO_FILE_ID');
        return callAsrFunction(uploadResult.fileID);
      }).then((result) => {
        if (this.inlineCancelled) return null;
        const afterTranscript = result && typeof result.transcript === 'string'
          ? result.transcript.trim() : '';
        if (!result || result.ok !== true || result.stage !== 'ASR' || !afterTranscript) {
          throw new Error('INTERVENTION_ASR_EMPTY_OR_FAILED');
        }
        asrResult = result;
        return callInterventionCheck({
          interventionType: 'ONE_DETAIL',
          beforeTranscript: [runtime.transcript].concat(this.inlineHistory).filter(Boolean).join(' '),
          afterTranscript,
          phase: 'COMPLETE_INTERVENTION',
          originalQuestion: runtime.question.text || '',
          questionTaskType: runtime.question.taskType || '',
          questionRequiredSlots: runtime.question.requiredSlots || [],
          slotState: this.inlineSlotState,
          targetSlot: this.inlineTargetSlot || '',
          currentPrompt: this.data.insightCopy.actionPrompt || ''
        });
      }).then((checkResult) => {
        if (this.inlineCancelled || !checkResult) return;
        if (checkResult.ok !== true || checkResult.stage !== 'INTERVENTION_CHECK'
          || checkResult.result !== 'PASS') {
          this.showInlineRetry('这句还没有补上需要的信息，请再试一次。');
          return;
        }
        const afterText = String(asrResult.transcript || '').trim();
        this.inlineSlotState = checkResult.slot_state || this.inlineSlotState;
        this.inlineHistory.push(afterText);
        if (checkResult.original_task_complete !== true) {
          const diagnosis = Object.assign({}, this.data.diagnosis, {
            missingRequiredSlots: Array.isArray(checkResult.missing_required_slots)
              ? checkResult.missing_required_slots : [],
            slotState: checkResult.slot_state || this.inlineSlotState || {}
          });
          const combinedTranscript = [runtime.transcript].concat(this.inlineHistory).join(' ');
          const expandCopy = createContentExpandCopy(diagnosis, combinedTranscript, runtime.question);
          this.inlineTargetSlot = expandCopy.missingSlot === 'legacy_detail'
            ? ''
            : expandCopy.missingSlot;
          console.log('[INSIGHT ONE_DETAIL] intervention passed; original task incomplete', {
            missingRequiredSlots: diagnosis.missingRequiredSlots
          });
          this.setData({
            diagnosis,
            insightCopy: createInsightCopy(diagnosis, combinedTranscript, runtime.signals, runtime.question),
            inlineState: 'RECORDING',
            inlineError: ''
          });
          return;
        }
        this.commitInlineResult({
          type: runtime.diagnosis.primaryIssue,
          interventionType: 'ONE_DETAIL',
          beforeText: runtime.transcript,
          afterText: this.inlineHistory.join(' '),
          recognizedText: afterText,
          recorded: true,
          durationMs: Number(recording.durationMs) || 0,
          fileSize: Number(recording.fileSize) || 0,
          audioFileId: asrResult.audioFileId || '',
          asrRequestId: asrResult.requestId || '',
          checkResult: 'PASS',
          interventionPass: true,
          originalTaskComplete: true,
          checkReason: checkResult.reason || '',
          checkRequestId: checkResult.requestId || '',
          checkModelVersion: checkResult.modelVersion || ''
        });
      }).catch((error) => {
        if (this.inlineCancelled) return;
        console.error('[INSIGHT ONE_DETAIL] failed', getSafeErrorDetails(error));
        this.showInlineRetry('上传或识别没有完成，请重新说一次。');
      });
  },
  handleInlineRecordError(event) {
    const detail = event && event.detail ? event.detail : {};
    console.error('[INSIGHT ONE_DETAIL] recorder failed', {
      errorType: detail.errorType || '', errMsg: detail.errMsg || ''
    });
    this.showInlineRetry('这次没有录下来，请重新说一次。');
  },
  handleInlineRetry() {
    this.setData({ inlineState: 'RECORDING', inlineError: '' });
  },
  showInlineRetry(message) {
    this.setData({ inlineState: 'RETRY', inlineError: message });
  },
  commitInlineResult(result) {
    const runtime = store.getRuntime();
    if (!store.setInterventionResult(result, { checkStatus: 'PASS' })) {
      this.showInlineRetry('这次验证没有完成，请重新说一次。');
      return;
    }
    store.transition(STATES.MICRO_RESULT);
    wx.redirectTo({
      url: '/pages/micro-result/index',
      success: () => {
        store.recordIntervention(runtime.diagnosis.primaryIssue, 'ONE_DETAIL');
        trackEvent('intervention_complete', {
          question_id: runtime.question.id,
          issue_type: runtime.diagnosis.primaryIssue,
          intervention_type: 'ONE_DETAIL',
          session_round: runtime.sessionRound
        });
      }
    });
  },
  handleSecondary() {
    const runtime = store.getRuntime();
    if (runtime.diagnosis.needsIntervention === false) {
      store.transition(STATES.RECORDING,
        store.createNextRoundPatch(runtime.question, runtime.sessionRound + 1));
      wx.redirectTo({ url: '/pages/recording/index' });
      return;
    }
    store.transition(STATES.SESSION_SUMMARY);
    wx.redirectTo({ url: '/pages/session-summary/index' });
  },
  onUnload() {
    this.inlineCancelled = true;
  }
});
