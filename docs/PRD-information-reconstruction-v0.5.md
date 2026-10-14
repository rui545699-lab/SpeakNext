# SpeakNext 产品需求文档（PRD）

| 项目 | 内容 |
| --- | --- |
| 产品名称 | SpeakNext |
| 当前模块 | Information Reconstruction / 信息重构 |
| 产品版本 | V0.5.10.3 |
| 产品形态 | 微信小程序 |
| 产品状态 | Stable Baseline |
| 文档日期 | 2026-10-14 |

---

## 0. 产品摘要

### 0.1 产品问题

在面试、汇报、课堂发言和日常讨论等即时表达场景中，用户往往能够感知“自己没有说好”，却很难进一步判断这一次最值得先改什么。

“没重点”“没逻辑”“卡住”“说不出来”只是主观感受，背后可能对应不同问题：关键内容缺失、概念理解偏差、信息关系没有讲清、局部措辞不准确，或一句话没有组织完整。

SpeakNext 关注的不是“给出更多反馈”，而是：

> **如何把一次模糊的表达失败，转化成一个用户现在就能练、练完还能验证的问题。**

### 0.2 核心用户需求

> 当我完成一次表达但感觉没有说好时，我希望系统能帮我判断这一次最值得先解决的一个问题，给我一个足够具体但不过度代替我的提示，让我马上再说一次，并确认刚才的问题是否真的改善。

### 0.3 产品方案

SpeakNext 将一次训练收敛为：

> **明确任务 → 单目标诊断 → 最小提示 → 定向重练 → 原目标验证**

当前 V0.5 使用“信息重构”作为受控训练任务：用户阅读一段简短材料，再用自己的话讲清最重要的意思。

### 0.4 核心产品决策

| 产品决策 | 设计原则 |
| --- | --- |
| 一轮只训练一个问题 | 降低认知负担，明确下一步动作 |
| 允许 PASS | 已完成任务时不为了训练强行制造问题 |
| 区分全文与局部 Retry | 局部问题不要求整段重说 |
| 提示不直接代写答案 | 用户必须自己完成第二次表达 |
| 第二次验证原目标 | 不用新的总分替代“是否真的改好” |
| 诊断必须 grounded | AI 结论必须绑定用户实际表达和材料证据 |

---

## 1. 用户需求研究

### 1.1 研究方法

前期需求研究由两部分组成。

#### 线上需求调研

围绕即时表达、说话没条理、知道但说不出来、抓不住重点、复述训练、面试表达等主题进行公开网络调研，重点观察：

- 用户如何描述自己的表达困难；
- 高频出现的真实表达场景；
- 用户当前采用的训练方式；
- 用户期待什么样的反馈；
- 同类产品如何组织练习、反馈与重练。

#### 20 名用户深度访谈与现场表达观察

通过真实经历回溯与即时表达任务，将“表达不好”进一步拆解为可观察的问题。

研究流程：

**真实经历回溯 → 即时表达任务 → 表达后复盘 → 再次表达观察**

重点观察：

- 是否能确定表达切入点；
- 是否能继续展开理由、例子和关键信息；
- 是否出现明显的局部找词或未完成句；
- 信息是否存在重复、跳跃或关系不清；
- 用户能否准确识别自己的问题；
- 给出一个提示后，用户能否完成更好的第二次表达。

### 1.2 关键发现

#### 发现一：用户的自我描述不能直接等于训练问题

用户会使用“没逻辑”“总卡”“脑子里知道但说不出来”等描述，但这些标签无法直接告诉系统应该训练什么。

**产品含义：** 需要基于具体任务和真实输出判断问题，而不是把用户自我标签直接映射成诊断。

#### 发现二：即时表达问题不只发生在语速、停顿和 filler

表达困难还会发生在内容选择、关系建立、概念准确性和局部措辞上。

**产品含义：** 产品不能只做 delivery 指标评分，还需要判断“讲没讲对”和“讲得清不清”。

