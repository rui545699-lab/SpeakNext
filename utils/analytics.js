function trackEvent(eventName, params = {}) {
  const payload = Object.assign({
    eventName,
    timestamp: Date.now()
  }, params);
  console.log('[SpeakNext event]', payload);
}

module.exports = { trackEvent };
