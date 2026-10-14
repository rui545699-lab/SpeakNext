const { getSafeErrorDetails } = require('./safe-error-details');

function createPipelineError(stage, message, errMsg) {
  const error = new Error(message);
  error.stage = stage;
  error.errMsg = errMsg || '';
  return error;
}

function uploadRecording(runtime) {
  const tempFilePath = runtime.audioTempFilePath;
  if (!tempFilePath || runtime.audioDurationMs <= 500 || runtime.audioFileSize <= 0) {
    return Promise.reject(createPipelineError('EMPTY_AUDIO', '录音文件无效'));
  }

  const cloudPath = `speech/${runtime.sessionId}/${runtime.roundId}.mp3`;
  console.log('[UPLOAD] start', { tempFilePath });
  return wx.cloud.uploadFile({
    cloudPath,
    filePath: tempFilePath
  }).then((result) => {
    console.log('[UPLOAD] success', { fileID: result.fileID });
    return result.fileID;
  }).catch((error) => {
    const errMsg = error && error.errMsg ? error.errMsg : '';
    console.error('[UPLOAD] failed', Object.assign(
      { stage: 'UPLOAD_FAILED' },
      getSafeErrorDetails(error)
    ));
    throw createPipelineError('UPLOAD_FAILED', '录音上传失败', errMsg);
  });
}

function callAsrFunction(fileID) {
  console.log('[ASR] analyzeSpeech start', {
    fileID,
    voiceFormat: 'mp3'
  });
  return wx.cloud.callFunction({
    name: 'analyzeSpeech',
    data: {
      mode: 'asr_test',
      fileID,
      voiceFormat: 'mp3'
    }
  }).then((response) => {
    const result = response.result || {};
    console.log('[ASR] response', {
      ok: result.ok,
      stage: result.stage,
      transcript: result.transcript || '',
      wordListLength: Array.isArray(result.wordList) ? result.wordList.length : 0,
      errorType: result.errorType || '',
      providerCode: result.providerCode || '',
      providerMessage: result.providerMessage || ''
    });
    return Object.assign({}, result, { audioFileId: fileID });
  }).catch((error) => {
    const errMsg = error && error.errMsg ? error.errMsg : String(error && error.message || '');
    console.error('[ASR] analyzeSpeech failed', Object.assign(
      { stage: 'CLOUD_FUNCTION_FAILED' },
      getSafeErrorDetails(error)
    ));
    throw createPipelineError('CLOUD_FUNCTION_FAILED', '云函数调用失败', errMsg);
  });
}

function adaptDiagnosis(diagnosis, transcript) {
  const source = diagnosis && typeof diagnosis === 'object' ? diagnosis : {};
  const needsIntervention = source.needs_intervention !== false;
  const evidence = (needsIntervention && Array.isArray(source.evidence) ? source.evidence : [])
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .map((item) => ({
      text: item.text.trim(),
      type: typeof item.type === 'string' ? item.type : 'other',
      context: typeof item.context === 'string' ? item.context.trim() : ''
    }));
  const confidence = Number(source.confidence);
  const adapted = {
    questionApplicable: source.question_applicable !== false,
    needsIntervention,
    primaryIssue: needsIntervention ? (source.primary_issue || '') : null,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    evidence,
    evidenceText: '',
    evidenceContext: '',
    missingRequiredSlots: Array.isArray(source.missing_required_slots)
      ? source.missing_required_slots.slice()
      : [],
    questionFactor: source.question_factor || 'OTHER',
    interventionType: needsIntervention ? (source.recommended_intervention || '') : null
  };
  const { getEvidenceText, createEvidenceContext } = require('./diagnosis-copy');
  adapted.evidenceText = getEvidenceText(adapted, transcript || '');
  const selectedEvidence = adapted.evidence.find((item) => item.text === adapted.evidenceText);
  adapted.evidenceContext = adapted.primaryIssue === 'LEXICAL_RETRIEVAL'
    ? ((selectedEvidence && selectedEvidence.context)
      || createEvidenceContext(transcript || '', adapted.evidenceText))
    : adapted.evidenceText;
  return adapted;
}