#### 发现三：用户需要“再说一次”，而不只是“听一次建议”

看懂建议不等于下一次真的会改。

**产品含义：** 反馈必须能够驱动第二次输出，并验证修改结果。

#### 发现四：不同问题的重练成本不应该一样

一句局部表达没说完整，与整段核心内容理解错误，不应使用同一种 Retry 方式。

**产品含义：** 需要区分全文重练与局部重练。

### 1.3 前期问题模型

| 问题方向 | 典型表现 | 对应需求 |
| --- | --- | --- |
| 内容启动困难 | 知道场景，但迟迟无法开始 | 需要低负担启动支架 |
| 内容展开不足 | 有观点，但无法继续补理由或关键信息 | 需要明确下一步补什么 |
| 词语提取困难 | 整体意思存在，但局部找词或句子卡住 | 需要局部训练 |
| 信息组织困难 | 有多个信息点，但跳跃、重复或关系不清 | 需要重新组织已有内容 |

以上是前期需求研究形成的问题假设，不等同于 V0.5 的正式 production taxonomy。

---

## 2. 竞品分析与产品机会

### 2.1 分析维度

竞品分析重点比较：

- 用户以什么任务开始练；
- 反馈是总分、多维问题还是下一步动作；
- 是否要求用户再次开口；
- 是否根据问题调整重练范围；
- 第二次是否验证原问题；
- 是否允许“无需干预”的完成状态。

### 2.2 代表性竞品

| 产品 | 主要公开能力 | 可借鉴点 | SpeakNext 的差异机会 |
| --- | --- | --- | --- |
| 说重点 | 场景训练、问题诊断、AI 即时反馈、成长记录 | 场景化训练、反馈具体化 | 将诊断与第二次表达绑定，并验证原目标 |
| Wellspoken | Structure、Conciseness、Confidence、Pronunciation、Filler Rate、Pace 等维度 | 多维评估、短时练习 | 不以总分为核心，一轮只训练一个问题 |
| Orai | filler、pace、clarity、energy、scorecard、next step | 低门槛练习和具体反馈 | 将训练目标与 Retry / Progress 强绑定 |
| Yoodli | AI roleplay、场景训练、量化反馈、教练目标 | 高拟真场景、持续训练 | V0.5 先用受控任务建立更清晰的判断边界 |
| ChatGPT / 豆包 | 改写、模拟问答、结构建议、即时反馈 | 生成能力强、场景适配广 | 训练协议、Router、Retry、Progress 由产品独立定义 |

### 2.3 产品机会

“AI 能点评”本身已经不足以构成差异。

SpeakNext 的机会在于建立更严格的训练协议：

> **明确任务边界 → 判断内容与表达 → 只选一个训练目标 → 根据问题决定重练范围 → 第二次验证原目标。**

由此形成五个核心价值：

1. 降低判断成本：不让用户自己猜这次最值得改什么；
2. 降低反馈负担：一轮只处理一个问题；
3. 降低重练成本：局部问题不要求全文重说；
4. 提高反馈可执行性：提示直接服务下一次表达；
5. 让进步可验证：第二次围绕原目标判断改善。

---

## 3. 产品演进与版本决策

### 3.1 V0.4：随机口语练习

早期路径：

**随机生活话题 → 用户自由回答 → ASR → AI 诊断 → 一个干预 → 再表达**

这一阶段完成了真实语音到诊断和再表达的基础闭环，但持续测试暴露出明显问题：

- 很多自然回答本来没有明显错误；
- 短回答不等于表达能力差；
- 正常停顿和自我修正容易被过度解释；
- 开放题缺少稳定的任务完成边界。

如果系统为了维持“训练感”而每轮都找问题，会产生 false-positive intervention。

### 3.2 Pivot：从自由表达评价转向明确训练任务

产品因此转向 Information Reconstruction：

