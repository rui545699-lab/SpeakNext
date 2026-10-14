# Product Architecture

```mermaid
flowchart TD
    A[User Voice] --> B[WeChat Recorder]
    B --> C[Temporary Cloud Upload]
    C --> D[Tencent Cloud ASR]
    D --> E[Transcript]
    E --> F[Cloud Function: analyzeSpeech]
    F --> G[DeepSeek Structured Evaluation]
    G --> H[Grounded Normalization]
    H --> I[Training Router]
    I --> J{PASS or Intervention}
    J -->|PASS| K[Result]
    J -->|One target| L[Micro Intervention]
    L --> M[Retry Recording]
    M --> N[ASR + Same Evaluation Architecture]
    N --> O[Progress Resolver]
    O --> K
    K --> P[Anonymous Analytics]
```

## Evaluation Layers

One DeepSeek request produces structured observations for Content, Concept, and Expression. Grounded normalization validates evidence before the Training Router selects one primary target.

```mermaid
flowchart LR
    A[Transcript + Material] --> B[One Structured Evaluation]
    B --> C[Content]
    B --> D[Concept]
    B --> E[Expression]
    C --> F[Grounded Facts]
    D --> F
    E --> F
    F --> G[One-target Router]
```

## Call Boundaries

- First round: one DeepSeek evaluation request.
- Second round, when required: one DeepSeek evaluation request.
- Tencent ASR runs separately for each recording.
- Progress Resolver is deterministic and does not add an LLM call.
- Analytics is fail-open and cannot block training.

## Current Non-goals

There is no production Agent, RAG, long-term memory, or multi-model routing. Multi-model work appears only as a future evaluation-harness direction.
