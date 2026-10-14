const { STATES } = require('../../utils/constants');
const store = require('../../utils/training-store');
const { trackEvent } = require('../../utils/analytics');

Page({
  data: { issueType: '', result: {} },
  onLoad() {
    const runtime = store.getRuntime();
    this.setData({
      issueType: runtime.diagnosis.primaryIssue,
      result: runtime.interventionResult
    });
  },
  repeatSameQuestion() {
    const runtime = store.getRuntime();
    trackEvent('next_drill_click', {
      question_id: runtime.question.id,
      issue_type: runtime.diagnosis.primaryIssue,
      intervention_type: runtime.diagnosis.interventionType,
      session_round: runtime.sessionRound + 1
    });
    store.transition(
      STATES.RECORDING,
      store.createNextRoundPatch(runtime.question, runtime.sessionRound + 1)
    );
    wx.redirectTo({ url: '/pages/recording/index' });
  },
  changeQuestion() {
    const runtime = store.getRuntime();
    const question = store.pickNextQuestion(runtime.question.id);
    store.transition(
      STATES.RECORDING,
      store.createNextRoundPatch(question, runtime.sessionRound + 1)
    );
    wx.redirectTo({ url: '/pages/recording/index' });
  },
  closeResult() {
    const runtime = store.getRuntime();
    store.completeSession(runtime.sessionRound);
    trackEvent('session_end', {
      question_id: runtime.question.id,
      issue_type: runtime.diagnosis.primaryIssue,
      intervention_type: runtime.diagnosis.interventionType,
      speech_duration: runtime.speechDuration,
      session_round: runtime.sessionRound
    });
    store.resetToHome();
    wx.reLaunch({ url: '/pages/home/index' });
  }
});
