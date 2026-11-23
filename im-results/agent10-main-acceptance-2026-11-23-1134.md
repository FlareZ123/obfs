# Agent 10: source-pinned comprehensive admission at 11:34 UTC, 23 November 2026

**Scope:** intermediate full-suite acceptance evidence; this is a frozen engineering receipt, not a security result or certificate for moving `main`. **Author:** Agent 10. No obfuscator or test implementation changed in this investigation.

## Exact provenance

- Source: [`8b2d5c0661ab7fbe49f2b7cc0aff28a2ca7cf1c7`](https://github.com/FlareZ123/obfs/commit/8b2d5c0661ab7fbe49f2b7cc0aff28a2ca7cf1c7).
- Workflow: [full, nonfocused manual validation run 45166435075](https://github.com/FlareZ123/obfs/actions/runs/45166435075), completed failure. The workflow executed both `node22` OS matrix jobs. The `focused` job was skipped.
- GitHub Actions jobs: Windows `137664485208`, Ubuntu `137664485245`. Read the **failed-jobs-only**, 300-line-tail logs from the GitHub Actions log interface, including the machine-readable `FAILED_TEST_INDEX`. Read named step conclusions independently via the jobs endpoint.

| Operating system | Tests | Pass | Fail | Skip | Only failed workflow step |
| --- | ---: | ---: | ---: | ---: | --- |
| Windows / Node 22.23.4 | 5,151 | 5,124 | **17** | 10 | Behavioral/adversarial suites |
| Ubuntu / Node 22.23.4 | 5,151 | 5,130 | **18** | 3 | Behavioral/adversarial suites |

Both jobs passed the project and external strict JSDoc checks, specialized typechecks, and sampled performance steps. Ubuntu separately passed the actual Chromium module/host-lock, null-prototype and ESM observer checks. These are **steps passed**, not universal correctness, source-confidentiality, strict 2.5× compute, or release claims.

## Cross-platform failure intersection

Exactly **17 test cases** share the same title/path and observed positive-yield failure on both OSes. All 17 had a property count of **0** where a positive count was expected, or an equivalent `false` versus `true` transformed-work predicate. This is a stronger classification than the generic `run failed` status; it is **not** a proof that assertions after these first failures would pass.

| Family | Shared failure count | Files and meaning |
| --- | ---: | --- |
| Bound Blob, primitive options | 2 | `blob-constructor-alias-source-observer`, `blob-options-function-source-observer` |
| Bound-function interception and stable exports | 4 | `bound-runtime-interception`, `bound-runtime-minifier-control`, `sno-bound-runtime-interception`, `source-stable-bound-export` |
| Factory, named readers, cross-file owner flow | 4 | `factory-object-flow`, two cases in `function-declaration-reader-proof`, `interfile` |
| Fully local class, cold private tuple | 3 | Two COO/SNO cases in `private-class-source-yield`, one in `private-tuple-session` |
| Symbol key generation and recovery | 4 | `symbol-key-static-recovery` and three in `symbol-keys` |

The **18th Ubuntu-only** failure is `test/sco-step-only-live-rpc.test.js` (five-state SCO with matched minified control), whose extracted failure error is **`fetch failed`**. No matching Windows failure appeared. This indicates an additional HTTP transport or harness error at that source; its actual cause and reproducibility have **not** been established. Do not silently fold it into the 17 shared compiler-yield failures or dismiss it as known flakiness.

## Historical comparison

The earlier full run [45136105520](https://github.com/FlareZ123/obfs/actions/runs/45136105520) at `72e1c170b28b165c150a12df1d12ee21cf4b891c` had **5,126 tests** and the *same 17 positive-yield case titles* on both platforms, per its full failure index documented by Agent 1 (`communications/agent10/20261123T1017Z_agent1_full-gate-failure-inventory.md`). The present source contains **25 more Node tests**; Windows has the same 17 red and 25 additional passes. This is evidence of a persistent acceptance stopline across two **different source and suite revisions**, not an attribution of specific code changes. The single Ubuntu transport error changes its failed count to 18.

The previously preserved [07:21 frozen full-run report](mainline-full-validation-2026-11-23-0721.md) had 18 shared positive-yield failures, including `property-hotpath-closedworld`, which is absent from this 11:34 list. Without the two source diffs and a dedicated isolated retest, this absence does not certify its root cause was fixed.

## Decision and actionable acceptance rules

**RED: full mainline admission is not established at this pin.** Agent 10 should continue owning the complete-run receipt; Agent 3 remains canonical compiler-integration owner. Keep source-observer and decoder branches as evidence until a single exact-source candidate is ready. Disposition each shared failure as an independently proved safe missed transformation, an incompatible source-visible positive expectation, or an unproved case. Do not waive a genuine safe-positive work loss just to obtain green.

One concrete source-contract issue is visible directly in the `Blob` primitive positive fixture: it exports `module.exports=()=>owner.hiddenCount+owner.secretDelta`. The current private-callable proof refuses owner member rewrites inside that exported arrow. External `Function.prototype.toString` on that public arrow would reveal the transformed member spelling, regardless of whether the fixture's in-module `observesFunctionSource` helper reports false. Moving the member read into a uniquely called, nonescaping helper is a possible distinct positive control, but **must be retested**. The bound-function positives likewise deserve separate pre-import `.bind` interception parity assessment before a global guard relaxation.

A future full-green receipt must include exact commit SHA, full Node22 two-platform jobs, all mandatory step conclusions and positive transformation witnesses at the same source; the independent [receipt classifier](full-vs-focused-ci-receipt-provenance-2026-11-23.md) supplies a programmatic gate. Preserve the overall three-mode **RELEASE-BLOCKED** decision.
