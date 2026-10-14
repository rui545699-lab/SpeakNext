function redact(value) {
  return String(value || '')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/Authorization\s*[:=]\s*[^,;}\s]+/gi, 'Authorization: [REDACTED]')
    .slice(0, 4000);
}

function getSafeErrorDetails(error) {
  return {
    'error.name': redact(error && error.name),
    'error.message': redact(error && error.message),
    'error.stack': redact(error && error.stack)
  };
}

module.exports = { getSafeErrorDetails };
