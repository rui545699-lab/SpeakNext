const { getSafeErrorDetails } = require('./safe-error-details');

const ANONYMOUS_USER_ID_KEY = 'speaknext_anonymous_user_id';
const TRAINING_MODE = 'INFORMATION_RECONSTRUCTION';
const EVENT_VERSION = 1;
const CLOUD_FUNCTION_NAME = 'trackRetellingEvent';

const EVENT_NAMES = Object.freeze({
  SESSION_STARTED: 'RETELLING_SESSION_STARTED',
  READING_COMPLETED: 'RETELLING_READING_COMPLETED',
  FIRST_RECORDING_COMPLETED: 'RETELLING_FIRST_RECORDING_COMPLETED',
  FIRST_EVALUATION_COMPLETED: 'RETELLING_FIRST_EVALUATION_COMPLETED',
  INTERVENTION_SHOWN: 'RETELLING_INTERVENTION_SHOWN',
  SECOND_RECORDING_COMPLETED: 'RETELLING_SECOND_RECORDING_COMPLETED',
  PROGRESS_COMPLETED: 'RETELLING_PROGRESS_COMPLETED',
  RETRY_STARTED: 'RETELLING_RETRY_STARTED',
  ROUND_COMPLETED: 'RETELLING_ROUND_COMPLETED'
});

let runtimeAnonymousUserId = '';

function randomToken() {
  return Math.random().toString(36).slice(2, 12);
}

function getStorageApi(storage) {
  return storage || (typeof wx !== 'undefined' ? wx : null);
}

function getAnonymousUserId(storage, now = Date.now, random = randomToken) {
  if (runtimeAnonymousUserId) return runtimeAnonymousUserId;
  const api = getStorageApi(storage);
  if (!api || typeof api.getStorageSync !== 'function' || typeof api.setStorageSync !== 'function') {
    runtimeAnonymousUserId = `anon_${now()}_${random()}`;
    return runtimeAnonymousUserId;
  }
  try {
    const existing = api.getStorageSync(ANONYMOUS_USER_ID_KEY);
    if (typeof existing === 'string' && existing.trim()) {
      runtimeAnonymousUserId = existing.trim();
      return runtimeAnonymousUserId;
    }
    const anonymousUserId = `anon_${now()}_${random()}`;
    api.setStorageSync(ANONYMOUS_USER_ID_KEY, anonymousUserId);
    runtimeAnonymousUserId = anonymousUserId;
    return runtimeAnonymousUserId;
  } catch (error) {
    console.warn('[RETELLING ANALYTICS] anonymous id storage unavailable', getSafeErrorDetails(error));
    runtimeAnonymousUserId = `anon_${now()}_${random()}`;
    return runtimeAnonymousUserId;
  }
}

function buildEventId(sessionId, eventName) {
  return `retelling:${String(sessionId || '')}:${String(eventName || '')}`;
}

function nullable(value) {
  return value === undefined ? null : value;
}

function buildRetellingEvent(input, options = {}) {
  const now = options.now || Date.now;
  const sessionId = String(input && input.sessionId || '').trim();
  const eventName = String(input && input.eventName || '').trim();
  return {
    eventId: buildEventId(sessionId, eventName),
    eventVersion: EVENT_VERSION,
    anonymousUserId: getAnonymousUserId(options.storage, now, options.random || randomToken),
    sessionId,
    materialId: String(input && input.materialId || '').trim(),
    trainingMode: TRAINING_MODE,
    eventName,
    stage: nullable(input && input.stage),
    recordingRound: nullable(input && input.recordingRound),
    primaryTrainingNeed: nullable(input && input.primaryTrainingNeed),
    resolved: nullable(input && input.resolved),
    timestamp: now()
  };
}

function trackRetellingEvent(input, options = {}) {
  const cloud = options.cloud || (typeof wx !== 'undefined' && wx.cloud);
  let event;
  try {
    event = buildRetellingEvent(input, options);
    if (!cloud || typeof cloud.callFunction !== 'function') {
      throw new Error('wx.cloud.callFunction unavailable');
    }
  } catch (error) {
    console.warn('[RETELLING ANALYTICS] event skipped', getSafeErrorDetails(error));
    return Promise.resolve({ ok: false });
  }
  return Promise.resolve(cloud.callFunction({
    name: CLOUD_FUNCTION_NAME,
    data: event
  })).then(() => ({ ok: true, eventId: event.eventId }))
    .catch((error) => {
      console.warn('[RETELLING ANALYTICS] track failed', Object.assign(
        { eventName: event.eventName },
        getSafeErrorDetails(error)
      ));
      return { ok: false, eventId: event.eventId };
    });
}

module.exports = {
  ANONYMOUS_USER_ID_KEY,
  TRAINING_MODE,
  EVENT_VERSION,
  EVENT_NAMES,
  buildEventId,
  getAnonymousUserId,
  buildRetellingEvent,
  trackRetellingEvent
};