function callDiagnosisFunction(fileID, runtime) {
  const question = runtime.question || {};
  console.log('[DIAGNOSIS] analyzeSpeech start', {
    fileID,
    questionId: question.id || '',
    voiceFormat: 'mp3'
  });
  return wx.cloud.callFunction({
    name: 'analyzeSpeech',
    data: {
      mode: 'diagnosis',
      fileID,
      voiceFormat: 'mp3',
      question_id: question.id,
      question_text: question.text,
      question_category: question.category,
      question_openness: question.openness,
      question_task_type: question.taskType || '',
      question_required_slots: Array.isArray(question.requiredSlots) ? question.requiredSlots : [],
      session_id: runtime.sessionId,
      round_id: runtime.roundId,
      client_audio_duration: runtime.audioDurationMs,
      audio_retention_consent: false
    }
  }).then((response) => {
    const result = response.result || {};
    console.log('[DIAGNOSIS FRONTEND] raw cloud result', {
      ok: result.ok,
      stage: result.stage,
      transcriptLength: typeof result.transcript === 'string' ? result.transcript.length : 0,
      wordListLength: Array.isArray(result.wordList) ? result.wordList.length : 0,
      audioDuration: result.audioDuration,
      signals: result.signals || null,
      diagnosis: result.diagnosis || null,
      modelVersion: result.modelVersion || '',
      errorType: result.errorType || '',
      providerCode: result.providerCode || ''
    });
    const adapted = Object.assign({}, result, {
      audioFileId: fileID,
      diagnosis: result.diagnosis ? adaptDiagnosis(result.diagnosis, result.transcript) : null
    });
    console.log('[DIAGNOSIS FRONTEND] adapted result', {
      ok: adapted.ok,
      stage: adapted.stage,
      transcriptLength: adapted.transcript ? adapted.transcript.length : 0,
      wordListLength: Array.isArray(adapted.wordList) ? adapted.wordList.length : 0,
      primaryIssue: adapted.diagnosis ? adapted.diagnosis.primaryIssue : '',
      interventionType: adapted.diagnosis ? adapted.diagnosis.interventionType : '',
      needsIntervention: adapted.diagnosis ? adapted.diagnosis.needsIntervention : null,
      modelVersion: adapted.modelVersion || '',
      errorType: adapted.errorType || '',
      providerCode: adapted.providerCode || ''
    });
    return adapted;
  }).catch((error) => {
    const errMsg = error && error.errMsg ? error.errMsg : String(error && error.message || '');
    console.error('[DIAGNOSIS] analyzeSpeech failed', Object.assign(
      { stage: 'CLOUD_FUNCTION_FAILED' },
      getSafeErrorDetails(error)
    ));
    throw createPipelineError('CLOUD_FUNCTION_FAILED', '云函数调用失败', errMsg);
  });
}

function callInterventionCheck(input) {
  const source = input || {};
  console.log('[INTERVENTION CHECK] start', {
    interventionType: source.interventionType || '',
    beforeLength: String(source.beforeTranscript || '').length,
    afterLength: String(source.afterTranscript || '').length,
    hasAnchor: Boolean(source.anchor),
    phase: source.phase || 'COMPLETE_INTERVENTION',
    targetSlot: source.targetSlot || ''
  });
  return wx.cloud.callFunction({
    name: 'analyzeSpeech',
    data: {
      mode: 'intervention_check',
      intervention_type: source.interventionType,
      before_transcript: source.beforeTranscript,
      after_transcript: source.afterTranscript,
      anchor: source.anchor || '',
      phase: source.phase || 'COMPLETE_INTERVENTION',
      original_question: source.originalQuestion || '',
      question_task_type: source.questionTaskType || '',
      question_required_slots: Array.isArray(source.questionRequiredSlots)
        ? source.questionRequiredSlots
        : [],
      slot_state: source.slotState || {},
      target_slot: source.targetSlot || '',
      current_prompt: source.currentPrompt || ''
    }
  }).then((response) => {
    const result = response.result || {};
    console.log('[INTERVENTION CHECK] response', {
      ok: result.ok,
      stage: result.stage,
      result: result.result || '',
      interventionPass: result.intervention_pass === true,
      originalTaskComplete: result.original_task_complete === true,
      missingRequiredSlots: Array.isArray(result.missing_required_slots)
        ? result.missing_required_slots
        : [],
      targetSlot: source.targetSlot || '',
      reason: result.reason || '',
      modelVersion: result.modelVersion || '',
      errorType: result.errorType || ''
    });
    return result;
  }).catch((error) => {
    const errMsg = error && error.errMsg ? error.errMsg : String(error && error.message || '');
    console.error('[INTERVENTION CHECK] call failed', getSafeErrorDetails(error));
    throw createPipelineError('INTERVENTION_CHECK_FAILED', '微训练验证失败', errMsg);
  });
}

function analyzeRecording(runtime, onStage) {
  if (!wx.cloud) {
    return Promise.reject(createPipelineError(
      'CLOUD_FUNCTION_FAILED',
      '当前基础库不支持云开发'
    ));
  }
  if (onStage) onStage('UPLOADING');
  return uploadRecording(runtime).then((fileID) => {
    if (onStage) onStage('ANALYZING');
    return callDiagnosisFunction(fileID, runtime);
  });
}

module.exports = {
  analyzeRecording,
  uploadRecording,
  callAsrFunction,
  callDiagnosisFunction,
  callInterventionCheck,
  adaptDiagnosis
};
