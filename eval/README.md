# SpeakNext deterministic Eval

运行：

```bash
node eval/run-eval.js
```

默认 Eval 不访问微信云函数或 DeepSeek，直接复用生产代码中的纯函数，覆盖：

- diagnosis 输出校验与 question applicability fallback；
- requiredSlots 完成判断；
- lexical marker 边界；
- Intervention Checker evidence grounding；
- previousSlotState 合并与历史 slot 保留；
- intervention_pass 与 original_task_complete 分离。

`cases.js` 中 diagnosis case 的 `modelOutput` 表示固定的候选 LLM JSON。默认 Eval 验证服务端 deterministic guard 是否正确接受、覆盖或拒绝该候选结果，不衡量线上模型每次能否生成同样分类。

## Live LLM Eval

Live Eval 使用 20 条 diagnosis case，每条串行调用 3 次，共 60 次请求：

```bash
node eval/run-live-eval.js
```

首次连通性检查可使用 smoke 模式。它固定运行现有的 clear、CONTENT_START、LEXICAL_RETRIEVAL 三条 case，每条只调用一次：

```bash
node eval/run-live-eval.js --smoke
```

Smoke 结果文件名包含 `smoke`；该参数不会改变默认的 20×3 正式 Eval 配置。

UNCERTAIN / CONTENT_START 边界校准可运行固定 Targeted Eval：

```bash
node eval/run-live-eval.js --targeted
```

该模式固定运行 E24、E29 和 CONTENT_START control E03，每条重复 3 次，共 9 次请求；结果文件名包含 `targeted`。

运行前必须在当前终端配置 `DEEPSEEK_API_KEY`。`DEEPSEEK_BASE_URL` 和 `DEEPSEEK_MODEL` 的读取方式与生产 evaluator 完全一致。命令会明确提示可能产生 API 费用，且不会打印 key、Authorization 或请求头。

Live Eval 直接复用生产 `createEvaluatorPayload`、`callDeepSeek`、`parseEvaluatorResponse` 和 `validateDiagnosis`，不调用 ASR。每次请求同时保存 raw model output 和 deterministic guard 后的 final output。

完整结果写入 `eval/results/live-eval-*.json`，摘要写入 `live-eval-summary-*.csv`。默认 deterministic Eval 仍由 `node eval/run-eval.js` 独立运行，不依赖网络。