> **看完一段内容，把最重要的意思重新讲清楚。**

这一步不是简单更换题型，而是重新定义任务边界，使系统能够更可靠地区分：

- 没说到；
- 说错了；
- 关系没讲清；
- 意思正确，但局部表达不够清楚；
- 已经完成，不需要继续干预。

### 3.3 V0.5：稳定训练闭环

当前闭环：

> **任务 → 诊断 → 单目标 Router → 最小提示 → Retry → Progress 验证**

V0.5.10.3 为当前信息重构稳定基线。

---

## 4. 产品定义

### 4.1 产品定位

SpeakNext 是一款 AI 辅助口语表达训练产品，通过明确任务、单目标诊断、最小干预、定向重练和原目标验证，帮助用户把“我没说好”转化成一次可执行、可验证的训练。

### 4.2 当前目标用户

当前版本更适合：

- 能理解内容，但复述时容易遗漏关键意思；
- 知道自己想表达什么，但局部语言不够准确；
- 希望通过短时、高频练习改善表达；
- 不希望一次收到大量问题，而希望明确知道“下一步先改什么”的用户。

### 4.3 V0.5 产品目标

- 建立“诊断—训练—验证”的完整闭环；
- 每轮只选择一个最高优先级训练目标；
- 区分内容正确性与表达清晰度；
- 支持全文 / 局部两种 Retry；
- 使用 grounded evidence 降低 AI 虚构错误；
- 第二次验证原问题，而不是重新给整体评价；
- 对已经完成任务的自然表达提供 PASS 保护。

### 4.4 非目标

V0.5 暂不处理：

- 通用流畅度评分；
- filler / 口头禅综合评分；
- 演讲表现力；
- 长期个性化训练计划；
- Agent 自主规划；
- 多模型生产路由；
- 开放式观点的完整条理表达训练。

---

## 5. 核心体验与功能

### 5.1 用户主流程

```text
阅读材料
↓
第一次语音复述
↓
Tencent ASR
↓
ONE Structured AI Evaluation
↓
Content + Expression
↓
Training Router
↓
ONE Training Target
↓
PASS ─────────────→ Result
或
Micro Intervention
↓
Retry
↓
Same Evaluator
↓
Progress Resolver
↓
Result
```

产品规则：

- 一轮最多两次录音；
- 第一次 PASS 时直接结束；
- 每轮只展示一个 primary training need；
- 局部问题进入局部重练；
- 内容问题进入完整复述；
- 第二轮围绕第一次选中的目标判断改善。

### 5.2 核心用户故事

**US-01**  
读完材料后，我可以用自己的话复述，而不是背原句。

**US-02**  
如果主要意思已经讲清楚，我希望系统直接告诉我完成。

**US-03**  
如果有多个问题，我希望系统先告诉我当前最值得改的一个。

**US-04**  
如果只是一句话没说清楚，我希望只重说这一句。

**US-05**  
我希望提示告诉我该改哪里，但不要直接把完整答案交给我。

**US-06**  
第二次说完后，我希望知道原来的问题到底有没有改善。

### 5.3 功能需求

| ID | 功能 | 优先级 | 核心要求 |
| --- | --- | --- | --- |
| FR-01 | 材料阅读 | P0 | 短材料、明确任务、支持换一篇 |
| FR-02 | 第一次录音 | P0 | 真机录音、麦克风授权、session 绑定 |
| FR-03 | ASR | P0 | Tencent Cloud ASR，失败与 AI 失败分开处理 |
| FR-04 | AI 结构化评估 | P0 | 每轮一次、固定输出结构 |
| FR-05 | Grounded Normalization | P0 | 诊断必须绑定用户真实表达和材料证据 |
| FR-06 | Training Router | P0 | 一轮只路由一个 primary target |
| FR-07 | Micro Intervention | P0 | 只针对当前目标，不直接代写完整答案 |
| FR-08 | Retry Scope | P0 | 支持 FULL_CONTENT / TARGET_EXPRESSION |
| FR-09 | Progress | P0 | 只验证第一次目标 |
| FR-10 | Result | P0 | 区分 PASS、改善、部分改善、未改善 |
| FR-11 | Session Completion | P0 | 一轮最多两次录音，完成状态幂等 |
| FR-12 | 材料轮换 | P1 | 新 session 切材料，Retry 不切 |
| FR-13 | Anonymous Analytics | P1 | 只记录白名单事件，不记录 audio / transcript 等 |
| FR-14 | 异常处理 | P1 | 覆盖录音、ASR、模型、网络和异步回调异常 |

