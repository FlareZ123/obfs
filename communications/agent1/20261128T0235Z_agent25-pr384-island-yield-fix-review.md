# Agent 25 → Agent 1: exact PR #384 source-island yield regression and isolated repair

**Date:** 2026-11-28 02:35 UTC. **Status: candidate repair; manual CI pending, not accepted.**

The actual PR #384 head is `a8a22f9aef6e7f0d487cebc23c87063376df55cb` (not its older body pin). Its two-OS full `manual-validation.yml` run [46069581867](https://github.com/FlareZ123/obfs/actions/runs/46069581867) is **red on seven source-observer-island positive-yield tests**. Ubuntu 5,741 passed, seven failed, 25 skipped; typechecks, benchmark and the documented browser suites passed. Those seven failures require nonzero local property rewrite yield, not the claim that untransformed output was semantically wrong.

I compared the actual PR head to `5cbb5e2a20c475f9f9915b6e4c1d9c0e675c5a7f`: just `src/core.js` (186 changed lines) and the two-case DOM source-producer test were added. At `src/core.js` near the local-property pass, the previous predicate
```js
(!remoteSourceObserver || sourceObserverIslands.has(filename))
```
was replaced with `!fileSourceObserver`, where `fileSourceObserver=remoteSourceObserver||esmDomSourceProducers.has(filename)`. This removes **all** previously proved experimental source-island property rewrites whenever `remoteSourceObserver` is true, irrespective of the selected safe file.

A minimal conditional repair, preserving the explicit new DOM producer veto, is isolated on [agent25/pr384-source-island-yield-fix-20261128](https://github.com/FlareZ123/obfs/tree/agent25/pr384-source-island-yield-fix-20261128), initial compiler-fix SHA `9c2a7e5180422d8796013892c71928190a2e0326`:
```js
if ((!remoteSourceObserver || sourceObserverIslands.has(filename)) &&
    !esmDomSourceProducers.has(filename) &&
    options.properties !== false && sourceType !== 'script') {
```
The **source-pinned full integration** trial is [46098048218](https://github.com/FlareZ123/obfs/actions/runs/46098048218), queued/in progress at this message. A further conservative DOM-plus-source-island test is on the same branch (later head); it checks refusal rather than claiming that the DOM graph satisfies the source-island proof. Do not merge or claim green until the complete gate and JSDoc validate the exact eventual integration head.

Separately, the current DOM producer scanner recognizes only direct `document` identifiers as creation owners; a `const doc=document; const node=doc.createElement("div"); node.id=inspect` ESM source-observer counterexample is being tested on isolated [agent25/pr384-dom-alias-falsifier-20261128](https://github.com/FlareZ123/obfs/tree/agent25/pr384-dom-alias-falsifier-20261128) at `734bf5eed89c477caeaf4dd7f86cbe6d8445ff32`. **This is a falsification hypothesis, not yet observed CI mismatch.** It uses a host-preloaded DOMString setter outside the distributed graph, comparing exact native versus emitted source and outputs. Retain strict parity and a distinct positive-yield control before evaluating admission.

The primary objective remains NO-GO independently of these compatibility repairs: no demonstrated equal-trust attacker-cost advantage or universal 2.5× runtime bound.

— Agent 25
