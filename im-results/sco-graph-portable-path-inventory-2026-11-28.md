# Portable private ESM graph path-inventory admission

**28 November 2026 · Agent 31 · intermediate compatibility and source-publication preflight evidence.** This is a bounded compiler hardening contribution, **not** an established strong-obfuscation theorem, an anti-relay result, or a global 2.5× runtime guarantee.

## Defect and causal repro

The two graph composers `src/sco-graph.js` and `src/sco-selected-graph.js` previously used a `filename.toLowerCase()` comparison to identify duplicate source paths. This was weaker than the existing shared `src/portable-paths.js` path inventory used for output admission. It missed (among other cases) two filenames whose NFC-normalized spellings agree, two names whose uppercase but not lowercase mappings agree (Greek final sigma), distinct regular files under ambiguous case-spelled ancestors, and an impossible file/directory overlap. The latter two can make the compiler's asserted source graph differ from what a target filesystem can represent. Path checks are therefore necessary **before** the compiler declares a closed, deployment-verifiable private module graph; an audit of ESM imports is not a replacement for stable path identity.

A deterministic new test file, `test/sco-graph-portable-paths.test.js`, constructs syntactically valid, dependency-free async ESM sources with both file orders for each case. It supplies positive controls with distinct canonical nested paths. The failing cases are:

| Alias class | File 1 | File 2 |
| --- | --- | --- |
| NFC | `src/é.mjs` | `src/e\u0301.mjs` |
| Uppercase collision | `src/ς.mjs` | `src/σ.mjs` |
| Ancestor case alias | `Private/api.mjs` | `private/secret.mjs` |
| File-as-directory | `entry.mjs` | `entry.mjs/dependency.mjs` |

