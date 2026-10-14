const store = require('../../utils/training-store');
const { STATES } = require('../../utils/constants');
const { trackEvent } = require('../../utils/analytics');

Page({
  data: {
    sessionCount: 0,
    totalRounds: 0,
    profileStage: 1
  },
  onShow() {
    store.transition(STATES.PROFILE);
    const totalRounds = store.getCompletedRoundCount();
    this.setData({
      sessionCount: totalRounds,
      totalRounds,
      profileStage: 1
    });
    trackEvent('profile_view', { session_round: 0 });
  }
});
