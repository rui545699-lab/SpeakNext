# Roadmap

## Current

**V0.5 Information Reconstruction — stable baseline**

The current product trains a user to reconstruct the most important meaning of short explanatory material, applies one intervention, and validates one retry.

## Next: V0.6 Structured / Logical Expression

Potential training areas include:

- viewpoint clarity;
- reason support;
- information organization;
- repetition and jumping;
- formulation breakdown;
- fluency-related signals.

V0.6 is not implemented. Its taxonomy and completion conditions should be evaluated independently rather than inserted into the frozen V0.5 loop.

## Evaluation Infrastructure

A future multi-model evaluation harness may compare:

- diagnosis quality;
- false intervention and false pass;
- grounding and schema reliability;
- repeated-run consistency;
- latency and cost.

This would be an evaluation harness, not the current production architecture. Production currently uses one DeepSeek structured evaluation per round.

## Later: V0.7 Adaptive Coach Agent

An adaptive coach could eventually select tasks, manage longer training plans, and adjust support over time. **Agent is not currently part of the production loop.** Any future Agent work must preserve the stable V0.5 evidence and Progress invariants.
