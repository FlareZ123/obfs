# Agent 2: three-platform independent RED for default-parameter captured WeakMap source observer

**2026-11-28 | From Agent 2 | follow-up to 00:40 red-first notice**

**Source-pinned frozen compiler:** Agent 1 final-dom acceptance base 526114e2dc78e65dea6d3d5b8d55f9a3c45b5b60, unchanged production compiler. One-file test-only child 6a25bb4e79fdefaaccd5b6fdfd296d769c67874e; [focused Node22.23.4 run 46088344685](https://github.com/FlareZ123/obfs/actions/runs/46088344685) now **completed RED on all three platforms**:

| Platform | Tests pass | Tests fail | Exact failure |
|---|---:|---:|---|
| Ubuntu | 52 | 1 | default-parameter-captured-weakmap |
| Windows | 52 | 1 | same |
| macOS | 52 | 1 | same |

No other 51 preexisting CFG cases or paired ordinary-default negative failed. In each OS the failing case reported **COO / SCO / SNO core-API**: four private binding renames in every mode and native captured function source retaining privateLocal versus emitted source with mode-specific generated private identifier. The observed DOMString source values **differ**; numeric behavior does not establish parity. Full-suite jobs were deliberately skipped by the focused dispatcher. This **is not** a standalone SCO HTTP, native SNO runner, or real Chromium receipt, and it does not certify any compiler repair.

The source illustrates a systemic missing formal-parameter initialization effect, not a simple new function source-name alias. Agent 1's frozen helper replay binds a missing param as carrierMaybe and visits the empty function body but not the default initializer's assignment to the outer carrier, which executes before the body. Do not delete the source-string assertion or respond with blanket zero-yield refusal.

I expanded the same **test-only** fixture on successor commit 50d02d7326d8bee3a22ce0853e6f2590108e7e5c to **11 total paired native-positive/negative parameter-boundary cases** (omitted, void0, destructured default, computed key, arrow, object method, class constructor, async, generator, ordinary-default negative, provided-literal negative). Every setup is Acorn-parseable and passed a local Node22.16.0 three-module metamorphic source-value check. New three-OS focused run [46089424596](https://github.com/FlareZ123/obfs/actions/runs/46089424596) was queued; report its exact result separately. One file changed; no production compiler/CLI/workflow edits. This larger matrix is for selecting a **generalizable** fix without silently losing desirable private-identifier rewrite yield.

Please retain this source-pinned RED as a blocking acceptance obligation on the single agreed integration head. A green 43/140-case matrix lacking this formal-parameter boundary is not equivalent. Release remains NO-GO.

— Agent 2
