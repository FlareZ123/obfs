# SCO global-alias intrinsic-state compatibility: reproduced refusal repair

**Status:** Intermediate compiler compatibility evidence, 2026-11-15, Agent 29.
**Source:** `b3f076e450ba97115ceb700508a088f9bbc804be`.
**Pinned cross-platform workflow:** [SCO authorization run 43774605353](https://github.com/FlareZ123/obfs/actions/runs/43774605353), Ubuntu and Windows success.

## Failure mode

Selective SCO partitioning preserves chosen public exports in one JavaScript realm and executes selected async private exports in another. Mutable intrinsic objects such as `Math`, `JSON`, and `RegExp` are separate between Node VM contexts and likewise separated across a browser/server partition. The direct-write guard already rejected `Math.x=41`; the same underlying object can be reached through an alias of `globalThis` or by destructuring the global object.

A native same-realm check returns `41` after `const root=globalThis;root.Math.x=41;` and reading `Math.x`. With the writer run in the first VM context and reader in the second, the reader instead observes its default `0`. A direct private/public split admitting this source would therefore violate the original observable state-flow behavior. The JavaScript statements are original fixtures and the VM contexts are an executable independent witness; they do not rely on the obfuscator compiler's output.

## Bounded repair

`src/sco-selective-partition.js` now takes a fixed point over simple aliases of global roots in the existing realm-state classifier. It recognizes transitive immutable aliases, direct assignments, imported intrinsic aliases via a global-root member expression, and a static object-pattern destructuring of a known global root. The classifier then conservatively refuses writes to the aliased builtin object, as well as accesses to legacy `RegExp` match statics through the alias. A matching near-neighbor with only `root.Math.PI` and a public read of `Math.PI` remains admissible.

The new `test/sco-intrinsic-global-alias.test.js` includes six Math writer spellings, one transitive JSON writer, the RegExp match-statistic reader and an allowed pure math control. Each stateful writer has an independent native-versus-isolated Node VM observation. This suite was added to the manual SCO gate, which succeeded on Linux and Windows at the exact source commit above.


## First-class intrinsic carrier extension

An additional source-level witness preserves an intrinsic reference in a local carrier and changes it without an apparently direct builtin write. For example, `const box=[Math];box[0].__obfsCarrierCanary=41;` followed by `Math.__obfsCarrierCanary??0` yields 41 in the original VM realm, and 0 when the writer and reader execute in separate VM contexts. Seven variants in `test/sco-intrinsic-carrier.test.js` cover direct and global-root references, array/object wrapping, `JSON`, `Object.assign`, and an identity function. The compiler now refuses observable first-class builtin escapes except narrowly recognized direct member reads, calls, and tracked local aliases. The positive control `const Native=Math;return Native.imul(3,7)` with independent `Math.PI` read remains admitted.

The first carrier-specific gate initially failed because it classified `typeof window`, a proven locally shadowed `window`, and `globalThis` destructuring into browser-only state as intrinsic escapes. Those requests already had dedicated ambient-state checks and their existing tests expected those diagnostic paths. The final guard excludes bare `window`/`self`/`global` from this new carrier path and permits simple object-pattern destructuring so the established ambient checks run. These failures are retained in GitHub Actions: [first gate 43775144966](https://github.com/FlareZ123/obfs/actions/runs/43775144966) and [second gate 43775312594](https://github.com/FlareZ123/obfs/actions/runs/43775312594).

**Pinned final carrier validation:** [manual SCO run 43775433462](https://github.com/FlareZ123/obfs/actions/runs/43775433462) passed Linux and Windows at exact source `b8338fc5f3cdf4f685515906c087b31104fec7c5`, including the new carrier and global-alias regressions, existing ambient/prototype/RegExp suites, tests of authorized RPC and selective public/private helpers, the SCO sample adversarial scripts, Chromium browser steps and JSDoc checks defined in the workflow. No whole-application 2.5× measurement specifically isolates the carrier guard, which is a build-time analysis that refuses unsafe partitions.

**Remaining admission/security limits:** Proven builtin references returned as values or carried through general callbacks are conservatively refused, potentially excluding benign applications. Scope-sensitive shadowing and dynamic property provenance remain incomplete. An attacker controlling the browser can still modify or instrument all public code, and an authorized server RPC may still serve as an unlimited-query oracle.

## What is established and what is not

The executable witness establishes a concrete cross-realm behavioral mismatch for the source patterns; the passing compiler tests establish their bounded post-repair refusal. This is not a proof of complete effect preservation. The analysis remains syntactic and does not model arbitrary containers, proxies, callbacks, dynamically computed aliases, native-method forwarding, monkey-patched global objects, or other first-class references to intrinsics. These unmodeled paths require a richer closed-world provenance/effect analysis or a conservative safety policy.

Rejecting unsafe migration preserves compatibility at the cost of eligible partition coverage. It does not improve the confidentiality of browser-delivered source, defeat authenticated SCO online relaying, enforce authorization independently of the server, or establish an application-level 2.5× runtime bound. The compiler runs at build time and the refused functions remain on the original side of the boundary.
