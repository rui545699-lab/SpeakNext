# Major Product Iterations

This is a product-decision log, not a commit history.

## V0.4 — General Speaking Diagnosis Baseline

- **Problem:** The prototype needed a real ASR → diagnosis → intervention loop.
- **Decision:** Build a five-class diagnosis baseline with grounded evidence and one intervention.
- **Result:** Real-device end-to-end diagnosis worked, while task-completion boundaries remained difficult.

## V0.5 — Information Reconstruction Pivot

- **Problem:** Open-ended diagnosis made completion conditions ambiguous.
- **Decision:** Use short materials with explicit semantic structure and verify a second attempt.
- **Result:** Information Reconstruction became the core product loop.

## V0.5.6 — Expression Diagnosis

- **Problem:** Content correctness could hide local expression breakdowns.
- **Decision:** Separate expression observations from task content in the same evaluation request.
- **Result:** Local expression targets became independently routable.

## V0.5.7 — Concept and Wording Taxonomy

- **Problem:** Concept errors and imprecise wording required different interventions.
- **Decision:** Add grounded Concept and Expression layers, then route one primary need.
- **Result:** Content, Concept, and Expression could coexist without multiplying user-facing targets.

## V0.5.8 — Anonymous Analytics

- **Problem:** Product funnels could not be measured safely.
- **Decision:** Add nine whitelisted, fail-open anonymous events with no transcript or audio fields.
- **Result:** Session conversion and retry behavior became measurable without identity data.

## V0.5.9A — Grounded Feedback and Result Clarity

- **Problem:** Internal evidence was too long for user feedback, and Results lacked a correctness anchor.
- **Decision:** Separate internal evidence, feedback references, and result references.
- **Result:** Feedback became concise while grounding remained intact.

## V0.5.9B–B.2 — Targeted Retry and Retention

- **Problem:** Local issues required full retelling, and users could appear improved by dropping content.
- **Decision:** Add `TARGET_EXPRESSION` plus semantic target-retention checks.
- **Result:** Wording and Formulation could be retried locally without accepting deletion as improvement.

## V0.5.10 — Concept Feedback Closure

- **Problem:** Concept fallback evidence and unresolved feedback could be lost.
- **Decision:** Preserve grounded Concept targets throughout the loop.
- **Result:** Still wrong, corrected, and corrected-but-incomplete became distinct outcomes.

## V0.5.10.1 — Concept Partial-improvement Semantics

- **Problem:** Correcting one concept did not necessarily complete the task.
- **Decision:** Separate local correction from overall completion.
- **Result:** Corrected-but-incomplete remains unresolved without claiming the concept is still wrong.

## V0.5.10.2 — Missing Target Alignment

- **Problem:** Adjacent evidence could be mistaken for coverage and produce the wrong Missing hint.
- **Decision:** Tighten semantic key-point and relation boundaries.
- **Result:** Missing feedback aligns with the actual absent content.

## V0.5.10.3 — UNCERTAIN Progress Semantics

- **Problem:** “Became evaluable” was treated as “improved.”
- **Decision:** Resolve UNCERTAIN only when the second round reaches an acceptable completed state.
- **Result:** Concrete remaining issues stay unresolved.

## Stable Baseline

V0.5.10.3 closes the Information Reconstruction phase. New fluency or structured-expression needs belong to V0.6.
