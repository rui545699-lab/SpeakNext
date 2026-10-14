'use strict';

const materials = require('../data/retelling-materials');
const { materialPayload } = require('../utils/retelling-service');

const transcripts = Object.freeze({
  retelling_001: {
    partial: '辣椒本身其实没那么烫，但是吃起来嘴里还是会觉得特别热。',
    complete: '辣椒素会激活感受高温的 TRPV1 感受器，让神经发出类似高温的信号，所以嘴里会产生明显的灼热感。',
    negative: '这个挺神奇的。'
  },
  retelling_002: {
    partial: '金属和木头温度差不多，但摸金属的时候明显觉得更冷。',
    complete: '金属传递热量比木头快，会更快带走手上的热量，所以手指降温更快，摸起来也更冷。',
    negative: '金属这个话题挺有意思。'
  },
  retelling_003: {
    partial: '录音里的声音明明是自己的，但是听起来和平时感觉不太一样。',
    complete: '平时听自己的声音既有空气传导也有骨传导，录音回放主要是空气传导，所以录音里的声音听起来和平时不一样。',
    negative: '我平时也会录音。'
  },
  retelling_004: {
    partial: '捏住鼻子以后，食物还是能尝出甜咸，但整体味道淡了很多。',
    complete: '捏住鼻子后，食物香气很难到达嗅觉区域，嗅觉信息少了，所以完整风味会减弱，食物就显得没那么有味道。',
    negative: '我喜欢吃东西。'
  },
  retelling_005: {
    partial: '微波炉热饭的时候，经常会有些地方特别热，有些地方还是冷的。',
    complete: '食物不同位置的成分和厚度不同，加热速度不一样，短时间内热量又没有充分扩散，所以会形成一块热一块冷的情况。',
    negative: '微波炉挺方便的。'
  },
  retelling_006: {
    partial: '下完一点小雨以后，空气里经常会有一种很明显的泥土味。',
    complete: '雨滴形成的小气泡破裂时会释放气溶胶，把土壤里的气味物质带进空气，所以人会闻到雨后的泥土味。',
    negative: '我挺喜欢下雨天。'
  }
});

function createCase(material, variant, task, routed, expectedK2, expectedK3) {
  const suffix = { partial: 'A', complete: 'B', negative: 'N' }[variant];
  return Object.freeze({
    id: `${material.id}_${suffix}`,
    material: materialPayload(material),
    transcript: transcripts[material.id][variant],
    variant,
    gold: Object.freeze({ task, process: 'NONE', routed, expectedK2, expectedK3 })
  });
}

module.exports = Object.freeze(materials.flatMap((material) => [
  createCase(material, 'partial', 'MISSING_CORE_CONTENT', 'MISSING_CAUSAL_STEP', false, true),
  createCase(material, 'complete', 'PASS', 'PASS', true, true),
  createCase(material, 'negative', 'UNCERTAIN', 'UNCERTAIN', false, false)
]));
