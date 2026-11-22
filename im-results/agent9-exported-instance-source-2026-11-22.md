# Exported instance prototypes expose rewritten method source across COO/SNO

**Date:** 22 November 2026. **Researcher:** Agent 9. **Status:** two-platform, source-pinned **red correctness witness** with an independent source-import observer. Intermediate compatibility evidence only; no security or performance promotion.

## Question

Can `closedWorld:true` safely rename a cross-file property when the class declaration is private, but the class **instance** is exported to an external importer that can inspect its prototype method source?

## Reproduction

The original, retained `sims/public-instance-source-probe.js` constructs three ESM files:

- `owner.mjs`: `export const owner={secretField:7};`
- `state.mjs`: imports the owner, defines `class Reader {read(){return owner.secretField;}}`, exports `const instance=new Reader()`.
- `private.mjs`: defines independent `hidden={privateField:13}` and `readPrivate()`, exports its computed primitive result 13.

A *separate, external* `external-inspector.mjs` is intentionally excluded from the input array. It imports `instance` and `privateValue`, evaluates `instance.read()`, and reads `Object.getPrototypeOf(instance).read.toString()`. The harness writes native and compiler-emitted files atomically into separate temporary directories and executes each inspector in a fresh Node ESM process. Both modes use `closedWorld:true, properties:true, identifiers:false, strings:false` with a fixed mode-specific seed.

The standard node:test wrapper `test/public-instance-prototype-source.test.js` was committed at exact executable source SHA **`aafd060cb58177f4fccadc9dce580930b6cc7cad`** on research branch `agent9-public-instance-prototype-source-red-20261122`. Existing `.github/workflows/manual-validation.yml` ran it under Node **22.23.4** for Ubuntu and Windows, rather than creating a separate workflow.

[Source-pinned two-platform red run 44990187759](https://github.com/FlareZ123/obfs/actions/runs/44990187759):

| Observation | COO Ubuntu and Windows | SNO Ubuntu and Windows |
| --- | --- | --- |
| `instance.read()` | 7, correct | 7, correct |
| independently exported `privateValue` | 13, correct | 13, correct |
| aggregate renamed property count | 2 | 2 |
| native method source | `read(){return owner.secretField;}` | same |
| emitted method source | `read(){return owner._pd7f4262baf98;}` | `read(){return owner._p5911ed8f6d9d;}` |
| exact source parity | **false** | **false** |

Ubuntu: 4,318 tests, **4,316 pass, one skipped, one failure**. Windows: 4,318 tests, **4,312 pass, five skipped, one failure**. Both single failures were the new prototype-source test. Both jobs continued through their documented typecheck, benchmark, and configured browser sections; this red observation must not be called a full validation pass.

## Interpretation

Exporting a class instance exposes its prototype through native reflection even when the class declaration is private. The external inspector needs no source-observing syntax in the compiler's input modules. The AST property transformation changes the text returned by `Function.prototype.toString`, while retaining values. Therefore a compiler that promises 1:1 callable-source behavior must include reachable prototype methods in its public-callable escape analysis.

The two reported property rewrites are **aggregate** cross-file and per-file metrics; the initial run establishes that rewriting occurred, but does not separately attribute a count to the unrelated private module. A follow-up evidence-only branch commit **`b082f0af15652647bf3bcc60694f03e7af3d1b3e`** adds a `privatePropertyRenames` metric and asserts positive yield on `private.mjs`, but that stricter version was not covered by the source-pinned run above. A second broad workflow was explicitly canceled in response to Critic guidance favoring staged focused validation.

## Follow-up acceptance criterion

Port this witness to the **single canonical public-callable source preflight** owned by the reconciled integration owner. Verify `Object.getPrototypeOf(exportedInstance).read.toString()` equality for native vs emitted ESM on both platforms, with separately measured private owner yield. Test property, identifier and string passes in combination, using only proven direct-call-only private helpers as positive controls. A green candidate needs a source-coincident integration pin, and existing real Chromium and strict JSDoc checks. Broad new full-suite reruns are inappropriate until focused compatibility cases are green.

This witness addresses COO/SNO direct ESM obfuscation semantics. It does not test the full SNO CommonJS launcher, authenticated SCO HTTP delivery, reconstruction hardness, anti-tamper behavior, host locking, LLM resistance, or the 2.5× runtime ceiling. Strong-protection release remains **RELEASE-BLOCKED**.

## Communication

- Initial direct integration request: `communications/agent3/20261122T0538Z_agent9_instance-prototype-red-gate.md`
- Independent owner-coordination message: `communications/agent39/20261122T0546Z_agent9_prototype-source-witness-coordination.md`
- Focused canonical-gate metric-shape review: `communications/agent3/20261122T0550Z_agent9_public-gate-metrics-shape-review.md`
