# Parser-written Subresource Integrity split across HTML write fragments

**Status:** Merged to main after source-pinned Ubuntu/Windows and real Chromium comprehensive validation.
**Scope:** Browser `document.write` and `document.writeln` calls resolved to a known document receiver in the published JavaScript graph.
**Decision:** Compatibility-only; no hostile-runtime confidentiality, integrity-enforcement, host admission or universal CPU-budget claim.

## Mechanism

The WHATWG [HTML document-write steps](https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html) concatenate a single invocation's arguments before inserting them into the parser stream. The tokenizer may also retain a partial tag across successive parser-active `document.write` calls. A JavaScript bootstrap can therefore construct an SRI-pinned external script from fragments that contain no individual literal spelling `integrity=`:

```js
document.write('<script src="./client.js" integ',
               'rity="sha256-<digest>"></script>');
```

The old observer in `src/ast.js` inspected each argument independently for `/integrity\\s*=/iu`. Both strings looked benign in isolation, so the obfuscator transformed `client.js` despite the browser's SRI check applying to its original bytes. A two-call variant also carries a dangling start-tag prefix across parser writes. The source-byte graph observer must treat this as possible SRI metadata even when no static HTML asset has an `integrity` attribute.

## Red-first evidence

At exact source `5a54b1b80962f63567a0e786ad030f41fe4c5500`, the new cross-mode Node regression in `test/html-asset-disclosure.test.js` failed on the first split-argument example, while all 27 existing HTML asset cases passed. [Focused Ubuntu/Windows run 45071500060](https://github.com/FlareZ123/obfs/actions/runs/45071500060) records the failure and actual transformed sibling bytes. The case has a no-SRI positive control proving the chosen compilation options would otherwise transform `client.js`.

## Bounded repair and independent controls

The candidate joins all proven static arguments of each `document.write` or `writeln` invocation before checking for an `integrity` attribute. An unknown or spread argument conservatively observes original source, as before. A known literal ending inside an incomplete HTML start tag is now also treated as a possible source-byte commitment because a later parser write may complete it. This is deliberately overconservative in some inert fragments, including partial unrelated markup.

The source-pinned [focused two-platform green run 45071642242](https://github.com/FlareZ123/obfs/actions/runs/45071642242), at code SHA `0416154e66f3c4ee13c8e071b498a68b2244c9d9`, passed all 28 cases. A stricter positive control for a complete, argument-split, **un-pinned** script was added at SHA `08f4c64c35ef6558e1f6e871c4f5472deaad2753`, and [focused two-platform run 45071876133](https://github.com/FlareZ123/obfs/actions/runs/45071876133) passed. The ordinary literal script and the concatenated multi-argument unpinned script both retained nonzero obfuscation yield.

The real-browser harness `test/document-write-sri-browser.js` now tests both multi-argument and successive-call fragmentation. For each variant it serves native, protected and intentionally byte-mutated JavaScript to a real Chromium instance; native and protected must execute, while the mutated file must fail SRI verification. This browser step itself passed in [manual Chromium run 45071683975](https://github.com/FlareZ123/obfs/actions/runs/45071683975) at SHA `ac1d57ea567311eeee03a1f278c0efa8d048e816`; the complete real-browser workflow also passed; see the final exact-source gate below.

## Remaining boundaries

These are a finite syntactic refusal rule and a real-browser observation for two chosen fragment families. Arbitrary higher-order aliases of Document methods, host-provided writes, dynamic HTML fabrication across unknown modules, and other source-byte observation channels remain unproved. A standalone distributed client cannot cryptographically enforce its own SRI policy against an attacker who can replace the complete host environment. This fix changes the obfuscator's build-time refusal analysis; it does not impose runtime compute overhead on the tested original-byte-preserving output.

## Final integration and exact executable source

At frozen [PR #300](https://github.com/FlareZ123/obfs/pull/300) candidate SHA `6b9bb589c56d6b4657f05205391385720e273faf`, the full [Ubuntu/Windows Node22 validation 45072012796](https://github.com/FlareZ123/obfs/actions/runs/45072012796) and complete [real-Chromium workflow 45072036982](https://github.com/FlareZ123/obfs/actions/runs/45072036982) **both passed**. PR #300 merged to main at `ad7ea18859d951724adb5b89835c59017c622f96`. The runtime implementation blob `src/ast.js` (`606cb4825fa1a73e917adf13bf0f3fbf608ff728`), Node regression (`16cd4c8b8b19fe9c8a625d1b5dff0c73b70f3a67`) and expanded browser harness (`4cfb38f07ffd5a5797facc5918a17ba5cfdb02dc`) were verified byte-identical between the green candidate and merged main. The complete repository trees differ because unrelated identity and documentation changes occurred concurrently. This evidence establishes the specified compatibility examples only.
