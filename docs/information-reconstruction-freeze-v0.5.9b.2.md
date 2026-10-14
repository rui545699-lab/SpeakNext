# V0.5.9B.2 Information Reconstruction Freeze

## Status

FROZEN

## Frozen Date

2026-10-13

## Product Loop

READING
→ FIRST RECORDING
→ ASR
→ Content + Concept + Expression Evaluation
→ Router selects ONE training target
→ retryScope
→ Micro Intervention
→ SECOND RECORDING if needed
→ Progress Resolver
→ Result
→ Round Completion

## Production Diagnosis

The frozen Information Reconstruction production taxonomy is:

- `PASS`
- `CONCEPT_INACCURACY`
- `MISSING_CAUSAL_STEP`
- `WORDING_PRECISION`
- `FORMULATION_BREAKDOWN`
- `UNCERTAIN`

Historical `INFORMATION_ORDER` and `LEXICAL_RETRIEVAL` paths remain only for backward compatibility and historical regression tests. They must not be restored as active Information Reconstruction production routing categories. Incorrect core relations are represented by the current content/concept path and routed as `CONCEPT_INACCURACY`.

## Retry Scope

`FULL_CONTENT`:

- `CONCEPT_INACCURACY`
- `MISSING_CAUSAL_STEP`
- `UNCERTAIN`

`TARGET_EXPRESSION`:

- `WORDING_PRECISION`
- `FORMULATION_BREAKDOWN`

`PASS` has no retry scope and goes directly to Result.

## Core Invariants

- A practice session permits at most two recordings.
- The Router selects exactly one training target per round.
- The second round validates only the original training target.
- Removing the target content must never count as improvement.
- `TARGET_EXPRESSION` does not require the user to cover the full material again.
- `FULL_CONTENT` continues to require the relevant core content invariants.
- Grounded user evidence must be a continuous substring of the user's transcript.
- Material reference text must never be presented as if the user said it.
- Users are not required to repeat the material's original wording.
- Natural semantic paraphrases may pass.
- Conservative unresolved is preferred over a false resolved result.
- One completed practice session equals one completed round.
- Analytics must not store transcript, audio, audio paths, `wordList`, prompt, raw model output, `openId`, or other PII.

## AI Call Architecture

Normal first round:

- One existing DeepSeek evaluation request.

Normal second round, when required:

- One existing DeepSeek evaluation request.

Subsequent V0.6 work must not silently add model calls to the V0.5 flow.

## Current Material Set

| Material ID | Title |
| --- | --- |
| `retelling_001` | 辣椒明明没那么烫，嘴里为什么像着火？ |
| `retelling_002` | 金属和木头放在同一个房间，为什么金属摸起来更冷？ |
| `retelling_003` | 为什么录音里的自己，总听起来有点陌生？ |
| `retelling_004` | 捏住鼻子吃东西，为什么味道一下少了很多？ |
| `retelling_005` | 微波炉加热同一盒饭，为什么总是一块烫、一块冷？ |
| `retelling_006` | 刚下小雨时，空气里的“土味”是从哪来的？ |

## Current Analytics

The frozen event whitelist contains exactly these nine events:

1. `RETELLING_SESSION_STARTED`
2. `RETELLING_READING_COMPLETED`
3. `RETELLING_FIRST_RECORDING_COMPLETED`
4. `RETELLING_FIRST_EVALUATION_COMPLETED`
5. `RETELLING_INTERVENTION_SHOWN`
6. `RETELLING_SECOND_RECORDING_COMPLETED`
7. `RETELLING_PROGRESS_COMPLETED`
8. `RETELLING_RETRY_STARTED`
9. `RETELLING_ROUND_COMPLETED`

## Regression Baseline

The frozen baseline includes:

- deterministic diagnosis: 35 cases;
- Retelling deterministic: 8 cases;
- Progress deterministic: 16 cases × 3 repeats, 48 runs;
- Content, Concept, Expression and Router tests;
- wording boundary and formulation regression tests;
- targeted retry and target retention regression tests;
- feedback and result presenter tests;
- analytics tests;
- material selector and navigation tests;
- completion-count persistence and idempotency tests;
- the freeze contract guard in `test/information-reconstruction-freeze.test.js`.

All of these checks must remain green when shared infrastructure changes.

## V0.6 Isolation Rules

V0.6 Structured / Logical Expression should preferentially add:

- a new task evaluator;
- new task configuration;
- new material, prompt, or page mode;
- only the Router branch required for that new mode.

It may reuse:

- ASR;
- recording lifecycle;
- sessions;
- analytics infrastructure;
- retry framework;
- progress architecture;
- shared UI components.

V0.6 work must not modify V0.5's Content Evaluator, Concept Analyzer, Expression Prompt, Information Reconstruction Router rules, retry-scope mapping, Progress Resolver invariants, current six materials, result semantics, or analytics event semantics for convenience.

If shared code must change, the complete V0.5 frozen regression baseline must pass before the change is accepted.

## Known Non-blocking Risks

- DeepSeek semantic boundaries can still drift occasionally.
- Conservative unresolved is intentionally preferred to an incorrect resolved result.
- `audio data empty` is a separate Recorder / ASR concern and is not part of this AI-logic freeze.

## Reopen Rule

V0.5 may be reopened only when at least one of these conditions is met:

1. second-round real-user testing reveals a repeated structural problem;
2. there is a production blocker;
3. a clear, high-frequency false positive or false negative is established;
4. an ASR or provider migration breaks the frozen flow.

Copy preference, one-off model variance, and individual expression-style differences are not sufficient reasons to resume model tuning.

Any reopening must use a new version such as V0.5.10. V0.5.9B.2 must not be modified silently.
