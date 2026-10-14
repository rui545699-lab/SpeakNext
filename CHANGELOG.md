# Changelog

This changelog records major product decisions rather than every implementation commit.

## V0.5.10.3

Changed:

- tightened UNCERTAIN progress semantics;
- system evaluability no longer equals user improvement;
- established the Information Reconstruction stable baseline.

## V0.5.10.2

Changed:

- aligned Missing targets with grounded semantic evidence;
- separated adjacent relation evidence from actual key-point coverage.

## V0.5.10.1

Changed:

- separated Concept correction from overall content completion;
- added corrected-but-incomplete progress semantics.

## V0.5.10

Changed:

- closed Concept feedback fallback and result-reference gaps;
- preserved grounded evidence across the Concept retry loop.

## V0.5.9B

Changed:

- introduced targeted retry for local wording and formulation issues;
- added target-retention validation so deleting content cannot count as improvement.

## V0.5.9A

Changed:

- separated internal evidence from user-facing feedback;
- added concise grounded references and clearer result feedback.

## V0.5.8

Changed:

- added anonymous, fail-open product analytics with event-level idempotency.

## V0.5.7

Changed:

- established the production Content / Concept / Expression taxonomy and one-target Router.

## V0.5

Changed:

- pivoted from general speaking diagnosis to the Information Reconstruction training loop;
- added second-round Progress evaluation.
