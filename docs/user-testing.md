# Real User Testing — Round 1 & Round 2

## Method and Privacy

Two exploratory rounds were conducted with anonymous labels U01–U10. This document records qualitative product findings, not identities, raw audio, contact information, or performance statistics. Findings are summarized rather than presented as fabricated quotes.

## Round 1 — U01–U05

- **U01:** Concept feedback showed too much source text, making the key meaning difficult to identify.
- **U02:** “A step is missing” did not explain which causal gap to work on.
- **U03:** A local expression issue required a full retelling, creating unnecessary retry effort.
- **U04:** Some interventions did not lead to a successful second modification.
- **U05:** The Result page lacked a clear correctness anchor. The user also raised fluency concerns such as fillers and hesitations, revealing a need beyond content reconstruction.

## Changes After Round 1

| Problem | Product change | Why |
| --- | --- | --- |
| Long source evidence in feedback | Grounded Feedback Compression | Keep internal grounding while showing one concise key meaning |
| Missing hint too generic | Material-authored Missing Hint Questions | Identify the gap without revealing the full answer |
| Local issue required full retry | Targeted Retry | Reduce effort by retrying only the target sentence |
| User could avoid a target by deleting it | Target Retention | Improvement requires preserving the intended meaning |
| Result lacked a correctness anchor | Grounded Result Reference | Explain why an answer passed without demanding source wording |

## Round 2 — U06–U10

- **U06:** Confirmed the Formulation → `TARGET_EXPRESSION` path and unresolved retry flow could work end to end.
- **U07:** Exposed lost Concept fallback evidence and led to Concept Feedback Closure.
- **U08:** Reported an unclear Missing hint. Logs showed the deeper issue was a misaligned diagnosis target, leading to Missing Target Alignment.
- **U09:** Produced content-level PASS while reporting that the delivery still felt hesitant. This separates “content is clear” from “speech is fluent” and becomes V0.6 input rather than a V0.5 patch.
- **U10:** The second response became evaluable but still had missing core content. The old system incorrectly marked it resolved, leading to the invariant: model became evaluable ≠ user improved.

## Round 2 Product Changes

### Concept Feedback Closure

Preserved grounded Concept evidence through fallback and Result presentation.

### Missing Target Alignment

Separated shared words and adjacent events from actual key-point coverage so the hint targets the real missing semantic step.

### UNCERTAIN Progress Semantics

Only an acceptable completed second-round state resolves UNCERTAIN. A concrete issue that becomes visible remains unresolved and is shown with another retry option.

## Closure Decision

V0.5.10.3 is treated as the stable baseline because:

- Round 1 structural feedback received targeted product changes;
- Round 2 validated targeted retry and exposed issues through logs and grounded regressions;
- the new structural issues from Round 2 were fixed without reopening the entire loop;
- no repeated finding required redesigning Information Reconstruction as a whole.

Fluency and open-ended structured expression move to V0.6 rather than being forced into the V0.5 taxonomy.
