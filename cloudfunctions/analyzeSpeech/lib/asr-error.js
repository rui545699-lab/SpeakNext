function sanitizeAsrText(value) {
  let text = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  const secrets = [
    process.env.TENCENTCLOUD_SECRETID,
    process.env.TENCENTCLOUD_SECRETKEY,
    process.env.TENCENTCLOUD_SESSIONTOKEN
  ].filter(Boolean);
  secrets.forEach((secret) => {
    text = text.split(secret).join('[REDACTED]');
  });
  return text
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/Authorization\s*[:=]\s*[^,;}]+/gi, 'Authorization: [REDACTED]')
    .slice(0, 500);
}

function getSafeAsrError(error) {
  const providerCode = sanitizeAsrText(error && (error.code || error.providerCode));
  const providerMessage = sanitizeAsrText(error && (error.message || error.providerMessage))
    || '腾讯云语音识别未完成。';
  const code = providerCode || String(error && error.message || '');
  let errorType = 'ASR_ERROR';

  if (code === 'TENCENT_ASR_TEMP_CREDENTIALS_MISSING') errorType = 'CONFIG_ERROR';
  else if (code === 'EMPTY_AUDIO') errorType = 'EMPTY_AUDIO';
  else if (code === 'ASR_EMPTY_TRANSCRIPT') errorType = 'EMPTY_TRANSCRIPT';
  else if (/AuthFailure|InvalidCredential|Unauthorized/i.test(code)) errorType = 'AUTH_ERROR';
  else if (/InvalidParameter|UnsupportedOperation|FailedOperation/i.test(code)) errorType = 'REQUEST_ERROR';
  else if (/RequestLimit|LimitExceeded|Throttl/i.test(code)) errorType = 'RATE_LIMIT';
  else if (/InternalError|ResourceUnavailable|ServiceUnavailable/i.test(code)) errorType = 'PROVIDER_ERROR';
  else if (/ECONN|ENOTFOUND|ETIMEDOUT|NETWORK/i.test(code)) errorType = 'NETWORK_ERROR';

  return { errorType, providerCode, providerMessage };
}

module.exports = { sanitizeAsrText, getSafeAsrError };
