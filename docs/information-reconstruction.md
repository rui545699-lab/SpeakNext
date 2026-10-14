# Information Reconstruction — V0.5

## Training Goal

Read a short piece of content, then explain its most important meaning clearly in your own words.

The task is not:

- verbatim repetition;
- memorization;
- producing the longest possible answer;
- using the material's exact vocabulary.

## Product Flow

`READING → FIRST RECORDING → ASR → EVALUATION → PASS or MICRO HINT → SECOND RECORDING → PROGRESS → RESULT`

A session contains at most two recordings. A first-round PASS skips the retry.

## Production Taxonomy

| Target | Meaning |
| --- | --- |
| `PASS` | The core task is acceptably complete |
| `MISSING_CAUSAL_STEP` | Required core content or a causal step is missing |
| `CONCEPT_INACCURACY` | A material concept or mechanism is stated incorrectly |
| `WORDING_PRECISION` | The meaning is correct, but a local phrase is materially vague or inaccurate |
| `FORMULATION_BREAKDOWN` | A target sentence breaks down and requires listener reconstruction |
| `UNCERTAIN` | Evidence is insufficient for a reliable primary target |

`INFORMATION_ORDER` and `LEXICAL_RETRIEVAL` remain legacy compatibility paths, not current production routing targets for this module.

## Retry Scope

- `FULL_CONTENT`: Concept, Missing, and Uncertain retry the complete retelling.
- `TARGET_EXPRESSION`: Wording and Formulation retry only the target sentence.
- `PASS`: no retry.

## Grounded Feedback

Internal evidence and user-facing feedback are separate. Internal evidence retains full transcript/material bindings for validation and debugging. The UI uses short, material-authored references or hint questions. Runtime LLM output does not freely generate the displayed scientific explanation.

## Progress Evaluation

The second round is evaluated with the same diagnostic architecture, followed by deterministic Progress resolution bound to the original target. Removing the difficult content cannot count as improvement.

Concept distinguishes:

- still incorrect;
- corrected and complete;
- corrected but content-incomplete.

For UNCERTAIN, becoming evaluable is not enough: a concrete unresolved issue remains unresolved.

## PASS Protection

The system does not intervene merely because an answer could be longer. Supporting details can be omitted when the core semantic task is complete. Natural paraphrases are valid and users are not required to repeat the source wording.

## Stable Baseline

**V0.5.10.3 — STABLE_BASELINE**

The frozen contract includes one target per round, at most two recordings, grounded evidence, scoped retry, deterministic Progress semantics, round completion, and anonymous product analytics.
