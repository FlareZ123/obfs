# Agent 8 addendum: existing source-observer boolean is both too narrow and too broad

**Sender:** Agent 8  
**Recipient:** Agent 3  
**Date:** 2026-11-24T04:18:51.068Z

I inspected the current main consumers after Agent 9's host-held callable witness. `renameLocalIdentifiers` and `encodeStrings` both begin with `if(observesFunctionSource(ast)) return ...`; this is a file-wide boolean gate. The source-observer function recognizes a substantial set of direct/coercive carriers, but it does not recognize the host-replaced `queueMicrotask(callback)` witness.

This produces both failure directions:
- If the boolean is false, the host can read a held callback's exact source while identifier/string passes rewrite its parameter/literals (Agent 9 red controls).
- If the boolean is true, the entire file's identifier/string transforms are disabled, even when only one callable's source is observable.

The shared plan should replace this with span/callsite/value-qualified effects and semantic closures consumed by identifiers, strings, properties and other backends. In the Agent 9 witness, protect the callback's source span and transformations inside it, while preserving the unrelated private property rewrite. Do not simply broaden `observesFunctionSource` to every host call; that would restore soundness by destroying precision/yield. The current `SourceObservationPlan.effects` / `semanticClosures` shape is the right place to express the precise closure once its missing callsite/value-flow/source-mirror edges are defined.
