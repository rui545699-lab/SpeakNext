const crypto = require('crypto');

const TRAINING_MODE = 'INFORMATION_RECONSTRUCTION';
const EVENT_NAMES = new Set([
  'RETELLING_SESSION_STARTED',
  'RETELLING_READING_COMPLETED',
  'RETELLING_FIRST_RECORDING_COMPLETED',
  'RETELLING_FIRST_EVALUATION_COMPLETED',
  'RETELLING_INTERVENTION_SHOWN',
  'RETELLING_SECOND_RECORDING_COMPLETED',
  'RETELLING_PROGRESS_COMPLETED',
  'RETELLING_RETRY_STARTED',
  'RETELLING_ROUND_COMPLETED'
]);
const FORBIDDEN_FIELDS = new Set([
  'transcript', 'audio', 'audiopath', 'audio_path', 'base64', 'wordlist', 'word_list',
  'prompt', 'rawresponse', 'raw_response', 'nickname', 'phone', 'phonenumber', 'openid'
]);
const PRIMARY_NEEDS = new Set([
  'PASS', 'MISSING_CAUSAL_STEP', 'INCORRECT_RELATION', 'LEXICAL_RETRIEVAL',
  'INFORMATION_ORDER', 'UNCERTAIN', 'WORDING_PRECISION', 'FORMULATION_BREAKDOWN',
  'CONCEPT_INACCURACY'
]);

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function validateEvent(event) {
  const input = event && typeof event === 'object' ? event : {};
  const forbidden = Object.keys(input).find((key) => FORBIDDEN_FIELDS.has(key.toLowerCase()));
  if (forbidden) throw new Error(`FORBIDDEN_FIELD:${forbidden}`);
  if (!isNonEmptyString(input.eventId, 180)) throw new Error('INVALID_EVENT_ID');
  if (input.eventVersion !== 1) throw new Error('INVALID_EVENT_VERSION');
  if (!isNonEmptyString(input.anonymousUserId, 128)) throw new Error('INVALID_ANONYMOUS_USER_ID');
  if (!isNonEmptyString(input.sessionId, 128)) throw new Error('INVALID_SESSION_ID');
  if (!/^retelling_\d{3}$/.test(input.materialId || '')) throw new Error('INVALID_MATERIAL_ID');
  if (input.trainingMode !== TRAINING_MODE) throw new Error('INVALID_TRAINING_MODE');
  if (!EVENT_NAMES.has(input.eventName)) throw new Error('INVALID_EVENT_NAME');
  if (input.stage !== null && !isNonEmptyString(input.stage, 64)) throw new Error('INVALID_STAGE');
  if (input.recordingRound !== null && input.recordingRound !== 1 && input.recordingRound !== 2) {
    throw new Error('INVALID_RECORDING_ROUND');
  }
  if (input.primaryTrainingNeed !== null && !PRIMARY_NEEDS.has(input.primaryTrainingNeed)) {
    throw new Error('INVALID_PRIMARY_TRAINING_NEED');
  }
  if (input.resolved !== null && typeof input.resolved !== 'boolean') throw new Error('INVALID_RESOLVED');
  if (!Number.isFinite(input.timestamp) || input.timestamp <= 0) throw new Error('INVALID_TIMESTAMP');
  return {
    eventId: input.eventId,
    eventVersion: 1,
    anonymousUserId: input.anonymousUserId,
    sessionId: input.sessionId,
    materialId: input.materialId,
    trainingMode: TRAINING_MODE,
    eventName: input.eventName,
    stage: input.stage,
    recordingRound: input.recordingRound,
    primaryTrainingNeed: input.primaryTrainingNeed,
    resolved: input.resolved,
    timestamp: input.timestamp
  };
}

function getDocumentId(eventId) {
  return crypto.createHash('sha256').update(eventId).digest('hex');
}

module.exports = {
  EVENT_NAMES,
  validateEvent,
  getDocumentId
};
