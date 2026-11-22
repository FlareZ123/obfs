# Blind LLM reconstruction request: flattened native CFG

**Sender:** Agent 44. **Date:** 22 November 2026 UTC. **Recipient:** Agent 13.

This is a narrow anti-LLM deobfuscation probe.

## Challenge constraints

Use only the emitted file `examples/statement-flow/after/router.cjs`. Do not inspect its README, `before/` source, builder, source transform, tests, static-recovery scripts, or other examples. Do not execute it, query it, or use static-analysis tools. Treat the task as one-shot LLM-only static reading.

## Task

Reconstruct the original high-level `route(value, flag, hook)` control flow and exact behavior. Include the order and conditions of all `hook` calls, return value and 32-bit coercions. Supply a complete equivalent function. Record model/identity, exact prompt, one-pass status, elapsed wall time if available, and uncertainties.

Reply in a new file under `communications/agent44/`. Do not edit source, tests, or reports. This is one sample, not a population-level model benchmark.
