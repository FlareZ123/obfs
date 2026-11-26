# WeakMap source-observer guard: donor and carrier-candidate adversarial review

**Status:** Intermediate compiler-correctness evidence. No production source changes, no PR, and no release/security-hardness claim. Tests are pinned to exact candidate snapshots.

## Executive synthesis

The research has a two-sided failure mode:

1. WeakMap prototype exposure can be missed when an instance is carried through an object/array, returned from a local factory, selected through an unknown computed key, placed in a class static block, or reached through the parent prototype of a locally shadowed subclass.
2. A blanket "WeakMap passed to any call" veto avoids some false-safes but suppresses safe transformations when the callee is a known local helper that merely returns or reads the map.

Agent 1's container analysis materially improves static cases, but the latest tested head still has two carrier false-safes, a class-parent false-safe, and the known-local-call precision regression. Agent 10's donor snapshot has more container/factory false-safes and the same local-call over-refusal.

## Exact evidence

### Agent 10 donor snapshot

- Branch: \`agent10/weakmap-group-prototype-guard-20261126\`
- Source head: \`0b119c540a903cc786be74f29c2d63e6b6c2e903\`
- Test: \`test/agent4-weakmap-agent10-getter-container-challenge.test.js\`
- Test commit: \`33a4ba430e182cbc425718e876721f2f357a94ce\`
- Run: [45865971844](https://github.com/FlareZ123/obfs/actions/runs/45865971844)

On Ubuntu, Windows, and macOS, the 9-case focused suite produced **5 passes and 4 failures**. False-safes:
- a WeakMap instance inside an object property;
- a WeakMap identifier stored in an object property;
- an array-carried WeakMap instance;
- a local factory-returned WeakMap instance.

For each failure, the observer returned \`false\`, the compiler rewrote 5–7 identifier bindings, ordinary returned values remained equal, and host-captured function source changed from \`privateLocal\` to a generated identifier. The five passing direct-instance cases do not establish complete getter-extraction recognition: their direct \`new WeakMap()\` argument is caught by the broad call-argument veto.

A separate precision control used a known local identity helper:

\`\`\`js
function hold(map) { return map; }
const localMap = hold(new WeakMap());
\`\`\`

The helper does not inspect the prototype, escape the map, or expose it. Test \`test/agent4-weakmap-agent10-local-helper-precision.test.js\`, commit \`b215dd1312775f08b3514818aae77a8e7e7ad767\`, run [45866687066](https://github.com/FlareZ123/obfs/actions/runs/45866687066), failed on all three platforms because \`observed=true\` and \`bindings=0\`. Native/emitted runtime results and the host title were identical. This is an output-yield false positive, not a runtime mismatch.

### Agent 1 static-container candidate

- Branch: \`agent1/weakmap-exported-container-review-20261126\`
- Source head: \`723dcefe38336672699849c93c1f1207e13a0f27\`
- Test: \`test/agent4-weakmap-agent1-container-matrix.test.js\`
- Test commit: \`e02441527ff3d549e35b14a9503fd0c42ca98b7d\`
- Run: [45866935799](https://github.com/FlareZ123/obfs/actions/runs/45866935799)

The 10-case suite passed on Ubuntu, Windows, and macOS, including strict project/external JSDoc. Fixtures covered direct-instance control, object-member, array-index, nested-object-member, object destructuring, array destructuring, member assignment, container alias, spread copy, and static computed member. Runtime-captured function source matched native source.

### Agent 1 latest expanded candidate

- Source head: \`dd9f5783abb3df607c615dd08fe6646ce4264006\`
- Expanded test: \`test/agent4-weakmap-agent1-latest-container-challenge.test.js\`
- Test commit: \`d8060442974a2b4a35fba3e867a7d5a68d839f77\`
- Run: [45867190417](https://github.com/FlareZ123/obfs/actions/runs/45867190417)

The 14-case suite passed **12/14** on all three platforms. Remaining false-safes:

1. **Dynamic array index:** \`carrier[dynamicKey]\` where the runtime key selects a WeakMap slot. The observer returned false, 7 bindings were rewritten, and captured source changed.
2. **Class static block:** \`class Carrier { static { this.instance = new WeakMap(); } }\`, followed by a read through the class binding. The observer returned false, 6 bindings were rewritten, and captured source changed.

Arrow-factory and arrow-map-return controls, and the ten static cases above, passed.

The same latest source head retains the local-helper precision problem. Test \`test/agent4-weakmap-agent1-latest-local-helper-precision.test.js\`, commit \`da4b1be7d5b9e62c7502c056f03ece0627bd33db\`, run [45867337001](https://github.com/FlareZ123/obfs/actions/runs/45867337001), failed on all three platforms: \`observed=true\`, \`bindings=0\`, while native/emitted ordinary results and title were equal. Source inspection of this exact branch still shows an unconditional \`CallExpression\` argument veto for concrete WeakMap instances and a nested-\`NewExpression\`-inside-any-call veto.

A separate cross-file class-heritage test was run against the same latest head:

- Test: \`test/agent4-weakmap-agent1-subclass-parent-prototype.test.js\`
- Test commit: \`ce0a6520caec2da9dcec904b50acc5826cc6a109\`
- Run: [45867411716](https://github.com/FlareZ123/obfs/actions/runs/45867411716)

All three platforms reproduced a false-safe for:

\`\`\`js
class WeakMap extends globalThis.WeakMap {}
const nativePrototype = Object.getPrototypeOf(WeakMap.prototype);
\`\`\`

The subclass's parent prototype is the shared native WeakMap prototype. The candidate reported local/group exposure false, allowed four Storage-module identifier bindings, and changed host-captured function source while ordinary values remained equal.

## Interpretation

The detector should not equate "a WeakMap appears inside a call argument" with "the WeakMap escapes to an opaque observer". That rule is a useful fail-closed fallback for unresolved/external calls, but it rejects analyzable local helpers. Agent 3 independently reproduced the complementary local-reader case \`consume(map) { return map.get("key"); }\` in run [45865967548](https://github.com/FlareZ123/obfs/actions/runs/45865967548).

The container analysis is a bounded abstract interpretation, not yet a complete interprocedural points-to analysis. Evidence identifies four summary boundaries: unknown computed keys, static-block \`this\`, native parent prototypes of derived WeakMap classes, and known local function parameters/returns.

## Recommended research direction

1. **Value lattice:** retain explicit \`WeakMapInstance\`, \`Container(static slots, unknown flag)\`, \`MaybeWeakMap\`, and \`Other\` values. Preserve aliases and merge branch values conservatively.
2. **Unknown computed key:** if the base may contain a WeakMap, an unresolved key must yield \`MaybeWeakMap\`, not \`Other\`. Unknown writes should likewise poison the relevant carrier summary.
3. **Static blocks:** bind static-block \`this\` to the class constructor's abstract container and propagate writes back to the class binding. Keep static and instance receivers distinct; handle lexical \`this\` in nested arrows separately.
4. **Class heritage:** resolve statically proven subclasses of native WeakMap. Distinguish the subclass's own prototype from the native parent reached through \`Object.getPrototypeOf(Derived.prototype)\`, \`Reflect.getPrototypeOf\`, or \`Derived.prototype.__proto__\`.
5. **Local-function summaries:** summarize which formal parameters are returned, read as WeakMaps, used to obtain a prototype, stored into escaping containers, or passed to opaque calls. Propagate actual argument values through known local calls to a fixed point. Keep unknown/external calls fail-closed.
6. **Cross-file summaries:** propagate exported/imported WeakMap instances and factory return values through ESM re-exports and CommonJS export shapes. A group-wide OR of per-file exposure flags cannot compensate for a per-file analysis that loses value identity.
7. **Regression policy:** keep negative and positive controls. Every new escape case should be paired with a known-local identity/reader case and unrelated-object controls so coverage does not improve by globally suppressing transformations.

## Scope limits

The cited runs are focused compiler-correctness tests, principally COO. They do not establish complete SCO/SNO behavior, browser/Node compatibility across all features, runtime-budget compliance at 2.5×, static-deobfuscation resistance, dynamic-analysis resistance, anti-LLM effectiveness, domain locking, or release readiness. The findings belong in \`im-results/\`, not established academic results. PR #382 should remain behind its existing integration funnel until the exact candidate passes the complete adversarial matrix.


## Addendum — exact expanded replay and PR scope correction (17:31Z)

- Replayed Agent 3's expanded 17-case carrier matrix against Agent 1 source head \`dd9f5783abb3df607c615dd08fe6646ce4264006\` on test-only branch \`agent4/weakmap-agent1-dd9f-expanded-carrier-20261126\`. Run [45868160922](https://github.com/FlareZ123/obfs/actions/runs/45868160922) passed 14/17 on Ubuntu, Windows, and macOS. The three false-safes are dynamic array index, class static field initializer (\`static instance=new WeakMap()\`), and class static block write followed by \`Carrier.instance\` read. Each has \`observed=false\`, 6–7 rewritten bindings, equal ordinary values, and changed captured function source. This supersedes the earlier 14-case result for this same candidate snapshot.
- Agent 3's cross-file COO/SCO/SNO matrix on source head \`c55f1d105f5899604659eee3649b4629bbc9216d\`, run [45867090458](https://github.com/FlareZ123/obfs/actions/runs/45867090458), passed 3/3 on all three platforms. Storage-file bindings were zero in each mode; COO runtime preserved ordinary values and captured source. SCO/SNO were compile-metric checks, not end-to-end server-runtime tests. This is a positive result for that earlier candidate snapshot, not a substitute for the latest carrier matrix.
- Agent 6's exact replay against Agent 10 donor head \`0b119c540a903cc786be74f29c2d63e6b6c2e903\`, run [45866696379](https://github.com/FlareZ123/obfs/actions/runs/45866696379), failed on Ubuntu, Windows, and macOS: group exposure false, four bindings, and changed captured function source. The subclass-parent-prototype false-safe persists after the donor's later commits.
- **PR #382 scope correction:** I verified PR #382 directly. It is open/draft, head \`1bab0360e356c6174339111919ce07c124aa0491\`, base \`3fd4bd298750cdc3287ddce1542abc0569d5c0e9\`; its body describes Agent 2's narrower Web Storage DOMString source-observer patch. GitHub compare from PR head to Agent 10 donor head \`0b119c\` reports merge base exactly equal to the PR head, 65 commits ahead, and 0 behind. Therefore these WeakMap group-guard findings apply to the downstream Agent 10 donor/reference-only Storage optimization and integrations that include it; they do **not** by themselves invalidate PR #382's standalone patch. An earlier Agent 4 message phrased the integration boundary too broadly; explicit corrections were sent to Agents 1, 2, 3, and 10.


## Addendum — latest Agent 1 candidate positive and negative controls (17:34Z)

### Getter/container aliases: 11/11 pass

- Exact Agent 1 source base: \`dd9f5783abb3df607c615dd08fe6646ce4264006\`
- Test: \`test/agent4-weakmap-agent1-carrier-alias-audit.test.js\`
- Test commit: \`1a1da6e20f66f66199071163d19c94519944eb0c\`
- Run: [45868621647](https://github.com/FlareZ123/obfs/actions/runs/45868621647)

All 11 tests passed on Ubuntu, Windows, and macOS, with strict project/external JSDoc. The suite asserts exposure is detected, Storage bindings remain zero, ordinary results match, and captured source is unchanged. It covers five getter-extraction forms, object-property instance, object-carried identifier, array carrier, local factory return, function-returned object carrier, and class instance-field carrier. This is a meaningful improvement over the Agent 10 donor, where four of the overlapping carrier cases were false-safe.

### Cross-file mode matrix: 3/3 pass

- Exact Agent 1 source base: \`dd9f5783abb3df607c615dd08fe6646ce4264006\`
- Test: \`test/agent4-weakmap-agent1-dd9f-crossfile-modes.test.js\`
- Test commit: \`f385fa840f4bdd8d2b2e0f919a6fa9a8faa1c889\`
- Run: [45868497810](https://github.com/FlareZ123/obfs/actions/runs/45868497810)

The cross-file container exposure case passed under COO, SCO, and SNO mode flags on all three platforms. Storage bindings were zero in every mode. COO native/emitted values and captured source matched. SCO/SNO were compile-mode/metric checks, not full server deployment/runtime tests.

### Parent-prototype extraction: 45/45 combinations false-safe

- Test: \`test/agent4-weakmap-agent1-subclass-parent-variants.test.js\`
- Test commit: \`1a1da6e20f66f66199071163d19c94519944eb0c\`
- Run: [45868603409](https://github.com/FlareZ123/obfs/actions/runs/45868603409)

Five forms (non-shadowing subclass via \`Object.getPrototypeOf\`, shadowed subclass via \`__proto__\`, aliased \`Reflect.getPrototypeOf\`, aliased \`Object.getPrototypeOf\`, and two-level subclass chain) were tested under COO/SCO/SNO flags. All 15 mode/variant combinations failed on each of Ubuntu, Windows, and macOS: **45/45 false-safe combinations**. Every combination reported group exposure false, four Storage identifier bindings, and native/emitted captured-source mismatch. Agent 6 independently reports the same 45-combination result against Agent 10 donor head \`0b119c\` in run [45867880661](https://github.com/FlareZ123/obfs/actions/runs/45867880661).

### Current candidate acceptance snapshot

For Agent 1 source head \`dd9f5783\`:

- 11 getter/container alias tests: **11/11 pass**.
- 17 expanded local carrier tests: **14/17 pass**; remaining false-safes are dynamic array index, class static field initializer, and class static block.
- Cross-file COO/SCO/SNO container case: **3/3 pass** (compile-mode checks for SCO/SNO).
- Five parent-prototype variants × three mode flags: **0/15 safe detections** (45/45 platform/mode/variant failures).
- Known-local identity helper: still over-refused (\`observed=true\`, \`bindings=0\`), run [45867337001](https://github.com/FlareZ123/obfs/actions/runs/45867337001).

The result is not "the guard works" or "the guard fails" globally: it has specific validated coverage and specific remaining unsoundness/precision defects. Preserve this separation in integration decisions.
