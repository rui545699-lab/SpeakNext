const {
  LONG_PAUSE_THRESHOLD_MS,
  FILLERS,
  LEXICAL_MARKERS
} = require('../config/constants');

function countOccurrences(text, phrase) {
  if (!text || !phrase) return 0;
  let count = 0;
  let cursor = 0;
  while ((cursor = text.indexOf(phrase, cursor)) !== -1) {
    count += 1;
    cursor += phrase.length;
  }
  return count;
}

function estimateWordCount(transcript) {
  const latinWords = (transcript.match(/[A-Za-z0-9]+/g) || []).length;
  const chineseCharacters = (transcript.match(/[\u3400-\u9fff]/g) || []).length;
  return latinWords + chineseCharacters;
}

function findContextualLexicalMarkers(transcript) {
  const text = String(transcript || '');
  const markers = LEXICAL_MARKERS.filter((marker) => text.includes(marker));
  const contextualBareSearch = /(?:…{2,}|\.\.\.|，)\s*怎么说\s*(?:…{2,}|\.\.\.|，|$)/.test(text)
    || /(?:那些|这些|方面|因素|想法|感觉|很|特别|比较|有点)[^。！？]{0,18}怎么说(?!都|也行|均可)/.test(text);
  if (contextualBareSearch && !markers.includes('怎么说')) markers.push('怎么说');
  return markers;
}

function analyzeSignals({ transcript, audioDuration, wordList }) {
  const validWords = (wordList || [])
    .filter((item) => item.word && Number.isFinite(item.startTime) && Number.isFinite(item.endTime))
    .sort((a, b) => a.startTime - b.startTime);

  let longPauseCount = 0;
  for (let index = 1; index < validWords.length; index += 1) {
    if (validWords[index].startTime - validWords[index - 1].endTime > LONG_PAUSE_THRESHOLD_MS) {
      longPauseCount += 1;
    }
  }

  const explicitLexicalMarkers = findContextualLexicalMarkers(transcript);
  const fillerCount = FILLERS.reduce((total, filler) => total + countOccurrences(transcript, filler), 0);

  return {
    audio_duration_ms: Number(audioDuration) || 0,
    start_latency_ms: validWords.length ? Math.max(0, validWords[0].startTime) : 0,
    word_count: validWords.length || estimateWordCount(transcript),
    long_pause_count: longPauseCount,
    filler_count: fillerCount,
    explicit_lexical_markers: explicitLexicalMarkers
  };
}

module.exports = { analyzeSignals, countOccurrences, estimateWordCount, findContextualLexicalMarkers };
