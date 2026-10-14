const { trackEvent } = require('./utils/analytics');
const { CLOUDBASE_ENV_ID } = require('./config/cloud');

App({
  onLaunch() {
    if (wx.cloud) {
      const options = { traceUser: true };
      if (CLOUDBASE_ENV_ID) options.env = CLOUDBASE_ENV_ID;
      wx.cloud.init(options);
    } else {
      console.warn('[SpeakNext] 当前微信基础库不支持云开发');
    }
    trackEvent('app_open');
  },
  globalData: {
    productName: 'SpeakNext'
  }
});