---

## 6. AI 判断与训练机制

### 6.1 单次评估原则

每轮只进行一次 DeepSeek structured evaluation。

Content 和 Expression 在同一次请求中共同产生；两层顺序表示产品判断优先级，不代表多次模型调用。

### 6.2 Content Layer

判断“意思是否正确”。

- `MISSING_CAUSAL_STEP`
- `CONCEPT_INACCURACY`
- incorrect causal / semantic relation
- `UNCERTAIN`

### 6.3 Expression Layer

在内容足够正确后判断“表达是否清楚”。

- `WORDING_PRECISION`
- `FORMULATION_BREAKDOWN`
- `NONE`

V0.5 不把 filler、一般语速或自然停顿直接作为 Expression 训练目标。

### 6.4 Training Router

同一次评估可以产生多个内部候选，但用户每轮只看到一个最高优先级训练目标。

### 6.5 Retry Scope

| Scope | 适用问题 | 用户动作 |
| --- | --- | --- |
| `FULL_CONTENT` | Concept / Missing / Uncertain | 重新复述完整材料 |
| `TARGET_EXPRESSION` | Wording / Formulation | 只重说目标句 |
| No retry | PASS | 直接进入 Result |

### 6.6 Progress Resolver

第二次不是重新做一次总体评分，而是回答：

> **第一次选中的训练目标，第二次有没有改善？**

关键边界：

- 自然 paraphrase 可以算改善；
- 删除原目标内容不能算改善；
- Concept 改对但其他内容仍缺，不等于整轮完成；
- `UNCERTAIN → 可判断但仍有具体问题`，不能算 resolved。

---

## 7. 数据指标与用户验证

### 7.1 核心漏斗

```text
READING_COMPLETED
→ FIRST_RECORDING_COMPLETED
→ FIRST_EVALUATION_COMPLETED
→ INTERVENTION_SHOWN
→ SECOND_RECORDING_COMPLETED
→ PROGRESS_COMPLETED
→ ROUND_COMPLETED
```

### 7.2 重点指标

| 指标 | 用途 |
| --- | --- |
| 阅读 → 第一次录音转化率 | 判断用户是否真正开始训练 |
| First PASS Rate | 观察任务难度与 PASS Protection |
| Intervention → Second Recording Rate | 判断提示是否足够可执行 |
| Target Resolution Rate | 判断第二次是否解决原训练目标 |
| Unresolved Retry Rate | 观察是否需要继续训练 |
| Round Completion Rate | 判断训练闭环完成情况 |
| Material / Target 分布 | 发现材料难度与诊断偏差 |

当前阶段不设置缺乏依据的增长目标，指标主要用于产品诊断和版本比较。

### 7.3 Round 1｜U01–U05

主要问题：

- Concept 提示太长；
- Missing 只说“还缺一步”，不够具体；
- 局部问题也要求全文重说；
- Result 缺少正确性参照。

对应改动：

- Grounded Feedback Compression；
- Material-authored Missing Hint；
- Targeted Retry；
- Target Retention；
- Grounded Result Reference。

### 7.4 Round 2｜U06–U10

