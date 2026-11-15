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

## What is established and what is not

The executable witness establishes a concrete cross-realm behavioral mismatch for the source patterns; the passing compiler tests establish their bounded post-repair refusal. This is not a proof of complete effect preservation. The analysis remains syntactic and does not model arbitrary containers, proxies, callbacks, dynamically computed aliases, native-method forwarding, monkey-patched global objects, or other first-class references to intrinsics. These unmodeled paths require a richer closed-world provenance/effect analysis or a conservative safety policy.

Rejecting unsafe migration preserves compatibility at the cost of eligible partition coverage. It does not improve the confidentiality of browser-delivered source, defeat authenticated SCO online relaying, enforce authorization independently of the server, or establish an application-level 2.5× runtime bound. The compiler runs at build time and the refused functions remain on the original side of the boundary.
