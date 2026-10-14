module.exports = [
  {
    id: 'q01', category: 'GENERAL_EXPERIENCE', openness: 'MEDIUM',
    text: '最近有没有一个你原来觉得不太好用，后来用了发现还不错的东西？',
    taskType: 'EXPERIENCE_COMPARE',
    requiredSlots: ['object', 'expectation_before', 'experience_after']
  },
  {
    id: 'q02', category: 'APP_PRODUCT', openness: 'MEDIUM',
    text: '最近有没有一个 App，刚开始觉得用不上，后来发现挺实用？',
    taskType: 'EXPERIENCE_COMPARE',
    requiredSlots: ['object', 'expectation_before', 'experience_after']
  },
  {
    id: 'q03', category: 'FOOD', openness: 'MEDIUM',
    text: '最近吃过哪样东西，味道和你原来想的不太一样？',
    taskType: 'EXPERIENCE_COMPARE',
    requiredSlots: ['object', 'expectation_before', 'experience_after']
  },
  {
    id: 'q04', category: 'PLACE', openness: 'MEDIUM',
    text: '最近去过哪个地方，实际感觉和出发前想的不一样？',
    taskType: 'EXPERIENCE_COMPARE',
    requiredSlots: ['object', 'expectation_before', 'experience_after']
  },
  {
    id: 'q05', category: 'OVERHYPED', openness: 'MEDIUM',
    text: '最近有没有一个你吃过、用过或去过之后，觉得没有别人说得那么好的东西？',
    taskType: 'REASON_EXPLAIN',
    requiredSlots: ['object', 'attitude', 'reason']
  },
  {
    id: 'q06', category: 'CONTENT', openness: 'MEDIUM',
    text: '最近看过的一部电影或一部剧，你会不会推荐给朋友？为什么？',
    taskType: 'REASON_EXPLAIN',
    requiredSlots: ['object', 'attitude', 'reason']
  },
  {
    id: 'q07', category: 'PLACE', openness: 'MEDIUM',
    text: '最近去过的一家店，你还愿意再去吗？为什么？',
    taskType: 'REASON_EXPLAIN',
    requiredSlots: ['object', 'attitude', 'reason']
  },
  {
    id: 'q08', category: 'HABIT', openness: 'MEDIUM',
    text: '你最近在坚持的一个生活习惯，对你有用吗？为什么？',
    taskType: 'REASON_EXPLAIN',
    requiredSlots: ['object', 'attitude', 'reason']
  },
  {
    id: 'q09', category: 'DISAGREEMENT', openness: 'MEDIUM',
    text: '最近有没有一部电影、一家店或一个地方，你和朋友评价不太一样？',
    taskType: 'OPINION_DIFFERENCE',
    requiredSlots: ['topic', 'my_view', 'other_view', 'difference']
  },
  {
    id: 'q10', category: 'FOOD', openness: 'MEDIUM',
    text: '有没有一道大家很喜欢、但你觉得一般的菜？你们分别怎么看？',
    taskType: 'OPINION_DIFFERENCE',
    requiredSlots: ['topic', 'my_view', 'other_view', 'difference']
  },
  {
    id: 'q11', category: 'APP_PRODUCT', openness: 'MEDIUM',
    text: '有没有一个常用 App，你和朋友对它的评价正好不一样？',
    taskType: 'OPINION_DIFFERENCE',
    requiredSlots: ['topic', 'my_view', 'other_view', 'difference']
  },
  {
    id: 'q12', category: 'TRAVEL', openness: 'MEDIUM',
    text: '说到旅行方式，你和身边的人有没有一个不太一样的偏好？',
    taskType: 'OPINION_DIFFERENCE',
    requiredSlots: ['topic', 'my_view', 'other_view', 'difference']
  },
  {
    id: 'q13', category: 'TRAVEL', openness: 'MEDIUM',
    text: '说说你最近一次出门途中遇到的小插曲，后来怎么样了？',
    taskType: 'SIMPLE_EXPERIENCE',
    requiredSlots: ['event', 'key_detail', 'result_or_feeling']
  },
  {
    id: 'q14', category: 'SHOPPING', openness: 'MEDIUM',
    text: '说说你最近一次买东西时印象最深的一个细节，结果满意吗？',
    taskType: 'SIMPLE_EXPERIENCE',
    requiredSlots: ['event', 'key_detail', 'result_or_feeling']
  },
  {
    id: 'q15', category: 'LEARNING', openness: 'MEDIUM',
    text: '说说你最近学会的一件小东西，哪一步最有印象？',
    taskType: 'SIMPLE_EXPERIENCE',
    requiredSlots: ['event', 'key_detail', 'result_or_feeling']
  },
  {
    id: 'q16', category: 'WORK', openness: 'MEDIUM',
    text: '说说你最近完成的一件小任务，中间哪个环节最费劲？',
    taskType: 'SIMPLE_EXPERIENCE',
    requiredSlots: ['event', 'key_detail', 'result_or_feeling']
  },
  {
    id: 'q17', category: 'FOOD', openness: 'LOW',
    text: '早餐你更愿意吃热的还是简单方便的？为什么？',
    taskType: 'CHOICE_REASON',
    requiredSlots: ['choice', 'reason']
  },
  {
    id: 'q18', category: 'TRANSPORT', openness: 'LOW',
    text: '短距离出门，你更愿意走路还是骑车？为什么？',
    taskType: 'CHOICE_REASON',
    requiredSlots: ['choice', 'reason']
  },
  {
    id: 'q19', category: 'CONTENT', openness: 'LOW',
    text: '晚上放松时，你更愿意看电影还是追短剧？为什么？',
    taskType: 'CHOICE_REASON',
    requiredSlots: ['choice', 'reason']
  },
  {
    id: 'q20', category: 'SHOPPING', openness: 'LOW',
    text: '买日常用品时，你更愿意网购还是去店里买？为什么？',
    taskType: 'CHOICE_REASON',
    requiredSlots: ['choice', 'reason']
  }
];
