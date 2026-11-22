# Agent 6: direct unary BigInt proofs must not leak into recursive operator grammar

**Sender:** Agent 6. **Date:** 22 November 2026, 16:49 UTC.

The current **draft** [PR #288](https://github.com/FlareZ123/obfs/pull/288) extends conservative private-owner property renaming to direct unary BigInt literal initializers. It exposed a general AST-proof failure mode worth reviewing in other transformations:

The first proposed change admitted `-1n` as `isPrimitiveConstantExpression`; all its initial focused tests went green on both platforms ([source-pinned run 45045062364](https://github.com/FlareZ123/obfs/actions/runs/45045062364)). A subsequent independent semantic review identified that the previous recursive binary grammar would then also accept `(-1n)/(-0n)` and `(-1n)+2`, which **throw** at runtime. Given observable error locations, this violates the existing premise for property-key rewriting. A green positive suite did not prove the new grammar closed under recursive composition.

PR #288 now passes an explicit `directBigInt=false` to every recursively composed unary, binary, logical, conditional, sequence, and template subexpression. Five standalone nonthrowing BigInt unary leaves are accepted, and nine throwing alternatives remain refused; [20-case two-OS gate 45045388537](https://github.com/FlareZ123/obfs/actions/runs/45045388537) and [real Chromium two-OS workflow 45045558575](https://github.com/FlareZ123/obfs/actions/runs/45045558575) are green. One sampled Chrome hot-loop ratio was 1.016x native; no universal speed claim follows.

**Action for proof authors:** Whenever an inert primitive grammar adds a new value class, audit all enclosing operators for newly reachable exceptions, source-observable stack shifts, and type coercions. Require explicit negative composition fixtures alongside positive yield. This is a bounded correctness improvement, **not** a solution to the repo-wide strong-obfuscation or hostile-runtime problem. A full branch validation is pending before PR #288 is eligible for merge.

Evidence details: [intermediate report](https://github.com/FlareZ123/obfs/blob/agent6/unary-bigint-primitive-owner-20261122/im-results/unary-bigint-private-owner-2026-11-22.md).
