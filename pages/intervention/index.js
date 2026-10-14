const { STATES } = require('../../utils/constants');
const store = require('../../utils/training-store');
const { trackEvent } = require('../../utils/analytics');
const { callAsrFunction, callInterventionCheck } = require('../../utils/diagnosis-service');
const {
  createInterventionPlan,
  applyFallbackAnchor,
  createNarrowOriginalTaskPlan,
  createInitialSlotState,
  fillSlotState
} = require('../../utils/intervention-plan');
const { getSafeErrorDetails } = require('../../utils/safe-error-details');
const { createMissingSlotQuestion } = require('../../utils/diagnosis-copy');

Page({
  data: {
    plan: {},
    actionState: 'BOOTSTRAP',
    errorMessage: ''
  },
  onLoad() {
    this.interventionCancelled = false;
    this.interventionHistory = [];
    const runtime = store.getRuntime();
    const plan = createInterventionPlan(runtime);
    this.slotState = createInitialSlotState(runtime.question, runtime.diagnosis, runtime.transcript);
    this.setData({
      plan,
      actionState: plan.fallbackRequired ? 'SELECTING' : 'RECORDING',
      errorMessage: ''
    });
  },
  handleAnchorSelect(event) {
    const anchor = event && event.detail ? event.detail.anchor : '';
    if (!anchor) return;
    const plan = applyFallbackAnchor(this.data.plan, anchor);
    this.setData({ plan, actionState: 'RECORDING', errorMessage: '' });
  },
  handleRecorded(event) {
    const recording = Object.assign({}, event.detail || {});
    const validAudio = recording.recorded === true
      && Boolean(recording.tempFilePath)
      && Number(recording.durationMs) > 500
      && Number(recording.fileSize) > 0;
    console.log('[INTERVENTION] recording complete', {
      recorded: recording.recorded === true,
      hasTempFilePath: Boolean(recording.tempFilePath),
      durationMs: Number(recording.durationMs) || 0,
      fileSize: Number(recording.fileSize) || 0
    });
    if (!validAudio) {
      this.showRetry('这次没有录下来，请重新说一次。');
      return Promise.resolve();
    }

    const runtime = store.getRuntime();
    const cloudPath = `speech/${runtime.sessionId}/${runtime.roundId}-intervention-${Date.now()}.mp3`;
    this.setData({ actionState: 'CHECKING', errorMessage: '' });
    console.log('[INTERVENTION] upload start', {
      cloudPath,
      interventionType: runtime.diagnosis.interventionType,
      durationMs: Number(recording.durationMs) || 0
    });

    let asrResult;
    return wx.cloud.uploadFile({
      cloudPath,
      filePath: recording.tempFilePath
    }).then((uploadResult) => {
      if (!uploadResult || !uploadResult.fileID) throw new Error('INTERVENTION_UPLOAD_NO_FILE_ID');
      return callAsrFunction(uploadResult.fileID);
    }).then((result) => {
      if (this.interventionCancelled) return null;
      const afterTranscript = result && typeof result.transcript === 'string'
        ? result.transcript.trim()
        : '';
      if (!result || result.ok !== true || result.stage !== 'ASR' || !afterTranscript) {
        throw new Error('INTERVENTION_ASR_EMPTY_OR_FAILED');
      }
      asrResult = result;
      return callInterventionCheck({
        interventionType: runtime.diagnosis.interventionType,
        beforeTranscript: [runtime.transcript].concat(this.interventionHistory).filter(Boolean).join(' '),
        afterTranscript,
        anchor: this.data.plan.anchor || '',
        phase: this.data.plan.phase || 'COMPLETE_INTERVENTION',
        originalQuestion: this.data.plan.originalQuestion || '',
        questionTaskType: runtime.question.taskType || '',
        questionRequiredSlots: runtime.question.requiredSlots || [],
        slotState: this.slotState,
        targetSlot: this.data.plan.targetSlot || '',
        currentPrompt: this.data.plan.prompt || ''
      });
    }).then((checkResult) => {
      if (this.interventionCancelled || !checkResult) return;
      if (
        checkResult.ok !== true
        || checkResult.stage !== 'INTERVENTION_CHECK'
        || checkResult.result !== 'PASS'
      ) {
        this.showRetry('这次还没完成这一步，换一种说法再试一次。');
        return;
      }
      const afterText = String(asrResult.transcript || '').trim();
      this.slotState = checkResult.slot_state || this.slotState;
      if (
        runtime.diagnosis.interventionType === 'NARROW_SCOPE'
        && this.data.plan.phase === 'FIND_OBJECT'
      ) {
        this.interventionHistory.push(afterText);
        const nextPlan = createNarrowOriginalTaskPlan(this.data.plan, afterText);
        this.slotState = fillSlotState(this.slotState, 'object', nextPlan.anchor);
        console.log('[INTERVENTION] narrow scope object found', {
          transcriptLength: afterText.length,
          originalTaskComplete: false
        });
        this.setData({ plan: nextPlan, actionState: 'RECORDING', errorMessage: '' });
        return;
      }
      if (checkResult.original_task_complete !== true) {
        this.interventionHistory.push(afterText);
        const guidance = createMissingSlotQuestion({
          missingRequiredSlots: checkResult.missing_required_slots || []
        }, runtime.question);
        this.setData({
          plan: Object.assign({}, this.data.plan, {
            prompt: guidance.question,
            targetSlot: guidance.slot === 'legacy_detail' ? '' : guidance.slot
          }),
          actionState: 'RECORDING',
          errorMessage: ''
        });
        return;
      }
      const fullAfterText = this.interventionHistory.concat(afterText).join(' ');
      this.commitInterventionResult({
        type: runtime.diagnosis.primaryIssue,
        interventionType: runtime.diagnosis.interventionType,
        beforeText: runtime.transcript,
        afterText: fullAfterText,
        recognizedText: afterText,
        recorded: true,
        durationMs: Number(recording.durationMs) || 0,
        fileSize: Number(recording.fileSize) || 0,
        audioFileId: asrResult.audioFileId || '',
        asrRequestId: asrResult.requestId || '',
        checkResult: 'PASS',
        interventionPass: checkResult.intervention_pass !== false,
        originalTaskComplete: checkResult.original_task_complete === true,
        checkReason: checkResult.reason || '',
        checkRequestId: checkResult.requestId || '',
        checkModelVersion: checkResult.modelVersion || ''
      });
    }).catch((error) => {
      if (this.interventionCancelled) return;
      console.error('[INTERVENTION] failed', getSafeErrorDetails(error));
      this.showRetry('上传或识别没有完成，请重新说一次。');
    });
  },
  handleRetry() {
    this.setData({ actionState: 'RECORDING', errorMessage: '' });
  },
  showRetry(message) {
    this.setData({ actionState: 'RETRY', errorMessage: message });
  },
  commitInterventionResult(result) {
    const runtime = store.getRuntime();
    const stored = store.setInterventionResult(result, { checkStatus: 'PASS' });
    if (!stored) {
      this.showRetry('这次验证没有完成，请重新说一次。');
      return;
    }
    store.transition(STATES.MICRO_RESULT);
    wx.redirectTo({
      url: '/pages/micro-result/index',
      success: () => {
        store.recordIntervention(runtime.diagnosis.primaryIssue, runtime.diagnosis.interventionType);
        trackEvent('intervention_complete', {
          question_id: runtime.question.id,
          issue_type: runtime.diagnosis.primaryIssue,
          intervention_type: runtime.diagnosis.interventionType,
          session_round: runtime.sessionRound
        });
      }
    });
  },
  handleBack() {
    this.requestExit();
  },
  requestExit() {
    wx.showModal({
      title: '退出这轮训练？',
      content: '这次还没有完成。',
      cancelText: '继续训练',
      confirmText: '退出',
      success: (result) => {
        if (!result.confirm) return;
        store.resetToHome();
        wx.reLaunch({ url: '/pages/home/index' });
      }
    });
  },
  onUnload() {
    this.interventionCancelled = true;
  }
});
