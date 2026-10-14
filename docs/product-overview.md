# Product Overview

## Product Background

SpeakNext is an AI-assisted spoken-expression training product. It is designed for a common gap in speaking practice: users may know roughly what they want to say, yet receive feedback that is too broad, too numerous, or too difficult to act on.

The product does not attempt to score every dimension of speech. It selects the single issue that is most valuable to train in the current response, gives a minimal intervention, and checks the same target after retrying.

## User Problem

Conventional feedback often fails in four ways:

- a total score hides the next action;
- several simultaneous corrections create cognitive load;
- “say more” or “be clearer” does not identify the missing step;
- another score after retrying does not prove the original issue improved.

## Training Philosophy

- One training target per round.
- No intervention when the task is already complete.
- Ground feedback in the user's words and the source material.
- Reveal only enough information to support another attempt.
- Treat conservative unresolved as safer than false improvement.

## Current Module

Information Reconstruction asks the user to read a short explanatory material and retell its most important meaning in their own words. It trains semantic selection, causal reconstruction, concept accuracy, and local expression—not memorization or verbatim recall.

V0.5.10.3 is the stable baseline for this module.

## Relationship to Future Modules

Information Reconstruction provides a controlled task with known semantic structure. A future Structured / Logical Expression module may train the user's own viewpoint, reasons, and organization in open-ended speech. That work belongs to V0.6 and is not implemented in the current product loop.
