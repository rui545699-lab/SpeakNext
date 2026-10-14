const { uploadRecording, callAsrFunction } = require('./diagnosis-service');
const { getSafeErrorDetails } = require('./safe-error-details');

function pipelineError(stage, message) {
  const error = new Error(message);
  error.stage = stage;
  return error;
}

function materialPayload(material) {
  return {
    id: material.id,
    title: material.title,
    core_message: material.coreMessage,
    key_points: material.keyPoints.map((item) => {
      const point = { id: item.id, role: item.role, text: item.text };
      if (typeof item.displayText === 'string' && item.displayText.trim()) {
        point.display_text = item.displayText;
      }
      if (Array.isArray(item.semanticAnchors) && item.semanticAnchors.length) {
        point.semantic_anchors = item.semanticAnchors.slice();
      }
      return point;
    }),
    relations: material.relations
  };
}

function transcribeRetellingRecording(recording, sessionId, round) {
  const runtime = {
    audioTempFilePath: recording.tempFilePath || '',
    audioDurationMs: Number(recording.durationMs) || 0,
    audioFileSize: Number(recording.fileSize) || 0,
    sessionId,
    roundId: `retelling-${round}-${Date.now()}`
  };
  return uploadRecording(runtime)
    .then((fileID) => callAsrFunction(fileID))
    .then((result) => {
      if (!result.ok || !String(result.transcript || '').trim()) {
        throw pipelineError(result.stage || 'ASR', '这次没有识别出有效内容。');
      }
      return result;
    });
}

function callRetellingEvaluation(material, transcript) {
  return wx.cloud.callFunction({
    name: 'analyzeSpeech',
    data: {
      mode: 'retelling_evaluation',
      material: materialPayload(material),
      transcript
    }
  }).then((response) => {
    const result = response.result || {};
    if (!result.ok || !result.firstRoundResult
      || !result.firstRoundResult.taskResult
      || !result.firstRoundResult.processResult
      || !result.firstRoundResult.routedResult) {
      throw pipelineError(result.stage || 'RETELLING_EVALUATION', '复述评估没有完成。');
    }
    return result;
  }).catch((error) => {
    console.error('[RETELLING] evaluation failed', getSafeErrorDetails(error));
    throw error;
  });
}

function callRetellingProgress(
  material,
  firstRoundResult,
  originalTrainingNeed,
  secondTranscript,
  originalRetryScope,
  originalConceptTarget,
  originalExpressionTarget
) {
  return wx.cloud.callFunction({
    name: 'analyzeSpeech',
    data: {
      mode: 'retelling_progress',
      material: materialPayload(material),
      first_round_result: firstRoundResult,
      original_training_need: originalTrainingNeed,
      original_retry_scope: originalRetryScope,
      original_concept_target: originalConceptTarget || null,
      original_expression_target: originalExpressionTarget || null,
      second_transcript: secondTranscript
    }
  }).then((response) => {
    const result = response.result || {};
    if (!result.ok || !result.secondRoundResult || !result.progressResult) {
      throw pipelineError(result.stage || 'PROGRESS_EVALUATION', '进步评估没有完成。');
    }
    return result;
  }).catch((error) => {
    console.error('[RETELLING] progress evaluation failed', getSafeErrorDetails(error));
    throw error;
  });
}

module.exports = {
  materialPayload,
  transcribeRetellingRecording,
  callRetellingEvaluation,
  callRetellingProgress
};
