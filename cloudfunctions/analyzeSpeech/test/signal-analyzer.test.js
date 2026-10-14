const assert = require('assert');
const { analyzeSignals } = require('../lib/signal-analyzer');

const result = analyzeSignals({
  transcript: '嗯，这个地方怎么说呢，就是挺舒服。',
  audioDuration: 5000,
  wordList: [
    { word: '嗯', startTime: 600, endTime: 800 },
    { word: '这个地方', startTime: 900, endTime: 1500 },
    { word: '怎么说呢', startTime: 2900, endTime: 3600 }
  ]
});

assert.strictEqual(result.audio_duration_ms, 5000);
assert.strictEqual(result.start_latency_ms, 600);
assert.strictEqual(result.word_count, 3);
assert.strictEqual(result.long_pause_count, 1);
assert.ok(result.filler_count >= 3);
assert.deepStrictEqual(result.explicit_lexical_markers, []);

const lexical = analyzeSignals({
  transcript: '他的想法特别……那个词怎么说……一时想不起来。',
  audioDuration: 4200,
  wordList: []
});
assert.ok(lexical.explicit_lexical_markers.includes('那个词怎么说'));
assert.ok(lexical.explicit_lexical_markers.includes('一时想不起来'));

const ordinary = analyzeSignals({
  transcript: '这件事怎么说都可以，我们继续吧。',
  audioDuration: 2400,
  wordList: []
});
assert.deepStrictEqual(ordinary.explicit_lexical_markers, []);

const umbrella = analyzeSignals({
  transcript: '找工作还是要在意工作的那些……怎么说……就是薪资福利这些。',
  audioDuration: 5000,
  wordList: []
});
assert.ok(umbrella.explicit_lexical_markers.includes('怎么说'));
console.log('signal-analyzer tests passed');
