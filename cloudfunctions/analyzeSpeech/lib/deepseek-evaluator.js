const https = require('https');
const { URL } = require('url');
const {
  ISSUE_TYPES,
  QUESTION_FACTORS,
  INTERVENTION_BY_ISSUE
} = require('../config/constants');
const { EVALUATOR_SYSTEM_PROMPT } = require('../config/evaluator-prompt');
const { assessTaskCompletion } = require('./task-completion');

const EVALUATOR_MAX_TOKENS = 1500;
const MAX_EVALUATOR_RETRIES = 1;
const RETRYABLE_OUTPUT_ERRORS = new Set([
  'EMPTY_MODEL_OUTPUT',
  'OUTPUT_TRUNCATED',
  'OUTPUT_PARSE_ERROR'
]);

function getDeepSeekEndpoint() {
  const baseUrl = String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  return baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`;
}

function callDeepSeek(payload) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      reject(new Error('DEEPSEEK_API_KEY_MISSING'));
      return;
    }

    let url;
    try {
      url = new URL(getDeepSeekEndpoint());
    } catch (error) {
      const configError = new Error('DEEPSEEK_BASE_URL_INVALID');
      configError.providerMessage = 'DEEPSEEK_BASE_URL 不是合法的 HTTPS 地址。';
      reject(configError);
      return;
    }
    if (url.protocol !== 'https:') {
      const protocolError = new Error('DEEPSEEK_BASE_URL_INVALID');
      protocolError.providerMessage = 'DEEPSEEK_BASE_URL 必须使用 HTTPS。';
      reject(protocolError);
      return;
    }

    const body = JSON.stringify(payload);
    const request = https.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port || 443,
      path: `${url.pathname}${url.search}`,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${apiKey}`
      }),
      timeout: 25000
    }, (response) => {
      let data = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          let providerError = {};
          try {
            const parsed = JSON.parse(data);
            providerError = parsed && parsed.error ? parsed.error : {};
          } catch (error) {}
          const requestError = new Error('DEEPSEEK_HTTP_ERROR');
          requestError.httpStatus = Number(response.statusCode) || 0;
          requestError.providerCode = providerError.code == null ? '' : String(providerError.code);
          requestError.providerMessage = providerError.message == null ? '' : String(providerError.message);
          reject(requestError);
          return;
        }
        try { resolve(JSON.parse(data)); } catch (error) { reject(new Error('DEEPSEEK_RESPONSE_INVALID')); }
      });
    });
    request.on('timeout', () => request.destroy(Object.assign(new Error('DeepSeek request timed out'), {
      code: 'ETIMEDOUT'
    })));
    request.on('error', (error) => {
      const networkError = new Error('DEEPSEEK_NETWORK_ERROR');
      networkError.cause = error;
      networkError.providerCode = error && error.code ? String(error.code) : '';
      networkError.providerMessage = error && error.message ? String(error.message) : '';
      reject(networkError);
    });
    request.end(body);
  });
}

