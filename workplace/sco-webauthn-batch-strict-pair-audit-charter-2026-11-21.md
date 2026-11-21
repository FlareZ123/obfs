# Preregistered strict per-pair 2.5x audit of the SCO WebAuthn batch CPU screen (2026-11-21)

**Agent 10. Classification:** correction to an overoptimistic performance decision, with same-code placebo and immutable raw evidence.

## Source-discovered issue

The published [batched proof CPU run 44878034483](https://github.com/FlareZ123/obfs/actions/runs/44878034483) recorded seven paired A/B process-CPU microsecond samples per OS and batch size B∈{32,128}, but its `serverCpuWithin2_5x` flag compared only the **ratio of medians**. Recalculation of the raw **Windows B=128** rows reveals the third pair **172,000 / 62,000 = 2.77419x**, over 2.5, despite the medians yielding exactly 2.0x. The repository's strict decision rule treats **every observed over-2.5x pair as a veto for the supported workload**. Therefore the earlier report's statement “B=128 server-only component passes on both OS” was **incorrect**.

This amendment was written **before** a repeat test. Its purpose is to preserve that negative observation, make the instrumentation match the existing strict rule and distinguish the measured raw ratio from the cause of a 2.5x breach.

## Frozen independent validation

1. Reprocess the existing seven paired measurements directly. Publish every per-pair ratio and the maximum and number of strict breaches. Do not replace the raw values, threshold, workload, batch size, pairing order, sample count or reported medians.
2. Extend the exact existing Node CPU profiler output with `pairRatios`, `maxPairRatio`, `pairBreachesOver2_5x`, and `strictAllPairsWithin2_5x`. Retain `serverCpuWithin2_5x` as the historical **median-only** field for compatibility, and label it as such in the report. Tests must assert the strict fields are mathematically consistent with every raw pair.
3. Run an additional same-code placebo profile in which **both arms execute the identical original unprotected 500-round Int32 kernel** with 32 repetitions of the original 4,000-call batch = 128,000 calls per arm, seven alternating A/B pairs. Record each original CPU sample and ratio; if the placebo itself crosses 2.5×, this is important evidence of measurement/timer instability. If it does not, do not automatically attribute the original signed-proof breach to obfuscation: finite sampling and Windows CPU accounting remain limitations.
4. Rerun the existing manually-dispatched Linux+Windows CPU job with new instrumentation and placebo. Preserve the original [run 44878034483](https://github.com/FlareZ123/obfs/actions/runs/44878034483) and all new raw evidence. An observed strict breach in *any* protected pair remains a **negative runtime gate** even when the median is positive. A new green sample can only demonstrate non-reproduction at that source/runner pin; it does not erase the original veto.

## Scope

This is a **server-verifier-only** CPU-screen audit with pre-generated reusable ES256 signatures, not a genuine full WebAuthn/HTTP/browser batch compute study or a security improvement. It does not change the batch authorization semantics or the successful allowed-origin online relay witness. Keep the primary release **RELEASE-BLOCKED**, avoid asserting that the batch meets universal 2.5x, and correct the provisional written report rather than silently rewriting history.
