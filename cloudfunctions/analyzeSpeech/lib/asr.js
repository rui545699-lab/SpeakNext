const tencentcloud = require('tencentcloud-sdk-nodejs');

function getAsrCredential() {
  const secretId = process.env.ASR_SECRET_ID;
  const secretKey = process.env.ASR_SECRET_KEY;
  if (!secretId || !secretKey) {
    const error = new Error('TENCENT_ASR_TEMP_CREDENTIALS_MISSING');
    error.code = 'TENCENT_ASR_TEMP_CREDENTIALS_MISSING';
    throw error;
  }
  return { secretId, secretKey };
}

function getAsrClient(credential = getAsrCredential()) {
  const AsrClient = tencentcloud.asr.v20190614.Client;
  return new AsrClient({
    credential,
    region: process.env.TENCENTCLOUD_REGION || 'ap-shanghai',
    profile: {
      httpProfile: { endpoint: 'asr.tencentcloudapi.com' }
    }
  });
}

function normalizeWordList(wordList) {
  return (Array.isArray(wordList) ? wordList : []).map((item) => ({
    word: String(item.Word || '').trim(),
    startTime: Number(item.StartTime) || 0,
    endTime: Number(item.EndTime) || 0
  })).filter((item) => item.word);
}

async function recognizeSpeech(fileContent, voiceFormat = 'mp3') {
  const buffer = Buffer.isBuffer(fileContent) ? fileContent : Buffer.from(fileContent);
  const credential = getAsrCredential();
  const response = await getAsrClient(credential).SentenceRecognition({
    EngSerViceType: process.env.TENCENT_ASR_ENGINE || '16k_zh',
    SourceType: 1,
    VoiceFormat: voiceFormat,
    Data: buffer.toString('base64'),
    DataLen: buffer.length,
    SubServiceType: 2,
    ProjectId: 0,
    WordInfo: 1,
    FilterModal: 0,
    FilterPunc: 0,
    FilterDirty: 0
  });

  const transcript = String(response.Result || '').trim();
  return {
    transcript,
    audioDuration: Number(response.AudioDuration) || 0,
    wordList: normalizeWordList(response.WordList),
    requestId: String(response.RequestId || '')
  };
}

module.exports = {
  recognizeSpeech,
  normalizeWordList
};
