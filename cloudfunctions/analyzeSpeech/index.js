const cloud = require('wx-server-sdk');
const { recognizeSpeech } = require('./lib/asr');
const { getSafeAsrError } = require('./lib/asr-error');
const { analyzeSignals } = require('./lib/signal-analyzer');
const {
  validateEvent,
  validateInterventionCheckEvent,
  validateRetellingEvaluationEvent,
  validateRetellingProgressEvent
} = require('./lib/validation');
const { evaluateInterventionCheck } = require('./lib/intervention-checker');
const { evaluateRetellingDualV057 } = require('./lib/retelling-dual-evaluator');
const { resolveRetellingProgress } = require('./lib/retelling-progress-resolver');
const {
  buildFirstRoundDebugSummary,
  buildSecondRoundDebugSummary
} = require('./lib/eval-debug-summary');
const {
  evaluateDiagnosis,
  healthcheckDeepSeek,
  getSafeHealthcheckDetails,
  getDeepSeekHealthcheckConfig
} = require('./lib/deepseek-evaluator');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

function getHealthcheckRuntime() {
  return {
    nodeVersion: process.version,
    requestClient: 'node:https'
  };
}

async function runDeepSeekHealthcheck() {
  const config = getDeepSeekHealthcheckConfig();
  if (!config.complete) {
    return {
      ok: false,
      stage: 'CONFIG_CHECK',
      config: config.publicConfig,
      runtime: getHealthcheckRuntime()
    };
  }

  try {
    const result = await healthcheckDeepSeek();
    return {
      ok: true,
      stage: 'DEEPSEEK_REQUEST',
      provider: 'deepseek',
      model: result.model,
      apiKeyConfigured: true,
      llmResponse: result.response,
      runtime: getHealthcheckRuntime()
    };
  } catch (error) {
    const details = getSafeHealthcheckDetails(error);
    console.error('DeepSeek healthcheck failed', {
      status: details.httpStatus,
      errorCode: details.providerCode,
      providerMessage: details.providerMessage
    });
    return {
      ok: false,
      stage: 'DEEPSEEK_REQUEST',
      httpStatus: details.httpStatus,
      errorType: details.errorType,
      providerCode: details.providerCode,
      providerMessage: details.providerMessage,
      runtime: getHealthcheckRuntime()
    };
  }
}

async function deleteAudioUnlessConsented(fileID, consent) {
  if (consent) return false;
  try {
    await cloud.deleteFile({ fileList: [fileID] });
    return true;
  } catch (error) {
    console.error('[SpeakNext] audio cleanup failed', error.message);
    return false;
  }
}

async function runAsrTest(event) {
  const fileID = typeof event.fileID === 'string' ? event.fileID.trim() : '';
  const voiceFormat = typeof event.voiceFormat === 'string'
    ? event.voiceFormat.trim().toLowerCase()
    : 'mp3';
  const supportedFormats = ['mp3', 'wav', 'm4a', 'aac', 'pcm', 'ogg-opus', 'speex'];

  if (!fileID || !supportedFormats.includes(voiceFormat)) {
    return {
      ok: false,
      stage: 'ASR',
      errorType: 'REQUEST_ERROR',
      providerCode: 'INVALID_ASR_TEST_INPUT',
      providerMessage: 'fileID 或 voiceFormat 无效。'
    };
  }

  try {
    const downloaded = await cloud.downloadFile({ fileID });
    const audioBuffer = Buffer.isBuffer(downloaded.fileContent)
      ? downloaded.fileContent
      : Buffer.from(downloaded.fileContent || []);
    console.log('[ASR SERVER] audio', {
      byteLength: audioBuffer.length,
      voiceFormat
    });
    if (!audioBuffer.length) {
      const audioError = new Error('EMPTY_AUDIO');
      audioError.code = 'EMPTY_AUDIO';
      throw audioError;
    }
    const result = await recognizeSpeech(audioBuffer, voiceFormat);
    if (!result.transcript) {
      const emptyError = new Error('ASR_EMPTY_TRANSCRIPT');
      emptyError.code = 'ASR_EMPTY_TRANSCRIPT';
      throw emptyError;
    }
    console.log('[ASR SERVER] success', {
      transcriptLength: result.transcript.length,
      wordListLength: result.wordList.length
    });
    await deleteAudioUnlessConsented(fileID, false);
    return {
      ok: true,
      stage: 'ASR',
      transcript: result.transcript,
      wordList: result.wordList,
      audioDuration: result.audioDuration,
      requestId: result.requestId
    };
  } catch (error) {
    const safeError = getSafeAsrError(error);
    console.error('[ASR SERVER] failed', {
      code: safeError.providerCode,
      message: safeError.providerMessage
    });
    await deleteAudioUnlessConsented(fileID, false);
    return {
      ok: false,
      stage: 'ASR',
      errorType: safeError.errorType,
      providerCode: safeError.providerCode,
      providerMessage: safeError.providerMessage
    };
  }
}