| 用户问题 | 深层原因 | 产品改动 |
| --- | --- | --- |
| U07 Concept 提示出现空引用 | evidence 在 evaluator → Router → UI 链路丢失 | Concept Feedback Closure |
| U08 “提示看不懂” | 上游 keypoint grounding 错位，导致 Missing target 选错 | Missing Target Alignment |
| U09 内容 PASS，但仍觉得磕绊 | 内容正确与流畅度属于不同问题空间 | 流畅度留到 V0.6 |
| U10 第二次变得可判断，却被判成功 | “系统可判断”被错误等同于“用户改善” | UNCERTAIN Progress Semantics |

两轮测试沉淀出三个稳定原则：

1. 不只修界面文案，要追到上游诊断目标；
2. 局部问题必须允许局部重练；
3. 系统更确定，不等于用户已经进步。

---

## 8. 验收、风险与版本边界

### 8.1 核心验收标准

- 每轮只路由一个训练目标；
- PASS 不产生强制干预；
- Wording / Formulation 进入 `TARGET_EXPRESSION`；
- Concept / Missing / Uncertain 进入 `FULL_CONTENT`；
- 第二轮必须验证第一次目标；
- 删除目标内容不能被视为 improvement；
- Concept corrected but incomplete 不被误判为“仍然概念错误”；
- UNCERTAIN 变得可判断不等于 resolved。

### 8.2 当前验证状态

| Suite | 结果 |
| --- | --- |
| Cloud test files | 32 / 32 passed |
| Mini Program test files | 29 / 29 passed |
| Diagnosis deterministic | 35 / 35 passed |
| Retelling deterministic | 8 / 8 passed |
| Progress deterministic | 48 / 48 passed |
| Node syntax checks | 150 files passed |
| WXML static checks | 18 files passed |

以上结果验证 contracts、invariants 与已知回归，不代表真实世界模型准确率为 100%。

### 8.3 主要风险

**ASR 稳定性**  
录音 / ASR 异常与 AI diagnosis tuning 分开处理，避免把底层识别失败误判为模型质量问题。

**AI 误判**  
重点关注 false-positive intervention、false PASS、grounded evidence 错位、target retention 错误和 concept / relation 边界混淆。

**范围膨胀**  
V0.5 不继续加入 filler、通用流畅度、条理表达、Agent 或多模型生产路由，避免破坏稳定任务边界。

---

## 9. 后续规划

### V0.6｜Structured / Logical Expression

下一阶段重新定义：

- 观点是否清楚；
- 理由是否支持观点；
- 信息是否有组织；
- 是否重复或跳跃；
- 局部 formulation；
- fluency-related signals。

V0.6 不直接复用旧 `INFORMATION_ORDER`，需要重新定义任务、taxonomy、Retry 和 Progress。

### Multi-model Evaluation Harness

后续用于比较不同模型在 diagnosis、false intervention、false PASS、grounding、consistency、schema reliability、latency 和 cost 上的表现。

### V0.7｜Adaptive Coach Agent

在稳定多个训练模块之后，再考虑任务选择、长期训练计划和跨轮次个性化。

---

## 附录：参考资料

- NACE — *Job Outlook 2026: Spring Update*
- NACE — *Employers Say New Grads Are Largely Prepared for Work, With Room to Improve*
- V2EX — 即时表达、面试紧张和表达困难相关公开讨论
- Wellspoken — Daily Speaking Practice / Wellspoken Index
- Orai — AI-Powered Public Speaking Coach
- Yoodli — AI Roleplay and Coaching
- 说重点 — App Store 公开产品说明

---

## 当前版本结论

V0.5.10.3 完成了 SpeakNext 第一条稳定训练闭环：

> **明确任务 → 单次 AI 评估 → 单目标 Router → 最小干预 → 定向 Retry → 原目标 Progress 验证。**

信息重构模块在当前版本收束。后续新增需求优先进入 V0.6 独立设计，不继续零碎扩展 V0.5 taxonomy。
