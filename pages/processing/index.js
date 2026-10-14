const { STATES } = require('../../utils/constants');
const store = require('../../utils/training-store');
const { analyzeRecording } = require('../../utils/diagnosis-service');
const { isDevelopment } = require('../../utils/environment');
const { getSafeErrorDetails } = require('../../utils/safe-error-details');

Page({
  data: {
    stage: 'UPLOADING',
    failed: false,
    asrComplete: false,
    development: false,
    errorTitle: '',
    errorDetail: ''
  },
  onLoad() {
    this.setData({ development: isDevelopment() });
    this.beginProcessing();
  },
  beginProcessing() {
    this.cancelled = false;
    const runtime = store.getRuntime();
    this.setData({ stage: 'UPLOADING', failed: false, asrComplete: false, errorTitle: '', errorDetail: '' });
    analyzeRecording(runtime, (stage) => this.setData({ stage }))
      .then((result) => {
        if (this.cancelled) return;
        console.log('[PROCESSING] diagnosis received', {
          ok: result && result.ok,
          stage: result && result.stage,
          hasDiagnosis: Boolean(result && result.diagnosis),
          primaryIssue: result && result.diagnosis ? result.diagnosis.primaryIssue : '',
          interventionType: result && result.diagnosis ? result.diagnosis.interventionType : '',
          transcriptLength: result && typeof result.transcript === 'string' ? result.transcript.length : 0,
          wordListLength: result && Array.isArray(result.wordList) ? result.wordList.length : 0
        });
        if (result && result.ok === true && result.stage === 'DIAGNOSIS') {
          console.log('[PROCESSING] before setAsrResult');
          store.setAsrResult(result);
          console.log('[PROCESSING] after setAsrResult');
          console.log('[PROCESSING] before setAnalysisResult');
          store.setAnalysisResult(result);
          console.log('[PROCESSING] after setAnalysisResult');
          console.log('[PROCESSING] before transition to insight');
          const insightRuntime = store.transition(STATES.INSIGHT);
          console.log('[PROCESSING] after transition to insight', {
            state: insightRuntime.state,
            primaryIssue: insightRuntime.diagnosis ? insightRuntime.diagnosis.primaryIssue : ''
          });
          console.log('[PROCESSING] navigating to insight', {
            url: '/pages/insight/index'
          });
          wx.navigateTo({
            url: '/pages/insight/index',
            success: (navigationResult) => {
              console.log('[PROCESSING] navigateTo success', {
                errMsg: navigationResult && navigationResult.errMsg || ''
              });
            },
            fail: (error) => {
              console.error('[PROCESSING] navigateTo fail', getSafeErrorDetails(error));
              this.showFailure('NAVIGATION_FAILED');
            },
            complete: (navigationResult) => {
              console.log('[PROCESSING] navigateTo complete', {
                errMsg: navigationResult && navigationResult.errMsg || ''
              });
            }
          });
          return;
        }
        if (result && result.ok === true && result.stage === 'ASR') {
          store.setAsrResult(result);
          if (isDevelopment()) {
            console.log('[SpeakNext ASR transcript]', result.transcript);
            console.log('[SpeakNext ASR WordList length]', (result.wordList || []).length);
            console.log('[SpeakNext ASR audio duration]', result.audioDuration);
          }
          this.setData({ asrComplete: true, stage: 'ASR' });
          return;
        }
        const failureStage = result && result.stage === 'ASR'
          ? (result.errorType === 'EMPTY_TRANSCRIPT' ? 'ASR_EMPTY_TRANSCRIPT' : 'ASR_FAILED')
          : 'CLOUD_FUNCTION_FAILED';
        if (isDevelopment()) {
          console.error('[PIPELINE] failed', {
            stage: failureStage,
            errorType: result && result.errorType || '',
            providerCode: result && result.providerCode || '',
            providerMessage: result && result.providerMessage || ''
          });
        }
        this.showFailure(failureStage);
      })
      .catch((error) => {
        if (this.cancelled) return;
        const failureStage = error && error.stage ? error.stage : 'CLOUD_FUNCTION_FAILED';
        console.error('[PIPELINE] failed', Object.assign(
          { stage: failureStage },
          getSafeErrorDetails(error)
        ));
        this.showFailure(failureStage);
      });
  },
  showFailure(status) {
    const isAsrFailure = status === 'ASR_FAILED' || status === 'ASR_EMPTY_TRANSCRIPT';
    this.setData({
      failed: true,
      errorTitle: isAsrFailure ? '这次没听清，我们再试一次。' : '这次分析没有完成。',
      errorDetail: isAsrFailure ? '重新说一小段就好。' : '请检查云环境配置或网络后重试。'
    });
  },
  retryRecording() {
    const runtime = store.getRuntime();
    store.transition(STATES.RECORDING, store.createNextRoundPatch(runtime.question, runtime.sessionRound));
    wx.redirectTo({ url: '/pages/recording/index' });
  },
  finishAsrTest() {
    store.resetToHome();
    wx.reLaunch({ url: '/pages/home/index' });
  },
  requestExit() {
    wx.showModal({
      title: '退出这轮训练？',
      content: '这次还没有完成。',
      cancelText: '继续训练',
      confirmText: '退出',
      success: (result) => {
        if (result.confirm) {
          this.cancelled = true;
          store.resetToHome();
          wx.reLaunch({ url: '/pages/home/index' });
        }
      }
    });
  },
  onUnload() {
    this.cancelled = true;
  }
});