async function runDiagnosis(event) {
  let input;
  try {
    input = validateEvent(event);
  } catch (error) {
    return {
      ok: false,
      stage: 'REQUEST_VALIDATION',
      errorType: 'REQUEST_ERROR',
      providerCode: error && error.message ? error.message : 'INVALID_DIAGNOSIS_INPUT',
      providerMessage: '诊断请求参数无效。'
    };
  }

  const voiceFormat = typeof event.voiceFormat === 'string'
    ? event.voiceFormat.trim().toLowerCase()
    : 'mp3';
  const supportedFormats = ['mp3', 'wav', 'm4a', 'aac', 'pcm', 'ogg-opus', 'speex'];
  if (!supportedFormats.includes(voiceFormat)) {
    return {
      ok: false,
      stage: 'REQUEST_VALIDATION',
      errorType: 'REQUEST_ERROR',
      providerCode: 'INVALID_VOICE_FORMAT',
      providerMessage: 'voiceFormat 无效。'
    };
  }

  let stage = 'ASR';
  try {
    const downloaded = await cloud.downloadFile({ fileID: input.fileID });
    const audioBuffer = Buffer.isBuffer(downloaded.fileContent)
      ? downloaded.fileContent
      : Buffer.from(downloaded.fileContent || []);
    console.log('[DIAGNOSIS SERVER] audio', {
      byteLength: audioBuffer.length,
      voiceFormat
    });
    if (!audioBuffer.length) {
      const audioError = new Error('EMPTY_AUDIO');
      audioError.code = 'EMPTY_AUDIO';
      throw audioError;
    }

    const asrResult = await recognizeSpeech(audioBuffer, voiceFormat);
    if (!asrResult.transcript) {
      const emptyError = new Error('ASR_EMPTY_TRANSCRIPT');
      emptyError.code = 'ASR_EMPTY_TRANSCRIPT';
      throw emptyError;
    }

    stage = 'SIGNAL_ANALYZER';
    const signals = analyzeSignals({
      transcript: asrResult.transcript,
      audioDuration: asrResult.audioDuration,
      wordList: asrResult.wordList
    });

    stage = 'EVALUATOR';
    const evaluatorInput = {
      question_id: input.questionId,
      question_text: input.questionText,
      question_category: input.questionCategory,
      question_openness: input.questionOpenness,
      question_task_type: input.questionTaskType,
      question_required_slots: input.questionRequiredSlots,
      transcript: asrResult.transcript,
      signals
    };
    const evaluation = await evaluateDiagnosis(evaluatorInput);
    console.log('[DIAGNOSIS SERVER] success', {
      transcriptLength: asrResult.transcript.length,
      wordListLength: asrResult.wordList.length,
      primaryIssue: evaluation.diagnosis.primary_issue,
      modelVersion: evaluation.modelVersion
    });

    return {
      ok: true,
      stage: 'DIAGNOSIS',
      transcript: asrResult.transcript,
      wordList: asrResult.wordList,
      audioDuration: asrResult.audioDuration,
      signals,
      diagnosis: evaluation.diagnosis,
      modelVersion: evaluation.modelVersion
    };
  } catch (error) {
    if (stage === 'ASR') {
      const safeError = getSafeAsrError(error);
      console.error('[DIAGNOSIS SERVER] ASR failed', {
        code: safeError.providerCode,
        message: safeError.providerMessage
      });
      return {
        ok: false,
        stage: 'ASR',
        errorType: safeError.errorType,
        providerCode: safeError.providerCode,
        providerMessage: safeError.providerMessage
      };
    }

    const details = getSafeHealthcheckDetails(error);
    console.error('[DIAGNOSIS SERVER] failed', {
      stage,
      status: details.httpStatus,
      errorCode: details.providerCode,
      providerMessage: details.providerMessage
    });
    return {
      ok: false,
      stage,
      httpStatus: details.httpStatus,
      errorType: details.errorType,
      providerCode: details.providerCode,
      providerMessage: details.providerMessage
    };
  } finally {
    await deleteAudioUnlessConsented(input.fileID, input.audioRetentionConsent);
  }
}

async function runInterventionCheck(event) {
  let input;
  try {
    input = validateInterventionCheckEvent(event);
  } catch (error) {
    return {
      ok: false,
      stage: 'INTERVENTION_CHECK',
      errorType: 'REQUEST_ERROR',
      providerCode: error && error.message ? error.message : 'INVALID_INTERVENTION_CHECK_INPUT',
      providerMessage: '微训练验证请求参数无效。'
    };
  }

  try {
    const checked = await evaluateInterventionCheck(input);
    return {
      ok: true,
      stage: 'INTERVENTION_CHECK',
      result: checked.result,
      intervention_pass: checked.interventionPass,
      original_task_complete: checked.originalTaskComplete,
      missing_required_slots: checked.missingRequiredSlots,
      slot_state: checked.slotState,
      slot_evidence: checked.slotEvidence,
      reason: checked.reason,
      modelVersion: checked.modelVersion,
      requestId: checked.requestId
    };
  } catch (error) {
    const details = getSafeHealthcheckDetails(error);
    return {
      ok: false,
      stage: 'INTERVENTION_CHECK',
      errorType: details.errorType,
      providerCode: details.providerCode,
      providerMessage: details.providerMessage
    };
  }
}

