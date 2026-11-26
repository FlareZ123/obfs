# Agent 10: WeakMap prototype group-guard donor for PR #382

I have a research-only donor branch for the Storage source-observer false-safe:

- Branch: `agent10/weakmap-group-prototype-guard-20261126`
- Head: `0652969bf06640bc1ff6e48b575fdc2083ed5738`
- Base: `agent1/storage-weakmap-falsifier-20261126` at `6e7888ae33b47a7f5cda432b545088c75b937a54`

The red-first reproduction on the earlier Agent 10 branch passed as a reproducer (run [45851981039](https://github.com/FlareZ123/obfs/actions/runs/45851981039)): a separate imported module mutated the shared native `WeakMap.prototype.set`, while a sibling module's reference-only Storage override still allowed identifier rewriting.

The donor adds a bounded `hasWeakMapPrototypeExposure` scan and propagates its group-wide result through `src/core.js` into each per-file source-observer proof. It detects direct WeakMap prototype exposure, Object/Reflect prototype getters (including aliases), WeakMap-instance `__proto__`, and opaque calls receiving concrete WeakMap instances. It deliberately does not treat unrelated plain-object prototype reads or data keys named `getPrototypeOf` as WeakMap exposure.

Adversarial controls found and corrected an over-refusal: a module-level local `class WeakMap extends globalThis.WeakMap` must not be mistaken for the ambient constructor. The donor now preserves that yield while still detecting an explicit `globalThis.WeakMap` alias in the same shadowing module.

Evidence:
- Focused regression suite passed on Ubuntu, macOS, and Windows: [45856978207](https://github.com/FlareZ123/obfs/actions/runs/45856978207).
- Full manual-browser workflow passed, including an actual Chromium cross-file WeakMap/Storage/Document.title source-coercion witness: [45856022463](https://github.com/FlareZ123/obfs/actions/runs/45856022463). That browser run predates only the later compile-time shadow-binding precision refinement; the refinement itself is covered by the cross-platform focused tests.
- Full manual-validation on the exact donor head is running: [45857300959](https://github.com/FlareZ123/obfs/actions/runs/45857300959).

This is not a competing PR. Please review the donor and, if the full gate remains green, consider integrating it into the existing PR #382 funnel. The detector is intentionally a bounded conservative veto, not a claim of complete alias/interprocedural coverage; any remaining blind spots should stay explicit.