The first graph-only red-first test was committed in `00ba436b127d36a5a2a9605128f2b432c37e1848`, with a pinned dispatch at [GitHub Actions run 46119491300](https://github.com/FlareZ123/obfs/actions/runs/46119491300). Subsequent `b31bfe3f` extended the same tests to the selected graph. **Do not infer red or green from a queued run; inspect its completed conclusion and failed job logs.**

## Narrow implementation

The new `partitionScoAsyncGraph` implementation imports `createPathInventory` and `registerFilePath` from the shared `src/portable-paths.js` module, and records every source path before parsing or selecting exposed modules. This rejects aliases and ancestor collisions with the same conservative rules as public output inventory. Code commit `835cc9c546c766cf06f85f443e60d55f934ae848`.

The `partitionScoSelectedGraph` composer now uses the same shared inventory, but separately records exact path spellings. Exact repetition is **required and allowed** because distinct graph units can independently audit the same private source; digest-by-path consistency checks and duplicate public-output checks continue to operate. A newly seen spelling is admitted to the shared inventory before the next source is registered. Code commit `d7bbc0ac693d23b06bc8a3377323fc0230dd84ed`.

The changed compiler checks are server-startup-only and do not add per-request CPU work. They conservatively refuse some graphs that Linux might store as distinct files. `portableKeys` implements two NFC-normalized upper/lower keys, **not a complete filesystem-equivalence theorem**; symlink/hardlink aliases, filesystem-specific Unicode behavior, and undeclared dynamic imports remain outside these checks. Trusted integrators still must execute `verifyScoPrivateSourceDigests` against deployed source roots and keep those files stable until loading.

## Validation and integration boundary

The change is isolated on the draft [SCO graph batch PR #339](https://github.com/FlareZ123/obfs/pull/339) rather than being presented as release-ready main. The PR was first reconciled with main snapshot `2b6f47e17cc6e412e6858146780abcdc007f80e3` in two-parent branch commit `712e5ba3c0d2e917d7736cb1a2dcef3bcc7bef34`. The pre-hardening graph batch-focused Ubuntu/Windows [run 46119408593](https://github.com/FlareZ123/obfs/actions/runs/46119408593) passed at that pin. The broad same-source run [46119411817](https://github.com/FlareZ123/obfs/actions/runs/46119411817) was separately dispatched.

The hardened branch has focused two-platform jobs for [new path tests 46119595901](https://github.com/FlareZ123/obfs/actions/runs/46119595901), [existing selected graph integration 46119599245](https://github.com/FlareZ123/obfs/actions/runs/46119599245), and [existing graph batch preflight 46119602781](https://github.com/FlareZ123/obfs/actions/runs/46119602781), all pinned to `d7bbc0ac693d23b06bc8a3377323fc0230dd84ed`. Verify their actual conclusion before upgrading any claim. A later docs-only commit cannot retrofit those receipts, although it does not change the JavaScript runtime.

This is source-admission compatibility engineering. The wider obfuscation project's release decision remains **NO-GO** pending actual source-pinned compatibility, protected transformation yield, independent equal-trust attacker-cost advantage, environment resistance, and correct-boundary compute-budget evidence.

## Verified red/green outcome (28 November)

The red-first [two-platform run 46119491300](https://github.com/FlareZ123/obfs/actions/runs/46119491300) at original compiler pin `00ba436b127d36a5a2a9605128f2b432c37e1848` **failed on both Ubuntu and Windows** in the intended negative test: the first NFC alias `src/é.mjs` versus `src/e\\u0301.mjs` produced “Missing expected exception”; the distinct positive-control graph passed. This is a confirmed executable counterexample, not just a suspected path mismatch.

At patched production-source pin `d7bbc0ac693d23b06bc8a3377323fc0230dd84ed`, the [portable alias tests 46119595901](https://github.com/FlareZ123/obfs/actions/runs/46119595901), [selected-graph integration 46119599245](https://github.com/FlareZ123/obfs/actions/runs/46119599245), and [composed-graph batch policy 46119602781](https://github.com/FlareZ123/obfs/actions/runs/46119602781) **all completed successfully on Ubuntu and Windows**. Focused workflows run strict project/external/paired-budget JSDoc checks as configured. The focused outcome supports only these bounded path/graph regression controls, not general application compatibility or an attacker-cost advantage.

## Follow-on defect in the shared tree policy (28 November 2026)

After making the two graph composers share the portable output inventory, I audited that inventory against the **Unicode 17 full default casefold data**, and found that its two one-step `toLowerCase()`/`toUpperCase()` collision keys were still incomplete. These are executable single-path aliases, not just lookalike glyphs:

| Input A | Input B | Old NFC lowercase match? | Old NFC uppercase match? | Unicode 17 C+F full fold |
| --- | --- | --- | --- | --- |
| `src/ϑ.mjs` (U+03D1) | `src/ϴ.mjs` (U+03F4) | **no** | **no** | both map to `src/θ.mjs` (U+03B8) |
| `src/ẞ.mjs` (U+1E9E) | `src/ss.mjs` | **no** | **no** | both map to `src/ss.mjs` |

Independent source: Unicode Consortium [CaseFolding-17.0.0.txt](https://www.unicode.org/Public/UCD/latest/ucd/CaseFolding.txt), including C/F rows for U+03D1, U+03F4 and U+1E9E. Linux ext4 supports per-directory +F casefolding and compares normalized/casefolded names; this is a **specific filesystem-configuration risk**, not an assertion that all Linux or Windows directories alias these names ([Linux ext4 documentation](https://www.kernel.org/doc/html/v5.2/admin-guide/ext4.html), [full casefold implementation discussion](https://lists.openwall.net/linux-ext4/2019/04/13/16)).

An independent second class is the `Default_Ignorable_Code_Point` category: `src/api<U+200B>.mjs` may be normalized to a visible name without U+200B on some casefolded volumes; a directory segment `..<U+202E>` may fold to `..`. Linux's [19 November 2026 ext4/f2fs patch series](https://lkml.indiana.edu/hypermail/linux/kernel/2611.2/14760.html) explicitly describes `utf8_casefold()` stripping default-ignorable characters and proposed rejects for names folding to empty/`.`/`..`. This is **upstream patch evidence, not a reproduced filesystem exploit or a claim that the patch has shipped**.

### Pinned causal red/repair sequence

- [Red-first source `b98615097ea48b0864add082488de055b102615c`](https://github.com/FlareZ123/obfs/commit/b98615097ea48b0864add082488de055b102615c): extends the executable graph and selected graph tests to both casefold pairs, both input orders, plus direct portable `safePath` rejection of U+200B, U+202E and U+FE0F. [Two-platform red Actions 46122340525](https://github.com/FlareZ123/obfs/actions/runs/46122340525) **failed as intended on Ubuntu and Windows**, explicitly reporting `Missing expected exception` for `src/ϑ.mjs` versus `src/ϴ.mjs`, and `Missing expected exception` for default-ignorable paths.
- [Source patch `6587eae1dffb33a564630df1f3b77d1204f6da6e`](https://github.com/FlareZ123/obfs/commit/6587eae1dffb33a564630df1f3b77d1204f6da6e), then [Unicode regex corrected `48f4ba233063dcdc1be07f5bd05be8c3020dbe17`](https://github.com/FlareZ123/obfs/commit/48f4ba233063dcdc1be07f5bd05be8c3020dbe17). `portableKeys()` retains its original lower and upper keys **verbatim** and adds `upper().lower()` and `lower().upper()` NFC-normalized independent keys. Thus, under the unchanged inventory algorithm, **any exact old key collision is still rejected**; the newly confirmed alias families are also rejected. `safePath()` now conservatively rejects any Unicode `Default_Ignorable_Code_Point` code point rather than risk platform-specific invisible-stripping paths; error text avoids echoing bidi control characters.
- The [source-pinned green workflow 46122453409](https://github.com/FlareZ123/obfs/actions/runs/46122453409) was dispatched at `48f4ba23`. **Its verdict must be inspected before claiming green.**

The policy is **conservative**: it may now refuse otherwise legitimate Unicode filenames, including strings with a variation selector, even on case-sensitive volumes. Renaming those files is intentional for cross-platform deployment safety. The four-key scheme is **not** a complete implementation of Unicode full case folding or an absolute model of ext4, NTFS, APFS, symlink/hardlink aliases, filename normalization versions, or filesystem names stored outside the declared output tree. The new full-casefold examples establish a verified deficit in the former implementation and a bounded repair of those examples only. This is **build-time source-deployment admission**, not an anti-instrumentation or 2.5× hot-compute security result.

