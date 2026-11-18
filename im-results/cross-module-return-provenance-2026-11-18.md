# Multi-hop ESM-return and re-export host provenance

**Date:** 18 November 2026. **Author:** Agent 21. **Classification:** intermediate compiler compatibility result. It is not a public-source confidentiality result, a host lock, a global JS equivalence proof, or a 2.5× performance admission.

## Defect and trust boundary

The 18 November direct/imported host-return fix in [PR #84](https://github.com/FlareZ123/obfs/pull/84) tracked source-visible local function returns and their eventual invocations. A second imported ESM module could nevertheless forward the returned host Function through its own wrapper, or export it under a new name. The distributed source group was declared closed, yet a Node `--require` preloader supplied `globalThis.RUNTIME_FACTORY=Function` outside that group. The dynamically called Function performed `import('./state.mjs')` and inspected the original exported `state.secretField` key. Renaming that key changed native behavior: the original printed `[41,[3,["secretField"],41]]`, while delivered variants printed `[41,[3,["_p..."],null]]`.

The compiler must admit a renamed exported owner only when all relevant readers are proved to undergo equivalent rewrites. A runtime-only host-capability call can create an unlisted reader, invalidating the closed record's source-local shortcut. COO/SNO adversaries retain all public files, runtime access and tampering capabilities regardless of this safety repair.

## Held-out native ESM negative controls

The tests are appended to `test/cross-file-safe-record-read.test.js`, with a real Node 22 preloader, static source module graph, and fresh independent native/generated subprocesses. For **three new module-forwarding cases**, the unmodified compiler at `9b1a5ba49301ddd19271c5ad748496fe6ce7fee9` failed **3/3** on both Ubuntu and Windows in [CI 44239806455](https://github.com/FlareZ123/obfs/actions/runs/44239806455); previously passing cases remained 306/306. The cases were direct two-hop named imports, renamed named-import plus arrow wrapper, and a declared three-hop wrapper chain. A separate benign primitive-return forwarder still required one genuine private-record property rename and passed.

At `a2d8119a8364b987750ad4e4f422d6c68498fa63`, an opt-in conservative name-level transfer loop was added. A returned host factory's provenance propagates through the named/aliased imported factory's wrapper-return `CallExpression`, including namespace member calls. **309/309** targeted tests, the existing hostile browser gates and JSDoc passed on both platforms in [CI 44240053712](https://github.com/FlareZ123/obfs/actions/runs/44240053712).

Two additional re-export aliases were then declared in advance: direct `export {getFactory as forward} from './factory.mjs'`, and a two-hop renamed export chain. The test-only compiler pin `70df7493d32afb40d51f6297e41a67b4cc2ecf12` failed **2/2** on Linux and Windows, with 309 preceding tests still passing, in [CI 44240328883](https://github.com/FlareZ123/obfs/actions/runs/44240328883).

The pending candidate at `644b40ee1b4f78a53624f2de8db4fbe47ff889f6` carries named ESM export/re-export specifiers through the same provenance fixed point. Its 311-test native differential, positive yield, and full integration status must be verified before accepting or merging.

## Threat and cost limitations

The current mechanism uses conservative name-level joins rather than fully resolved per-binding, per-export points-to semantics; same-named unrelated functions may cause a safe property rename to be refused. It may miss transport through arbitrary dynamic property names, external callbacks, reentrant proxies, transient loaders, `export * as` namespace objects and unlisted module resolver hooks. A reported green suite is a bounded result over its exact fixtures. Unchanged private fields and successful offline cloning remain possible under COO/SNO. No new incremental security advantage over an equal-trust minifier is claimed.

The new analysis executes only in the obfuscator's compilation process. It does not add client runtime instructions; however, any claim about emitted runtime cost still needs source-pinned representative measurements. The project-wide strict 2.5× release veto and adversarial reconstruction results are unchanged.
