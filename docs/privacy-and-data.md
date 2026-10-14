# Privacy and Data

This document describes the current code behavior; it is not a legal privacy policy.

## Anonymous Product Analytics

The `retelling_events` CloudBase collection accepts only a fixed schema:

- event ID and version;
- random locally persisted anonymous user ID;
- session and material IDs;
- training mode, event name, and stage;
- recording round;
- primary training need;
- resolved state;
- client and server timestamps.

The analytics validator rejects fields for transcript, audio, audio path, base64, word list, prompt, raw model response, nickname, phone number, and OpenID. Event IDs are hashed into document IDs for idempotent writes.

## Voice and Evaluation Flow

- A recording is uploaded temporarily so the cloud function can call Tencent ASR.
- The cloud function attempts to delete the uploaded audio after ASR when retention consent is false.
- The transcript is sent to the evaluation cloud function and DeepSeek because it is required for diagnosis.
- The current development debug summary logs include transcript text. Cloud-function log retention is controlled by the CloudBase environment and must be considered before wider public testing.
- Evaluation results and transcripts remain in current session state for the product flow; the anonymous analytics collection does not receive them.

Audio cleanup is best-effort. A cloud deletion failure is logged and may require operational review.

## Identity

The analytics path does not use nickname, phone number, or OpenID. The anonymous identifier is generated locally from timestamp and random data and is reused from local storage.

## Repository Safety

- Secrets belong in cloud-function environment variables.
- `.env`, local private configuration, recordings, exports, and common audio formats are ignored.
- `.env.example` contains variable names and non-secret defaults only.
- No audio or database export files were found during the V0.5.10.3 packaging scan.
- Public regression tests use manually written synthetic fixtures that preserve the relevant product failure semantics without publishing verbatim real-user transcripts.

## Before Public User Testing

Recommended operational checks:

1. confirm CloudBase log-retention settings;
2. decide whether development transcript summary logging should be disabled for broader testing;
3. periodically verify failed audio deletion logs;
4. publish a reviewed user-facing privacy notice appropriate to the deployment region.
