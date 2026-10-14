'use strict';

module.exports = Object.freeze({
  id: 'retelling_001',
  title: '为什么通知越多，反而越容易漏掉重要消息？',
  text: '手机通知原本是为了帮助人及时获取信息，但当提醒数量不断增加时，它的作用可能发生变化。工作群、购物软件、社交平台和各种服务都会争夺注意力，其中真正需要立即处理的信息其实只占一部分。久而久之，人会逐渐形成一种习惯：看到通知先划掉，或者等有空再统一处理。问题在于，人并不会始终准确地区分普通提醒和重要提醒。当忽略通知成为惯常动作后，真正重要的消息也可能被一起跳过。与此同时，频繁出现的提醒还会不断打断正在进行的事情，使人需要重新集中注意力。因此，通知管理的关键并不是接收得越多越好，而是减少无关提醒，让真正重要的信息更容易被注意到。',
  coreMessage: '大量低价值通知会让人形成忽略提醒的习惯，从而使真正重要的信息也更容易被忽略。',
  keyPoints: Object.freeze([
    Object.freeze({ id: 'K1', role: 'SUPPORTING', text: '通知数量很多，其中包含大量低价值或非紧急提醒', displayText: '通知很多' }),
    Object.freeze({ id: 'K2', role: 'CORE', text: '频繁低价值提醒使人逐渐习惯忽略通知', displayText: '逐渐习惯忽略提醒' }),
    Object.freeze({ id: 'K3', role: 'CORE', text: '形成忽略习惯后，重要信息也容易一起被忽略', displayText: '重要消息容易漏掉' }),
    Object.freeze({ id: 'K4', role: 'SUPPORTING', text: '频繁通知还会打断当前任务和注意力' }),
    Object.freeze({ id: 'K5', role: 'CONCLUSION', text: '通知管理应减少无关提醒，而非追求接收更多' })
  ]),
  relations: Object.freeze([
    Object.freeze({ id: 'R1', from: 'K1', to: 'K2', type: 'CAUSE' }),
    Object.freeze({ id: 'R2', from: 'K2', to: 'K3', type: 'CAUSE' })
  ])
});