function parseJsonContent(content) {
  const cleaned = String(content || '').trim()
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

function createEvaluatorOutputError(type, metadata, cause) {
  const error = new Error(type);
  error.name = cause && cause.name ? cause.name : 'DeepSeekEvaluatorOutputError';
  error.outputErrorType = type;
  error.finishReason = metadata.finishReason;
  error.contentLength = metadata.contentLength;
  error.requestId = metadata.requestId;
  error.providerCode = type;
  if (cause) error.cause = cause;
  return error;
}

function parseEvaluatorResponse(response) {
  const choices = response && Array.isArray(response.choices) ? response.choices : [];
  const choice = choices.length ? choices[0] : null;
  const finishReason = choice && choice.finish_reason != null
    ? String(choice.finish_reason)
    : '';
  const message = choice && choice.message && typeof choice.message === 'object'
    ? choice.message
    : null;
  const content = message && typeof message.content === 'string' ? message.content : '';
  const trimmedContent = content.trim();
  const metadata = {
    model: response && response.model ? String(response.model) : '',
    finishReason,
    contentLength: content.length,
    requestId: response && response.id ? String(response.id) : ''
  };

  if (finishReason === 'length') {
    throw createEvaluatorOutputError('OUTPUT_TRUNCATED', metadata);
  }
  if (!choice || !message || !trimmedContent.length) {
    throw createEvaluatorOutputError('EMPTY_MODEL_OUTPUT', metadata);
  }

  try {
    return {
      parsed: parseJsonContent(trimmedContent),
      metadata
    };
  } catch (error) {
    throw createEvaluatorOutputError('OUTPUT_PARSE_ERROR', metadata, error);
  }
}

function logEvaluatorAttempt(model, retryCount, metadata, error) {
  console.log('[DEEPSEEK EVALUATOR] output', {
    model: metadata.model || model,
    finish_reason: metadata.finishReason || '',
    contentLength: Number(metadata.contentLength) || 0,
    requestId: metadata.requestId || '',
    retryCount,
    'error.name': error && error.name ? String(error.name) : '',
    'error.message': error && error.message ? String(error.message) : ''
  });
}

function createEvaluatorPayload(model, input) {
  return {
    model,
    messages: [
      { role: 'system', content: EVALUATOR_SYSTEM_PROMPT },
      { role: 'user', content: `请仅用 JSON 诊断以下输入：\n${JSON.stringify(input)}` }
    ],
    response_format: { type: 'json_object' },
    thinking: { type: 'disabled' },
    temperature: 0,
    max_tokens: EVALUATOR_MAX_TOKENS
  };
}

function isExplicitlyNotApplicable(transcript) {
  const text = String(transcript || '').replace(/\s+/g, '').trim();
  if (!text) return false;
  return /^(?:嗯|呃|额|那个|我想想|想了一下)*最近没有[。！？!?]*$/.test(text)
    || /(?:我|最近|目前|平时)?(?:确实|真的)?(?:没有|没遇到|没碰到)(?:这种|这类|这样的|相关的)?(?:情况|经历|事情|例子|分歧|对象|东西|产品|App|APP|应用)/.test(text)
    || /(?:我|这个我)(?:没有|没)(?:用过|使用过|经历过|遇到过|碰到过|买过|去过|看过|吃过)(?:这种|这类|这样的|相关的)?(?:App|APP|应用|产品|东西|情况|经历)?/.test(text)
    || /我和(?:朋友|同事|身边的人)[^。！？]{0,12}没(?:什么|有)[^。！？]{0,6}分歧/.test(text)
    || /这题[^。！？]{0,12}(?:不适合我|不太适合我|没什么可说|没有可说)/.test(text)
    || /想不到[^。！？]{0,12}我没有(?:这种|这类|这样的)/.test(text);
}

function isTemporaryStartDifficulty(transcript) {
  const text = String(transcript || '').replace(/\s+/g, '').trim();
  if (!text) return false;
  return /(?:想不出来|一下(?:子)?想不到|暂时想不到|不知道说什么|不知道从哪(?:个)?说|我想一下|我想一想)/.test(text);
}

function validateDiagnosis(value, input) {
  if (!value || typeof value !== 'object') throw new Error('DIAGNOSIS_OUTPUT_INVALID');
  const confidence = Number(value.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('DIAGNOSIS_CONFIDENCE_INVALID');

  const questionApplicable = !isExplicitlyNotApplicable(input && input.transcript);
  const questionFactor = QUESTION_FACTORS.includes(value.question_factor)
    ? value.question_factor
    : 'OTHER';
  if (!questionApplicable) {
    return {
      question_applicable: false,
      needs_intervention: false,
      primary_issue: null,
      confidence,
      evidence: [],
      question_factor: questionFactor,
      recommended_intervention: null,
      missing_required_slots: []
    };
  }

  const taskCompletion = assessTaskCompletion(input);
  const applicabilityFallbackToStart = value.question_applicable === false
    && isTemporaryStartDifficulty(input && input.transcript);
  const behavioralIssueCanRemain = value.primary_issue === 'LEXICAL_RETRIEVAL'
    || value.primary_issue === 'INFORMATION_ORDER';
  const completedTaskWithoutBehavioralBlock = taskCompletion.supported
    && taskCompletion.complete
    && !behavioralIssueCanRemain;
  const needsIntervention = (applicabilityFallbackToStart || value.needs_intervention !== false)
    && !completedTaskWithoutBehavioralBlock;
  if (!needsIntervention) {
    return {
      question_applicable: true,
      needs_intervention: false,
      primary_issue: null,
      confidence,
      evidence: [],
      question_factor: questionFactor,
      recommended_intervention: null,
      missing_required_slots: []
    };
  }

  const candidateIssue = applicabilityFallbackToStart ? 'CONTENT_START' : value.primary_issue;
  if (!ISSUE_TYPES.includes(candidateIssue)) throw new Error('DIAGNOSIS_ISSUE_INVALID');

  const transcript = input.transcript;
  const rawEvidence = applicabilityFallbackToStart && !Array.isArray(value.evidence)
    ? [{ text: transcript, type: 'start_hesitation' }]
    : applicabilityFallbackToStart && value.evidence.length === 0
      ? [{ text: transcript, type: 'start_hesitation' }]
      : (Array.isArray(value.evidence) ? value.evidence : []);
  const evidence = rawEvidence
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .filter((item) => transcript.includes(item.text.trim()))
    .slice(0, 5)
    .map((item) => ({
      text: item.text.trim().slice(0, 120),
      type: String(item.type || 'other').slice(0, 64)
    }));

  const shouldDeferOpenQuestion = candidateIssue === 'CONTENT_START'
    && input.question_openness === 'HIGH'
    && evidence.length === 0;
  const primaryIssue = shouldDeferOpenQuestion ? 'UNCERTAIN' : candidateIssue;

  return {
    question_applicable: true,
    needs_intervention: true,
    primary_issue: primaryIssue,
    confidence,
    evidence,
    question_factor: shouldDeferOpenQuestion
      ? 'TOO_OPEN'
      : questionFactor,
    recommended_intervention: INTERVENTION_BY_ISSUE[primaryIssue],
    missing_required_slots: taskCompletion.supported ? taskCompletion.missingSlots : []
  };
}

async function evaluateDiagnosis(input, request = callDeepSeek) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY_MISSING');

  const payload = createEvaluatorPayload(model, input);
  for (let retryCount = 0; retryCount <= MAX_EVALUATOR_RETRIES; retryCount += 1) {
    let metadata = {
      model,
      finishReason: '',
      contentLength: 0,
      requestId: ''
    };
    try {
      const response = await request(payload);
      const parsedResponse = parseEvaluatorResponse(response);
      metadata = parsedResponse.metadata;
      const diagnosis = validateDiagnosis(parsedResponse.parsed, input);
      logEvaluatorAttempt(model, retryCount, metadata, null);
      return {
        diagnosis,
        modelVersion: response.model || model
      };
    } catch (error) {
      metadata = {
        model: error && error.model ? String(error.model) : metadata.model,
        finishReason: error && error.finishReason ? String(error.finishReason) : metadata.finishReason,
        contentLength: Number(error && error.contentLength) || metadata.contentLength,
        requestId: error && error.requestId ? String(error.requestId) : metadata.requestId
      };
      logEvaluatorAttempt(model, retryCount, metadata, error);
      const errorType = error && (error.outputErrorType || error.message);
      if (RETRYABLE_OUTPUT_ERRORS.has(errorType) && retryCount < MAX_EVALUATOR_RETRIES) continue;
      throw error;
    }
  }
  throw new Error('EVALUATOR_RETRY_EXHAUSTED');
}

async function healthcheckDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY_MISSING');

  const response = await callDeepSeek({
    model,
    messages: [
      {
        role: 'system',
        content: '你是一个接口连通性测试程序。请仅输出合法 JSON，不要输出 Markdown、代码围栏或解释。目标 JSON 示例：{"status":"ok"}'
      },
      { role: 'user', content: '请只返回这个 JSON 对象：{"status":"ok"}' }
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 128
  });

  const choice = response.choices && response.choices[0] ? response.choices[0] : null;
  const content = choice && choice.message ? choice.message.content : '';
  const finishReason = choice && choice.finish_reason ? String(choice.finish_reason) : '';
  if (content == null || String(content).trim() === '') {
    const emptyError = new Error('DEEPSEEK_HEALTHCHECK_EMPTY_CONTENT');
    emptyError.providerCode = finishReason || 'EMPTY_CONTENT';
    emptyError.providerMessage = finishReason
      ? `DeepSeek 返回了空 message.content，finish_reason=${finishReason}。`
      : 'DeepSeek 返回了空 message.content。';
    throw emptyError;
  }
  let parsed;
  try {
    parsed = parseJsonContent(content);
  } catch (error) {
    const parseError = new Error('DEEPSEEK_HEALTHCHECK_RESPONSE_PARSE_ERROR');
    parseError.providerCode = finishReason || 'INVALID_JSON';
    parseError.providerMessage = `DeepSeek 返回了非 JSON 内容：${String(content).slice(0, 240)}`;
    throw parseError;
  }
  if (!parsed || parsed.status !== 'ok') throw new Error('DEEPSEEK_HEALTHCHECK_RESPONSE_INVALID');

  return {
    model,
    response: { status: 'ok' }
  };
}

function getSafeHealthcheckMessage(error) {
  return getSafeHealthcheckDetails(error).providerMessage;
}

function sanitizeProviderText(value) {
  let text = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (apiKey) text = text.split(apiKey).join('[REDACTED]');
  text = text
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/Authorization\s*[:=]\s*[^,;}]+/gi, 'Authorization: [REDACTED]');
  return text.slice(0, 500);
}

function sanitizeBaseUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value));
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return `${url.origin}${url.pathname}`.replace(/\/$/, '');
  } catch (error) {
    return sanitizeProviderText(value);
  }
}

function getDeepSeekHealthcheckConfig() {
  const apiKeyConfigured = Boolean(process.env.DEEPSEEK_API_KEY);
  const baseUrlConfigured = Boolean(process.env.DEEPSEEK_BASE_URL);
  const modelConfigured = Boolean(process.env.DEEPSEEK_MODEL);
  return {
    complete: apiKeyConfigured && baseUrlConfigured && modelConfigured,
    publicConfig: {
      apiKeyConfigured,
      baseUrlConfigured,
      modelConfigured,
      baseUrl: sanitizeBaseUrl(process.env.DEEPSEEK_BASE_URL || ''),
      model: sanitizeProviderText(process.env.DEEPSEEK_MODEL || '')
    }
  };
}

function getSafeHealthcheckDetails(error) {
  const code = error && error.message ? error.message : '';
  const httpStatus = Number(error && error.httpStatus) || null;
  const providerCode = sanitizeProviderText(error && error.providerCode);
  const rawProviderMessage = sanitizeProviderText(error && error.providerMessage);
  let errorType = 'UNKNOWN_ERROR';
  let fallbackMessage = 'DeepSeek healthcheck 未完成，请检查服务端配置。';

  const billingText = `${providerCode} ${rawProviderMessage}`.toLowerCase();
  const isBillingError = httpStatus === 402
    || /billing|balance|insufficient|quota exhausted|余额|欠费/.test(billingText);

  if (code === 'DEEPSEEK_API_KEY_MISSING') {
    errorType = 'CONFIG_ERROR';
    fallbackMessage = 'DEEPSEEK_API_KEY 未配置。';
  } else if (code === 'DEEPSEEK_BASE_URL_INVALID') {
    errorType = 'CONFIG_ERROR';
    fallbackMessage = 'DEEPSEEK_BASE_URL 配置无效。';
  } else if (code === 'EMPTY_MODEL_OUTPUT') {
    errorType = 'EMPTY_MODEL_OUTPUT';
    fallbackMessage = 'DeepSeek 返回了空的诊断内容。';
  } else if (code === 'OUTPUT_TRUNCATED') {
    errorType = 'OUTPUT_TRUNCATED';
    fallbackMessage = 'DeepSeek 诊断输出因长度限制被截断。';
  } else if (code === 'OUTPUT_PARSE_ERROR') {
    errorType = 'OUTPUT_PARSE_ERROR';
    fallbackMessage = 'DeepSeek 诊断输出不是合法 JSON。';
  } else if (isBillingError) {
    errorType = 'BILLING_ERROR';
    fallbackMessage = 'DeepSeek 账户余额或计费状态异常。';
  } else if (httpStatus === 401 || httpStatus === 403) {
    errorType = 'AUTH_ERROR';
    fallbackMessage = 'DeepSeek 鉴权失败，请检查云函数服务端环境变量。';
  } else if (httpStatus === 429) {
    errorType = 'RATE_LIMIT';
    fallbackMessage = 'DeepSeek 当前请求受限，请稍后再试。';
  } else if (httpStatus === 404) {
    errorType = 'ENDPOINT_OR_MODEL_ERROR';
    fallbackMessage = 'DeepSeek 接口地址或模型不可用。';
  } else if (httpStatus === 400) {
    errorType = 'REQUEST_ERROR';
    fallbackMessage = 'DeepSeek 拒绝了测试请求。';
  } else if (httpStatus && httpStatus >= 500) {
    errorType = 'PROVIDER_ERROR';
    fallbackMessage = 'DeepSeek 服务暂时异常。';
  } else if (httpStatus && httpStatus >= 400) {
    errorType = 'REQUEST_ERROR';
    fallbackMessage = 'DeepSeek 拒绝了测试请求。';
  } else if (
    code === 'DEEPSEEK_RESPONSE_INVALID'
    || code === 'DEEPSEEK_HEALTHCHECK_RESPONSE_PARSE_ERROR'
    || code === 'DEEPSEEK_HEALTHCHECK_EMPTY_CONTENT'
  ) {
    errorType = 'RESPONSE_PARSE_ERROR';
    fallbackMessage = 'DeepSeek 返回内容不符合 healthcheck JSON 格式。';
  } else if (code === 'DEEPSEEK_HEALTHCHECK_RESPONSE_INVALID') {
    errorType = 'RESPONSE_PARSE_ERROR';
    fallbackMessage = 'DeepSeek 返回 JSON 未包含预期的 status。';
  } else if (code === 'DEEPSEEK_NETWORK_ERROR') {
    errorType = 'NETWORK_ERROR';
    fallbackMessage = '无法连接 DeepSeek 服务。';
  } else if (code) {
    errorType = 'NETWORK_ERROR';
  }

  return {
    httpStatus,
    errorType,
    providerCode,
    providerMessage: rawProviderMessage || fallbackMessage
  };
}

module.exports = {
  callDeepSeek,
  getDeepSeekEndpoint,
  evaluateDiagnosis,
  createEvaluatorPayload,
  parseEvaluatorResponse,
  createEvaluatorOutputError,
  healthcheckDeepSeek,
  getSafeHealthcheckMessage,
  getSafeHealthcheckDetails,
  getDeepSeekHealthcheckConfig,
  sanitizeProviderText,
  sanitizeBaseUrl,
  validateDiagnosis,
  isExplicitlyNotApplicable,
  isTemporaryStartDifficulty,
  parseJsonContent,
  EVALUATOR_MAX_TOKENS,
  MAX_EVALUATOR_RETRIES
};
