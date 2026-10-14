const { STATES } = require('../../utils/constants');
const store = require('../../utils/training-store');
const { trackEvent } = require('../../utils/analytics');
const { analyzeRecording } = require('../../utils/diagnosis-service');
const { getSafeErrorDetails } = require('../../utils/safe-error-details');

Page({
  data: {
    question: {},
    sessionRound: 1,
    ready: false,
    processing: false,
    processingStage: 'UPLOADING',
    failed: false,
    errorTitle: '',
    errorDetail: ''
  },
  onLoad() {
    const runtime = store.getRuntime();
    this.setData({
      question: runtime.question,
      sessionRound: runtime.sessionRound,
      ready: runtime.recordingReady === true
    });
  },
  startRecording() {
    this.setData({ ready: false });
  },
  skipQuestion() {
    if (!this.data.ready) return;
    const runtime = store.getRuntime();
    const skippedQuestionId = runtime.question.id;
    const question = store.pickNextQuestion(skippedQuestionId);
    const nextRuntime = store.transition(
      STATES.RECORDING,
      store.createNextRoundPatch(question, runtime.sessionRound)
    );
    this.setData({
      question: nextRuntime.question,
      sessionRound: nextRuntime.sessionRound,
      ready: true,
      processing: false,
      failed: false
    });
    trackEvent('question_skip', {
      question_id: skippedQuestionId,
      session_round: runtime.sessionRound
    });
    trackEvent('question_view', {
      question_id: question.id,
      session_round: nextRuntime.sessionRound
    });
  },
  onRecordStart() {
    trackEvent('record_start', {
      question_id: this.data.question.id,
      session_round: this.data.sessionRound
    });
  },
  onRecordError(event) {
    const detail = event.detail || {};
    console.error('[RECORDING PAGE] failed', {
      stage: detail.errorType || 'RECORD_FAILED',
      errMsg: detail.errMsg || ''
    });
  },
  onRecordComplete(event) {
    const recording = event.detail || {};
    const duration = recording.duration;
    const validAudio = Boolean(recording.tempFilePath)
      && Number(recording.durationMs) > 500
      && Number(recording.fileSize) > 0;
    if (!recording.recorded || !validAudio) {
      console.error('[RECORDING PAGE] failed', {
        stage: recording.errorType || 'EMPTY_AUDIO',
        hasTempFilePath: Boolean(recording.tempFilePath),
        duration: Number(recording.durationMs) || 0,
        fileSize: Number(recording.fileSize) || 0
      });
      wx.showModal({
        title: '这次没有录下来',
        content: '请检查麦克风权限后再试一次。',
        showCancel: false,
        success: () => wx.redirectTo({ url: '/pages/recording/index' })
      });
      return;
    }
    store.setRecording(recording);
    store.transition(STATES.PROCESSING);
    trackEvent('record_complete', {
      question_id: this.data.question.id,
      speech_duration: duration,
      session_round: this.data.sessionRound
    });
    this.runDiagnosis();
  },
  runDiagnosis() {
    this.cancelled = false;
    const runtime = store.getRuntime();
    this.setData({
      processing: true,
      processingStage: 'UPLOADING',
      failed: false,
      errorTitle: '',
      errorDetail: ''
    });
    analyzeRecording(runtime, (stage) => this.setData({ processingStage: stage }))
      .then((result) => {
        if (this.cancelled) return;
        if (!result || result.ok !== true || result.stage !== 'DIAGNOSIS' || !result.diagnosis) {
          const error = new Error('DIAGNOSIS_NOT_COMPLETED');
          error.stage = result && result.stage ? result.stage : 'CLOUD_FUNCTION_FAILED';
          throw error;
        }
        store.setAsrResult(result);
        store.setAnalysisResult(result);
        store.transition(STATES.INSIGHT);
        wx.redirectTo({ url: '/pages/insight/index' });
      })
      .catch((error) => {
        if (this.cancelled) return;
        console.error('[RECORDING] diagnosis failed', Object.assign(
          { stage: error && error.stage ? error.stage : 'CLOUD_FUNCTION_FAILED' },
          getSafeErrorDetails(error)
        ));
        const isAsrFailure = error && error.stage === 'ASR';
        this.setData({
          processing: true,
          failed: true,
          errorTitle: isAsrFailure ? '这次没听清，我们再试一次。' : '这次分析没有完成。',
          errorDetail: isAsrFailure ? '重新说一小段就好。' : '请检查网络后重试。'
        });
      });
  },
  retryRecording() {
    const runtime = store.getRuntime();
    store.transition(
      STATES.RECORDING,
      store.createNextRoundPatch(runtime.question, runtime.sessionRound)
    );
    wx.redirectTo({ url: '/pages/recording/index' });
  },
  requestExit() {
    wx.showModal({
      title: '退出这轮训练？',
      content: '这次还没有完成。',
      cancelText: '继续训练',
      confirmText: '退出',
      success: (result) => {
        if (!result.confirm) return;
        this.cancelled = true;
        store.resetToHome();
        wx.reLaunch({ url: '/pages/home/index' });
      }
    });
  },
  onUnload() {
    this.cancelled = true;
  }
});
