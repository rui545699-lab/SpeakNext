const store = require('../../utils/training-store');
const { trackEvent } = require('../../utils/analytics');

Page({
  data: { observations: [] },
  onLoad() {
    const runtime = store.getRuntime();
    const observationMap = {
      CONTENT_EXPAND: '这次更容易卡在“把感觉说具体”这一步。',
      LEXICAL_RETRIEVAL: '这次有一次在找更准确的词。',
      INFORMATION_ORDER: '几个信息同时出现时，你先确定了一个主线。',
      CONTENT_START: '范围缩小以后，你更快找到了一个切入点。'
    };
    const observations = Array.from(new Set(runtime.sessionIssues || []))
      .map((issue) => observationMap[issue])
      .filter(Boolean)
      .slice(0, 2);
    this.setData({
      observations: observations.length ? observations : ['这次还没有重复出现的卡点。']
    });
  },
  complete() {
    const runtime = store.getRuntime();
    store.completeSession(runtime.sessionRound);
    trackEvent('session_end', {
      question_id: runtime.question.id,
      issue_type: runtime.diagnosis ? runtime.diagnosis.primaryIssue : 'UNCERTAIN',
      intervention_type: runtime.diagnosis ? runtime.diagnosis.interventionType : 'OBSERVE_AGAIN',
      speech_duration: runtime.speechDuration,
      session_round: runtime.sessionRound
    });
    store.resetToHome();
    wx.reLaunch({ url: '/pages/home/index' });
  }
});
