# Evaluation Framework

## Quality Layers

SpeakNext uses complementary evidence rather than a single accuracy number:

1. deterministic diagnosis cases for the earlier general-speaking path;
2. Retelling deterministic cases for content and relation behavior;
3. Progress deterministic cases for original-target resolution;
4. Cloud-function and Mini Program regression tests;
5. real-device end-to-end validation;
6. qualitative real-user testing.

## Deterministic vs Real-world Evidence

Mocked and deterministic tests verify contracts, invariants, normalization, routing, and known regressions. They do not measure general real-user accuracy. Live model runs can expose variance, but a small curated set is still not equivalent to a representative human-labeled benchmark.

The correct statement for the current baseline is:

> All current deterministic regression suites pass.

It is not accurate to claim that the model has 100% real-world accuracy.

## Frozen Baseline Confirmation

Verified on 2026-10-13:

| Suite | Current result |
| --- | --- |
| Cloud test files | 32 / 32 passed |
| Mini Program test files | 29 / 29 passed |
| Diagnosis deterministic | 35 / 35 passed |
| Retelling deterministic | 8 / 8 passed |
| Progress deterministic | 48 / 48 runs passed |
| Node syntax checks | 150 files passed |
| WXML static checks | 18 files passed |

No DeepSeek Live Eval was run during repository packaging.

## Guarded Invariants

- one routed target;
- no false completion from missing grounded evidence;
- no improvement by deleting target content;
- PASS protection;
- at most two recordings per session;
- UNCERTAIN evaluability is not equivalent to resolution;
- analytics payloads reject transcript, audio, prompt, raw model response, OpenID, and other forbidden fields.