function composeRetellingRoundResult(transcript, observation) {
  return {
    transcript,
    taskResult: observation.taskResult,
    processResult: observation.processResult,
    routedResult: observation.routedResult
  };
}

async function runRetellingEvaluation(event, evaluator = evaluateRetellingDualV057) {
  let input;
  try {
    input = validateRetellingEvaluationEvent(event);
  } catch (error) {
    return {
      ok: false,
      stage: 'RETELLING_EVALUATION',
      errorType: 'REQUEST_ERROR',
      providerCode: error && error.message ? error.message : 'INVALID_RETELLING_INPUT',
      providerMessage: '复述评估请求参数无效。'
    };
  }
  try {
    const result = await evaluator(input);
    const firstRoundResult = composeRetellingRoundResult(input.transcript, result);
    console.log('[SPEAKNEXT_EVAL]', JSON.stringify(buildFirstRoundDebugSummary({
      material: input.material,
      transcript: input.transcript,
      evaluation: result
    })));
    return {
      ok: true,
      stage: 'RETELLING_EVALUATION',
      transcript: input.transcript,
      taskResult: result.taskResult,
      processResult: result.processResult,
      routedResult: result.routedResult,
      firstRoundResult,
      modelVersion: result.modelVersion,
      requestId: result.requestId
    };
  } catch (error) {
    const details = getSafeHealthcheckDetails(error);
    return {
      ok: false,
      stage: 'RETELLING_EVALUATION',
      errorType: details.errorType,
      providerCode: details.providerCode,
      providerMessage: details.providerMessage
    };
  }
}

async function runRetellingProgress(
  event,
  evaluator = evaluateRetellingDualV057,
  resolver = resolveRetellingProgress
) {
  let input;
  try {
    input = validateRetellingProgressEvent(event);
  } catch (error) {
    return {
      ok: false,
      stage: 'PROGRESS_EVALUATION',
      errorType: 'REQUEST_ERROR',
      providerCode: error && error.message ? error.message : 'INVALID_RETELLING_PROGRESS_INPUT',
      providerMessage: '复述进步评估请求参数无效。'
    };
  }
  try {
    const observation = await evaluator({
      material: input.material,
      transcript: input.secondTranscript,
      retryContext: {
        trainingNeed: input.originalTrainingNeed,
        retryScope: input.originalRetryScope,
        relatedKeyPointIds: input.originalExpressionTarget
          && Array.isArray(input.originalExpressionTarget.relatedKeyPointIds)
          ? input.originalExpressionTarget.relatedKeyPointIds
          : [],
        targetUserEvidence: input.originalExpressionTarget
          && input.originalExpressionTarget.userEvidence
          ? input.originalExpressionTarget.userEvidence.text
          : '',
        targetMaterialEvidence: input.originalExpressionTarget
          && input.originalExpressionTarget.materialEvidence
          ? input.originalExpressionTarget.materialEvidence.text
          : ''
      }
    });
    const secondRoundResult = composeRetellingRoundResult(input.secondTranscript, observation);
    const progressResult = resolver({
      originalTrainingNeed: input.originalTrainingNeed,
      originalRetryScope: input.originalRetryScope,
      originalConceptTarget: input.originalConceptTarget,
      originalExpressionTarget: input.originalExpressionTarget,
      firstRoundResult: input.firstRoundResult,
      secondRoundResult
    });
    console.log('[SPEAKNEXT_EVAL]', JSON.stringify(buildSecondRoundDebugSummary({
      material: input.material,
      transcript: input.secondTranscript,
      evaluation: observation,
      progressResult
    })));
    return {
      ok: true,
      stage: 'PROGRESS_EVALUATION',
      secondRoundResult,
      progressResult,
      modelVersion: observation.modelVersion,
      requestId: observation.requestId
    };
  } catch (error) {
    const details = getSafeHealthcheckDetails(error);
    return {
      ok: false,
      stage: 'PROGRESS_EVALUATION',
      errorType: details.errorType,
      providerCode: details.providerCode,
      providerMessage: details.providerMessage
    };
  }
}

exports.main = async (event) => {
  if (event && event.mode === 'healthcheck') {
    return runDeepSeekHealthcheck();
  }
  if (event && event.mode === 'asr_test') {
    return runAsrTest(event);
  }
  if (event && event.mode === 'diagnosis') {
    return runDiagnosis(event);
  }
  if (event && event.mode === 'intervention_check') {
    return runInterventionCheck(event);
  }
  if (event && event.mode === 'retelling_evaluation') {
    return runRetellingEvaluation(event);
  }
  if (event && event.mode === 'retelling_progress') {
    return runRetellingProgress(event);
  }
  return {
    ok: false,
    stage: 'MODE_CHECK',
    errorType: 'REQUEST_ERROR',
    providerCode: 'UNSUPPORTED_MODE',
    providerMessage: '当前 mode 不受支持。'
  };
};

exports.__test = {
  composeRetellingRoundResult,
  runRetellingEvaluation,
  runRetellingProgress
};
