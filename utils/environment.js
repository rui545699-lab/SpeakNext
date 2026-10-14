function getEnvironmentVersion() {
  try {
    const account = wx.getAccountInfoSync();
    return account && account.miniProgram ? account.miniProgram.envVersion : 'develop';
  } catch (error) {
    return 'develop';
  }
}

function isDevelopment() {
  return getEnvironmentVersion() === 'develop';
}

module.exports = { getEnvironmentVersion, isDevelopment };
