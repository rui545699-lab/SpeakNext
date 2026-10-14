const cloud = require('wx-server-sdk');
const { validateEvent, getDocumentId } = require('./validation');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const COLLECTION = 'retelling_events';
exports.main = async (event) => {
  try {
    const payload = validateEvent(event);
    const documentId = getDocumentId(payload.eventId);
    await db.collection(COLLECTION).doc(documentId).set({
      data: Object.assign({}, payload, { serverTimestamp: db.serverDate() })
    });
    return { ok: true, eventId: payload.eventId };
  } catch (error) {
    console.warn('[RETELLING EVENT] rejected', {
      name: error && error.name,
      message: error && error.message
    });
    return { ok: false, errorType: 'INVALID_EVENT' };
  }
};

exports.COLLECTION = COLLECTION;
