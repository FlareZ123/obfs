# SCO Web IDL direct-method admission candidate

**Status: focused two-platform gate GREEN; draft PR #355, not integrated.** This is a bounded selected-SCO host-compatibility guard, not a security breakthrough or release acceptance.

## Reproduced defect

After the constructor-only guard in PR #351, real Chromium 157 versus selected-SCO Node 22.23.4 still diverged for:

- `new Headers().append('bad name','x')`: browser `TypeError:Failed to execute 'append' on 'Headers': Invalid name`; Node `TypeError:Headers.append: "bad name" is an invalid header name.`.
- `new URLSearchParams().append(Symbol('x'),'1')`: browser `TypeError:Failed to execute 'append' on 'URLSearchParams': Cannot convert a Symbol value to a string`; Node `TypeError:Cannot convert a Symbol value to a string`.

The red-first browser evidence is [45255283045](https://github.com/FlareZ123/obfs/actions/runs/45255283045), source `df885ca4f15bfcbf3da90f2bdf2631fb1b118517`. A valid `new URLSearchParams('a=1').get('a')` remained equal across browser, emitted facade and server.

## Candidate behavior

PR [#355](https://github.com/FlareZ123/obfs/pull/355), branch `agent8/sco-webidl-method-admission-20261123`, current validated head `796e7d61920afbbc06bce3cd64d2c8b3b418bc64`.

The compiler change is confined to `src/sco-selective-partition.js` and reuses the existing Web IDL relocation admission boundary for both selected private functions/helpers and imported static ESM leaves. It permits only immediately consumed, directly called methods on directly constructed `Headers` / `URLSearchParams` instances, with bounded printable-ASCII arguments and a strict lowercase ASCII header-name subset. It rejects unproved constructor shadows, local instance aliases, extracted methods, optional/dynamic calls, returned instances, global-object aliases, reflective retrieval and unknown computed global-property/destructuring recovery. The latter fail-closed cases were added after source review identified that `globalThis[key]` and `{[key]: H}=globalThis` could otherwise evade a check that only recognized statically spelled constructor names.

No runtime checks, VM instructions, extra RPCs or network requests were added; this is compile-time admission logic. That does not substitute for a measured whole-program runtime budget.

## Validation

- Initial focused run [45283897941](https://github.com/FlareZ123/obfs/actions/runs/45283897941) was **RED because of a test-harness assertion defect**: eight positive method results were equal by value, but the generic comparison used reference equality for an array. The run logged identical original/emitted/server values; the failure was `assert.equal(array,array)`, not a browser/server semantic mismatch.
- Corrected the comparison to structural strict equality and added negative cases for dynamic `globalThis[key]`, computed destructuring from a global-root alias, and the imported-private-ESM path. The guard now rejects unknown computed properties on recognized global roots and unknown computed destructuring keys.
- Final focused run [45284413044](https://github.com/FlareZ123/obfs/actions/runs/45284413044) at exact head `796e7d61920afbbc06bce3cd64d2c8b3b418bc64`: **SUCCESS on Ubuntu and Windows**. The focused test, strict project JSDoc, strict external JSDoc and strict paired/full-budget evaluator JSDoc all passed on both OS.
- Ubuntu executed real Chromium `Chrome/157.0.8103.78`, Node `v22.23.4`, the generated SCO facade and the original browser implementation over authenticated local HTTP. The test retained the unauthenticated HTTP 403 control. Tested protected positives include URLSearchParams `get`, `getAll`, `has`, `toString`, `append`, `set`, `delete`, `sort`; Headers `get`, `has`, `append`, `delete`; and `Math.imul(17,19)=323). The two malformed-method cases are refused before relocation.
- Windows ran the static selected-export/imported-ESM graph controls and all strict JSDoc gates; the real Chromium portion is intentionally Ubuntu-only.
- Additional regression runs on the same validated code/test content (branch head advanced only for this report update): [45285048066](https://github.com/FlareZ123/obfs/actions/runs/45285048066) passed `test/sco-selective-partition.test.js`; [45285247570](https://github.com/FlareZ123/obfs/actions/runs/45285247570) passed `test/sco-selected-graph.test.js`; [45285376391](https://github.com/FlareZ123/obfs/actions/runs/45285376391) passed `test/sco-selective-private-import-identity.test.js`; [45285537603](https://github.com/FlareZ123/obfs/actions/runs/45285537603) passed `test/sco-selected-graph-state.test.js`. All four succeeded on Ubuntu and Windows with strict JSDoc.

- Final expanded Web IDL test run [45286510369](https://github.com/FlareZ123/obfs/actions/runs/45286510369) passed Ubuntu/Windows at test head `fbf043d831ea4c66e3a6dd494a8db478b53e8476`. It adds explicit variable/rest, defaulted, computed-defaulted, assignment-form and alias-root destructuring negatives in both selected-export and imported-ESM graph paths. No compiler predicate change was needed; the existing scanner already rejects these shapes.
- The intervening [45286344153](https://github.com/FlareZ123/obfs/actions/runs/45286344153) was red only because the imported-graph assertion expected the narrower Web IDL diagnostic. The graph's earlier `realmStateObservation` correctly refused `globalThis` in assignment-form destructuring with `realm-local intrinsic state access`; the test now accepts either recognized refusal diagnostic. This was a test expectation correction, not a fail-open or a source change.

- The latest expanded adversarial run [45287266970](https://github.com/FlareZ123/obfs/actions/runs/45287266970) passed Ubuntu/Windows at test head `d1569cb08aaf89a440b0bfd224d2f50a95b79889`. It adds fail-closed tests for `Reflect.get(globalThis,'Headers')`, `Object.getOwnPropertyDescriptor(globalThis,'Headers')`, direct `Headers.prototype` mutation, `Object.defineProperty(URLSearchParams.prototype,...)`, `window` roots, assignment-created global-root aliases, alias chains and assignment destructuring. The existing guard refused these without source changes.

## Boundaries and decision

This is a finite grammar, not a proof of universal browser/Node equivalence. It covers only the explicitly admitted direct construction/method/argument forms. Dynamic aliases, arbitrary methods, non-ASCII or non-literal inputs, mutable host prototypes, future engine versions, unknown reflective paths, and arbitrary imported side effects remain outside the proven subset and should remain refused or separately tested.

The candidate has **not** received a comprehensive full-mainline acceptance run. The latest recorded comprehensive mainline Node 22 run [45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841), at frozen source `84b855e666d70a9a0937540f987595e122144fcf`, failed with 26 named failures on each OS. The focused green does not supersede that red result. No paired performance benchmark or universal ≤2.5× compute claim is established, and no static/dynamic reconstruction resistance or source secrecy claim follows from this compatibility guard.

**Decision:** retain PR #355 as a draft pending independent method-level review and controlled integration onto current main. If accepted, coordinate one source-pinned comprehensive acceptance run with Agent 10. Overall product status remains **RELEASE-BLOCKED**.
