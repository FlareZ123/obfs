# Selective private-owner property renaming with a reflective owner sharing identical keys

**Agent 7, 21 November 2026. Bounded compatibility-and-coverage experiment.** This extends the [earlier equal-trust unbundled esbuild comparison](crossfile-unbundled-esbuild-property-mangle-control-2026-11-21.md) from two **separate** positive/negative ESM graphs to **one distributed four-module application** with two independent records sharing the literal field spellings `secretField` and `otherField`. The source code is unchanged across all compiled arms.

## Falsifiable question

Can the closed-world per-owner proof rewrite the private object's field names **without changing** another reflective object's `Object.keys` observable names, in the same ESM program? Can ordinary esbuild property mangling configured only by the *global property-name regex/cache* achieve the same selective rewrite without source changes?

The same four files are served with unbundled ESM imports in all variants:

- `private-state.mjs` exports `secret={secretField:17,otherField:5}`.
- `public-state.mjs` exports `visible={secretField:23,otherField:7}`.
- `identity.mjs` exports a pure single-parameter identity helper.
- `entry.mjs` imports both records and the helper. `run(a)` reads private fields through a proven immutable identity relay while returning `Object.keys(visible)` and a numeric `visible.secretField+a`.

There is no alias path between the two state records. A field-name regex sees identical spelling on both records, whereas the compiler's owner proof can distinguish which record actually reaches reflection.

## Exact source and controls

**Execution SHA:** `763e684f55c6bdbe86be662014f748886ef7084c`, validated by the existing [manual imported-identity workflow 44948602571](https://github.com/FlareZ123/obfs/actions/runs/44948602571), **successful Ubuntu and Windows Node 22 jobs**, Ubuntu real Chrome 157, strict core/cross-file JSDoc, all existing focused alias tests. No new workflow.

1. Native original four-module graph.
2. Closed-world compiler `obfuscateFiles({mode:'coo',closedWorld:true,properties:true,identifiers:false,strings:false})` on all four modules together.
3. Explicit esbuild `mangleProps:/^(secretField|otherField)$/`, with fixed `mangleCache:{secretField:'a',otherField:'b'}`, one four-entry `build({bundle:false})`.
4. Explicit esbuild *safe global reservation* `mangleCache:{secretField:false,otherField:false}`, same four-entry build and regex, which preserves both spellings.

The esbuild cache is intentional: [prior red 44947612797](https://github.com/FlareZ123/obfs/actions/runs/44947612797) showed inconsistent cross-file property names under the default cache in this exact unbundled configuration. The configured esbuild control here uses no weaker default setting.

## Independently checked observations

| Independent dimension | Closed-world compiler | esbuild names mangled globally | esbuild names globally reserved |
| --- | --- | --- | --- |
| **Private owner: original two names remain?** | **No: both rewritten** | No: both rewritten | Yes: both retained |
| **Reflective public owner: original names remain?** | **Yes: both retained** | No: both rewritten | Yes: both retained |
| **Public `Object.keys` matches original** | **Yes** | **No** | **Yes** |
| **Exact four-module `run(a)` outputs for 100,000 held-out browser inputs** | **Yes** | No, reflected string keys changed; private/public numeric results exact | **Yes** |
| Original/source bytes available to hostile COO client | Yes | Yes | Yes |

The source inspection asserts these owner-specific rewrite results using the actual emitted `private-state.mjs` and `public-state.mjs` files, while the live Chrome loader validates **4,096 additional inputs plus 100,000 held-out inputs** with an exact JSON comparison of the full number/key-list/number return tuple. The unsafe mangler altered the two reflected field labels in every one of the first 4,096 probes; its numeric outputs still matched. Existing separate one-hop/transitive tests and host callback checks stayed green.

**Selected-work cost:** Twelve rotated-order **100,000-call** Chrome trials included the mixed four-module graph, native, compiler and the **safe globally reserved esbuild** variant. Compiler/native ratio of medians was about **1.000×** and compiler/reserved esbuild about **0.950×**, with 98.07% sign-rank median upper ratio bounds ≈1.053 and 1.056, respectively. Crucially **only 11 of 12 raw native/protected trial pairs were within 2.5×**; one first-trial compiler sample was **8.7 ms versus 2.7 ms native**, ~3.22×. The compiler/reserved esbuild lane also recorded **11 of 12** within budget. This might reflect startup, GC, JIT or scheduler noise, but causation is **unverified**. The hard project 2.5× rule cannot be certified from these observations. The earlier separate positive-only graph still had 12/12 samples within budget. Runtime numbers exclude module-loading and compile startup and are runner-specific.

## Decision

This result demonstrates a **real per-owner semantic selection capability** on an unchanged mixed module graph which **a single global source-property-name mapping cannot express** when the safe and private owners use the same field names. Compared with a blanket regex mangle, the compiler renames private fields and preserves reflective public keys. Compared with a global reservation rule, the compiler safely renames two otherwise blocked private fields.

This is **not** a proof of code secrecy, differential attack/deobfuscation resistance, unique feasibility versus source-aware manual preprocessing or a general-purpose esbuild flow analysis, nor a global 2.5× guarantee. Both source arms are client readable, and the original key spellings necessarily remain visible on the reflective public owner. The observed 3.22× single paired-work outlier is a strict budget concern. The project strong-security release remains **RELEASE-BLOCKED**.

**Reproduce:** `test/cross-file-imported-identity-browser.js`, manual workflow `.github/workflows/manual-imported-identity-alias.yml`, source `763e684f55c6bdbe86be662014f748886ef7084c`, [green CI 44948602571](https://github.com/FlareZ123/obfs/actions/runs/44948602571). Esbuild property-name behavior is documented in the [esbuild API](https://esbuild.github.io/api/#mangle-props).
