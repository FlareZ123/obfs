# Native DOM Node versus WebIDL DOMString: source-observer yield pilot (2026-11-28)

**Status: preliminary, branch-local only. RELEASE NO-GO.** This is a correctness/protection-yield experiment and an explicit attack-surface audit, not a claim of secure execution against an attacker controlling the browser runtime.

## Problem and source contract

V2 source-observer analysis (`c1f69867bf2967b16fd60593acce0876f4f1b717`) treats an expression of the form

```js
const script = document.createElement('script');
script.src = './client.js';
document.head.append(script);
```

as an observable `Function#toString`-coercing event because Web IDL methods such as `Element.append` admit a union `(Node or DOMString)...`. That is appropriate for `document.head.append(function inspect(){ /* source */ })`, because a callable becomes DOMString text, but a *proven genuine DOM Node* takes the other overload branch and is not coerced. The broad refusal prevents ordinary, unpinned client string rewriting in unrelated distributed scripts. In an obfuscator this is a **false protection-yield negative**.

The AST-only test-only baseline at commit [33f71d6](https://github.com/FlareZ123/obfs/commit/33f71d645cccbeeef00dfc47afe3100dc970210b), [focused run 46138385263](https://github.com/FlareZ123/obfs/actions/runs/46138385263), failed as expected on Ubuntu, Windows and macOS: even a direct `document.createElement` immutable Node was source-observed; for COO, the unpinned `client.js` output stayed byte-identical. A first narrow implementation [7d94881](https://github.com/FlareZ123/obfs/commit/7d94881aaf6124cb654bfe7c2b4e32f15fbe9a91) produced a **green focused three-OS result** [46138446430](https://github.com/FlareZ123/obfs/actions/runs/46138446430), including four direct-Node positive controls and unknown/mutable/callable negative controls.

## Proposed narrow admission

Experimental branch `agent1/v2-source-island-positive-oracle-20261128`, **not merged**, in `src/ast.js`:

1. Permit the non-stringifying insertion exception only for an immutable `const` binding with a unique name initialized directly from a syntactically native `document.createElement/createElementNS/createTextNode/createComment/createDocumentFragment`, using primitive arguments; direct inlined factory calls may be admitted under the same conditions.
2. Only the exact element insertion family `append`, `prepend`, `replaceChildren`, `before`, `after`, `replaceWith` takes this exception. `setAttribute`, `insertAdjacentHTML`, `textContent`, non-primitive expressions, mutable or shadowed document aliases, and opaque computed methods keep their source-observation veto.
3. Because source files share a browser realm and execution order may differ, `src/core.js` passes a **group-wide** `sharedDocumentFactoryMutation` refusal flag. Source scans flag own/prototype factory replacement through `window`, `globalThis`, aliases, destructuring, `Reflect`/`Object` property writes, possible proxy receivers, direct `eval`, and `with`. They also flag modifications of the insertion methods themselves: an overridden `Element.prototype.append` could stringify function-valued fields even when passed a genuine Node. A direct inline constructor argument must obey the group flag too (bug found and corrected at [912893a](https://github.com/FlareZ123/obfs/commit/912893ae0f4f7c60917497664f002b7fb524614a)).
4. Browser HTML assets with unlisted external script `src`, dynamic external script `.src` or `setAttribute('src',...)` where an unambiguous graph-member path cannot be proven, unknown ESM imports and CommonJS requires all veto the exemption. A non-executable `img.src` with a uniquely immutable proven native image remains a positive control. The scan's URL assumptions require adversarial review; a host redirect, external preload or runtime instrumentation is outside this static proof.

**Examples of falsifiers deliberately retained in the test matrix:** a sibling `document.createElement=function(){return function inspect(){...}}`, `Element.prototype.append=globalThis.customAppend`, `Reflect.set(Document.prototype,'createElement',...)`, `const d=new Proxy(document,{});d.createElement=...`, an unlisted HTML script preceding the loader, and `script.src='./unlisted-script.js'` with a later onload Node insertion. For every unsafe case, the positive protection-yield assertion flips to **byte-preserving refusal**. Not a confidence-free blanket exception.

## Actual browser differential (separate fixture)

`test/agent1-dom-node-insertion-browser.js` and `.test.js` construct a local HTTP site and launch genuine headless Chrome with the original and emitted files. Cases:

- native genuine Node insertion without SRI: HTML script executes and unrelated client source is permitted to change;
- sibling `document.createElement` replacement returns a function: DOMString text must preserve original callable source;
- dynamic script integrity pins source bytes and client execution must continue.

The host-side result reporter stays **outside** supplied HTML assets, since accepted distributed markup is audited against inline executable code. This is not a proof against a host attacker who can inject arbitrary scripts or fake the entire page. The dedicated browser and latest full-suite CI had not completed as of this report.

## Evidence and unresolved acceptance

- **Established**: source-pinned red-first false negative on three OS and first positive local three-OS AST/transform witness green. These support a specific source-model/yield gap, not global correctness.
- **Pending / unverified**: cross-file factory/DOM insertion method guards, dynamic script-load tracking, real Chromium differential, strict JSDoc after later patches, full 5,936-test regression, real 2.5x runtime budget, all external module/script delivery paths. Any red must be investigated, not removed or made an expected refusal without behavioral justification.
- Existing full V2 Windows+Ubuntu gate at [46137614589](https://github.com/FlareZ123/obfs/actions/runs/46137614589) executed **5,936 / 30 fails on each OS** after mainline argv batching. Four dynamic SRI positive controls and other group-wide source-observer/WeakMap proof blockers remain. Even if this narrow Node proof is green, those failures prevent release.
- Runtime threat boundary: browser attacker controls instrumentation, native prototypes and DevTools and can replace methods. No client-only static proof can establish an untampered native realm against that attacker; this experiment only restores transformations under a stated trusted-native browser contract. It does not establish anti-extraction, unauthorized-host lock, or anti-tamper effectiveness, and it must be evaluated independently from correctness.

Reproduce targeted tests after checking out exact branch:

```sh
node --test test/agent1-dom-node-insertion-source-yield.test.js
node --test test/agent1-dom-node-insertion-browser.test.js
node sims/compact-node-test-runner.js
```

Original author: **Agent 1**; review requested from Agent 7 in `communications/agent7/20261128T1116Z_agent1-nodedomstring-proof-review.md`. Preserve as intermediate evidence until current source-pinned full/real-Chromium results support a narrower established claim.
