# Getter/setter descriptor carrier false-safes on the current-main WeakMap review candidate (27 November 2026)

**Status:** Executed, source-pinned negative compatibility evidence; **not** an integrated production fix, a full three-mode launcher receipt, an academic result, or a proof of universal source observability.

- Production base: `ceaa71275025f0df2a9b346b991707c6510a286c` on `agent46/current-main-acceptance-review-20261127`; `src/ast.js` blob `e968da36666fb8540ec00be014e104495e3cad31`. No production source changes in either falsifier child.
- Test-only child 1: `a9de319edcf46b54c980695d0622becb8c8a9f28` (three added cases), focused run [46072342261](https://github.com/FlareZ123/obfs/actions/runs/46072342261): **44/46 pass, 2 fail** on Ubuntu, Windows and macOS.
- Test-only child 2: `d79842837ad35633742a59831256a99dbe3e8405` (nine added cases), focused run [46072475030](https://github.com/FlareZ123/obfs/actions/runs/46072475030): **47/52 pass, 5 fail** on **each** of Ubuntu, Windows and macOS. Native checks run separately on Node v22.16.0 and workflow Node v22.23.4.
- Existing suite: `test/agent3-weakmap-cfg-matrix.test.js`. Actual three-file ESM execution with an observable native-prototype `.set` override and mocked DOMString title setter. The three mode labels exercise `obfuscateFiles` core API; **not** standalone SCO HTTP, SNO launcher, or real browser.

## Exact failures and controls

Five *new* native-WeakMap-positive tuples all show `nativeShared:true`, `group:false`, `local:false`, `bindings:4` and `parity:false` in each of COO/SCO/SNO. The native captured function has `const privateLocal=29;`, while emitted source has a seeded `_v…` name. The five failing names:

1. `accessor-getter-then-setter`: `get instance(){return new WeakMap()}` followed by `set instance(v){}`, then `function clear(){carrier.instance=0}; clear()`.
2. `accessor-setter-then-getter`: accessor declarations in the reverse order, same helper call.
3. `accessor-get-then-set-no-write`: declaration only; no assignment.
4. `accessor-get-then-set-direct-write`: direct assignment to the no-op accessor.
5. `accessor-get-then-set-alias-write`: assignment through an alias of that same object.

Four additional cases pass: getter/setter in the reverse order with no write, getter-only with no write, getter-only with a caught strict-mode assignment, and the non-WeakMap `Ordinary` getter+setter positive-yield control. The last one has `nativeShared:false`, exact output parity and **four** rewritten bindings in all three modes, demonstrating that the tested compiler can still rewrite a benign object case. Existing 43 baseline tests remain green. A test that merely has no rewrites in a native-positive case is a conservative refusal, not evidence of successful obfuscation.

## Grounded source analysis (hypotheses for owner to verify and correct)

- `src/ast.js` ~1402–1427: `evaluateCarrierValue(ObjectExpression)` stores one *value* per static property key. A `get` becomes `carrierMaybe` when a WeakMap may be returned; a subsequent `set` overwrites that map entry with `carrierOther`. Native object literals **coalesce getter and setter of the same name** into one accessor descriptor regardless of their declaration order; the getter remains callable. This explains the no-write get→set counterexample and the order-sensitive safe get/set baseline.
- ~1748–1767: `visitCarrierExpression(AssignmentExpression)` assumes a statically keyed member assignment writes `base.properties.set(key,assigned)` on a container, without modeling an accessor setter. A no-op setter does not replace the getter's return value, even when the write is through an alias. Direct and aliased false-safes reproduce independently of helper-local transfer.
- ~1599–1615 and ~1627–1654: `provenDefiniteLocalSlotWrite` treats `base.kind==='container'`, `!base.unknown`, and `base.properties.has(key)` as sufficient proof of an *own data slot*. The abstract record contains no data-vs-accessor descriptor kind. In the failing local-helper cases, a no-op setter can be treated as a definite overwrite, incorrectly pruning the existing WeakMap path.

**Fix obligation:** model descriptor kind and object-literal getter/setter coalescing, preserving accessor read results independent of source order; never drop the old may-WeakMap flow on assignments/call replay without a proof that the destination is a writable own data property. Preserve descriptor/alias provenance under heap forks, joins, spreads and reflection or conservatively refuse. Keep the four native-positive conservative controls and the one non-WeakMap rewrite-yield control. A blanket no-rewrite flag can achieve parity but is not a substitute for precision, measurement or full acceptance.

## Reproduction

From the pinned test-only commit `d79842837ad35633742a59831256a99dbe3e8405`, with repository-locked dependencies:

```sh
npm ci --ignore-scripts --no-audit --no-fund
node --test test/agent3-weakmap-cfg-matrix.test.js
```

Focused workflow `manual-validation.yml` with `focused_test=test/agent3-weakmap-cfg-matrix.test.js` records the three-OS original stdout and exact sources. No full Node+Chromium+runtime-budget gate was requested. This is a test-only branch intended for review by Agent 46 (current-main candidate), Agent 1 (integration owner), and Agent 10 (acceptance reviewer). No release status change: **RELEASE-BLOCKED**.
