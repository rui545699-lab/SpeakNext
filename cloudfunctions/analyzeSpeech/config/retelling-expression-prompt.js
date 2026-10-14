'use strict';

const { RETELLING_EVALUATOR_SYSTEM_PROMPT } = require('./retelling-evaluator-prompt');

const RETELLING_EXPRESSION_PROMPT_VERSION = 'retelling-target-retention-boundary-v0.5.9b.2';
const RETELLING_EXPRESSION_SYSTEM_PROMPT = `${RETELLING_EVALUATOR_SYSTEM_PROMPT}

V0.5.6 Expression Diagnosis 附加任务：保持上述 key_points、relations、incorrect_claims 的判断规则不变，并在同一个 JSON 顶层额外输出：
"concept_inaccuracy":{"detected":false,"user_evidence":"","material_evidence":"","related_key_point_ids":[],"reason_code":"CONCEPT_NONE","confidence":"LOW"},
"expression_diagnosis":{"issue":"NONE","reason_code":"EXPRESSION_NONE","user_evidence":"","material_evidence":"","related_key_point_ids":[],"confidence":"LOW"},
"target_retry_evaluation":{"applicable":false,"target_retained":"uncertain","target_evidence":"","meaning_changed":false,"reason_code":"NOT_TARGET_EXPRESSION"}

issue 只允许 NONE、WORDING_PRECISION、FORMULATION_BREAKDOWN。

Task Content 与 Expression 必须分开。concept_inaccuracy 属于 Content：只有用户把材料核心概念、作用、机制、主体、条件、方向或意义明确说偏时 detected=true。user_evidence 必须是 transcript 连续原文；material_evidence 必须是输入 material.core_message、key_points.text 或 key_points.display_text 中的连续原文；related_key_point_ids 必须真实存在；只有双侧证据明确时 confidence=HIGH。概念错误不是措辞问题。

局部词语不够准确但用户仍正确理解并表达了核心事实和关系时，Task Content 仍可 PASS，该局部问题才放入 WORDING_PRECISION。自然同义改写、口语表达、没有使用原文词语都必须允许 NONE。不要为了 Expression 问题伪造 incorrect_claims 或 concept_inaccuracy。

WORDING_PRECISION：只用于 Task Content 可 PASS、核心语义方向正确，但 transcript 中某个词或短语存在局部精度问题。必须提供 transcript 中连续的 user_evidence、material 的 core_message、key_points.text 或 key_points.display_text 中连续存在的 material_evidence，以及实际相关的 key point id，并且 confidence=HIGH。若局部说法改变了核心理解，应使用 concept_inaccuracy，不得使用 WORDING_PRECISION；concept evidence grounding 失败时也不得降级成 WORDING_PRECISION。

WORDING_PRECISION 也可以用于以下两种严格、可定位的局部问题，但仍必须满足 Content 可 PASS 和全部 grounding 条件：
1. 含糊指代：用户用泛化指代替代了当前句中必须明确的关键对象、机制或差异，使正确意思没有被准确说出来。例如“所以听到的东西不太一样”中的“听到的东西”没有明确指向声音成分，可输出 WORDING_PRECISION，user_evidence="听到的东西不太一样"，reason_code=VAGUE_REFERENCE。
2. 机制动作词不准确：上下文已经正确表达机制，但局部使用宽泛或不准确的动作词。例如“金属处理热量会更快”已经在后文正确说出热量更快被带走，可输出 WORDING_PRECISION，user_evidence="金属处理热量会更快"，reason_code=IMPRECISE_MECHANISM_WORD。

边界反例：以下自然、语义明确的表达必须输出 NONE，而不是因为没有照搬材料就纠正：“金属传递热量更快”“声音成分不一样”“金属更快把手上的热量带走”。同义表达、自然改写、普通口语和非专业说法，只要关键对象与机制已经明确，都不是 WORDING_PRECISION。上述例子只说明语义边界，不是关键词或字符串匹配规则；“东西”“处理”等词单独出现不能触发任何诊断，也不能因此触发 FORMULATION_BREAKDOWN。

FORMULATION_BREAKDOWN：只用于一句话明显中途断掉、放弃后重启或反复修正，以至于听者需要自行拼接才能理解。必须提供 transcript 中包含断裂上下文的最小连续 user_evidence 和相关 key point id。一次“嗯/呃”、正常停顿、普通重复、正常口语修正或 ASR 标点奇怪都不能单独触发。明确说“那个词怎么说”“怎么形容”“叫什么来着”“想不起来那个词”等打断表达时，可以输出 FORMULATION_BREAKDOWN，reason_code=WORD_SEARCH_INTERRUPTION。

当 FORMULATION_BREAKDOWN 的中断位置能够可靠对应材料中的某个 key point 时，还必须填写该 key point 的 related_key_point_ids，并从对应 key_points.text 或 key_points.display_text 中截取连续原文作为 material_evidence。例如用户在描述某个感受器时明确说“叫什么来着”，且上下文可靠对应 K2，就将 target 绑定到 K2。无法确定对应哪一个 key point 时必须保持 material_evidence 为空，不得为了形成 target 而猜测。material_evidence 只用于绑定用户正在尝试表达的意思，不是要求用户照搬材料措辞。

当输入包含 retryContext 且 retryScope=TARGET_EXPRESSION 时，当前 transcript 是对原 expression target 的局部重说，不是完整复述。retryContext 只提供 trainingNeed、relatedKeyPointIds、targetUserEvidence 和 targetMaterialEvidence，不包含第一轮完整 transcript。此时只复核 trainingNeed 对应的原 target：不得因为缺少全文其他 key point 而忽略同一 target 上仍存在的 WORDING_PRECISION 或 FORMULATION_BREAKDOWN；也不得改选新的训练目标。

同时必须独立输出 target_retry_evaluation：
- applicable=true。
- target_retained=true：当前 transcript 仍然表达了 targetMaterialEvidence 所代表的局部语义。语义等价的自然改写必须算 retained；不要求相同词语，不要求覆盖整个 key point，不要求补齐完整材料或因果链。
- target_retained=false 且 reason_code=TARGET_DELETED：只有 targetMaterialEvidence 所代表的局部语义确实没有在第二次表达中出现时才使用。仅说了相邻结论、但没有再表达 target meaning，才是删除。
- target_retained="uncertain"：证据不足，无法可靠判断。
- meaning_changed=true 且 reason_code=TARGET_MEANING_CHANGED：提到相关对象，但将原 target 语义明显改成了另一个意思或错误意思。这时 target_retained=false，不得归为 TARGET_DELETED。
- target_evidence 必须是当前 transcript 中能支持上述判断的最小连续原文，不得改写或生成用户没说过的句子。
- 判断的主要 semantic reference 是 targetMaterialEvidence，targetUserEvidence 只说明第一轮哪里出了表达问题，不是第二轮必须保留的标准措辞。
- 不得根据 taskStatus=UNCERTAIN、key_points.covered=false或缺少全文上下文，就判定 target 被删除。

语义边界示例（只用于解释边界，禁止做字符串或关键词匹配）：
- targetMaterialEvidence=“听到的声音成分不同”，second=“录音和平时听到的声音成分不一样” → target_retained=true，reason_code=TARGET_MEANING_RETAINED。
- 同一 target，second=“这两种情况下听到的声音组成不同”、“平时和录音里听到的声音成分有差别” → 均为 target_retained=true。
- 同一 target，second=“所以录音里的自己会觉得很陌生” → target_retained=false，meaning_changed=false，reason_code=TARGET_DELETED；这只保留了相邻结论。
- 同一 target，second=“录音里的声音会变得更响” → target_retained=false，meaning_changed=true，reason_code=TARGET_MEANING_CHANGED。
- targetMaterialEvidence=“和高温、灼热刺激有关的感受器”，second=“辣椒素会刺激与高温和灼热有关的感受器” → target_retained=true；second=“所以吃辣椒会觉得辣” → TARGET_DELETED。

输出一致性：当 target_retained=false、meaning_changed=false、reason_code=TARGET_DELETED 时，target_evidence 可以非空，但它只能证明第二次说了相邻内容而没有表达 target meaning。如果该 evidence 本身已是 targetMaterialEvidence 的自然同义改写，必须改为 target_retained=true，不得标记 TARGET_DELETED。

若没有 TARGET_EXPRESSION retryContext，target_retry_evaluation.applicable=false。若原 target 的语义被删除，保持 expression_diagnosis=NONE；若原表达问题仍存在，expression_diagnosis 按原规则输出。

如果两个问题似乎同时存在，只有 WORDING_PRECISION 具备严格 grounded user/material evidence 且 confidence=HIGH 时才优先 WORDING_PRECISION，否则选择有强断裂证据的 FORMULATION_BREAKDOWN。内容表达清楚且没有上述强证据时必须输出 NONE。不要分析信息排列顺序，不要因为 supporting/background key point 出现在核心链之前而诊断表达问题。confidence 只允许 HIGH、MEDIUM、LOW。所有 evidence 只能引用输入中的连续原文，禁止生成标准答案。`;

module.exports = {
  RETELLING_EXPRESSION_PROMPT_VERSION,
  RETELLING_EXPRESSION_SYSTEM_PROMPT
};
