# Out-of-band bind preloader: extraction threat versus source-parity contract

Date: 2026-11-26T07:58:27.852Z
Reviewer: Agent 10

## Decision

The Agent 49 out-of-band host-preloader reproduction is a valid **dynamic extraction witness**, but its current-main assertion that the target's original `Function#toString` source must remain unchanged is not a valid semantic-compatibility requirement under the repository's stated threat model. The preloader is not part of the obfuscated program; it is attacker-controlled runtime instrumentation. The relevant security question is whether the attacker obtains the **original** property names or only the transformed source.

This does not prove that every `.bind` receiver should be admitted. It means the host-preloader test must not veto an otherwise semantics-preserving transform merely because an attacker can inspect the transformed function object.

## Contract distinction

Two different observations have been conflated:

1. **In-program source observation.** If code in the analyzed graph calls `Function.prototype.toString`, `.toString()`, a recognized stack/source observer, or passes a callable to an opaque program-level consumer whose contract requires native source, changing the function's source can change program behavior. The compiler should preserve source or refuse. The existing `observesFunctionSource(ast)` veto and the in-program custom-bind controls are aimed at this case.
2. **Out-of-band hostile observation.** A Node `--require` preloader installed before module evaluation is not in the source graph. It can replace `Function.prototype.bind`, capture the target from `this`, and inspect `Function#toString`. That is attacker instrumentation, not an original program consumer. Preserving the original property spelling for this observer leaves the key visible in distributed code and rewards the attack with a less-obfuscated target.

The repository's own README already distinguishes compatibility evidence from confidentiality or tamper resistance under hostile runtime control. A source string returned to an attacker does not have to match the original source; it should contain the transformed program.

## Evidence and contradiction

- Agent 49's current-main baseline test `test/agent49-bound-bind-host-preloader.test.js`, run **45766539095**, passes by requiring zero rewrites and exact source parity. This demonstrates the conservative refusal policy, not resistance to extraction.
- The candidate counterexample run **45766824347** and three-mode run **45767206320** show that the preloader can capture the target after obfuscation: the result remains 7, one private key is rewritten, and the captured target source contains the generated key rather than `secretField`. This is an extraction surface, but not recovery of the original key in this fixture.
- The older tests `test/bound-runtime-interception.test.js`, `test/bound-runtime-minifier-control.test.js`, `test/sno-bound-runtime-interception.test.js`, and `test/source-stable-bound-export.test.js` expect the target's private keys to change while the host captures the transformed target. They fail on the current conservative mainline because the direct-call-only proof yields zero rewrites. Full run **45775382170** lists those bound tests among its residual failures.
- The earlier Agent 10 in-program custom-bind controls distinguish the cases: when the analyzed program itself mutates `Function.prototype.bind` and performs a recognized source observation, the source-observer/owner-escape guards refuse. The out-of-band preloader is not visible to that source analysis.

Thus the current suite contains conflicting contracts: one family expects transformed target source to be captured by a hostile host, while the Agent 49 baseline expects the same hostile host to receive original source. Those expectations cannot both define the same threat model.

## Recommended test and proof policy

1. Reclassify the Agent 49 preloader case as an attacker-extraction test. It should assert ordinary result parity (7), a real private-key rewrite, captured target source containing the generated property spelling, and absence of the original key spelling. Do not assert source parity with the native source.
2. Keep the in-program `observesFunctionSource` veto and negative controls. A source observer that exists in the analyzed program is a semantic compatibility constraint; an observer installed by the attacker is not.
3. Keep the bound-call admission narrow. Require a uniquely bound target, only the permitted direct bind-receiver use sites, literal/approved bound arguments, no other escapes, and all existing owner-use/reflection/dynamic-scope/source-observer checks. Do not generalize from this fixture to arbitrary higher-order or bound functions.
4. Treat a source-level replacement of `Function.prototype.bind` as a program effect that must be analyzed or refused when it can alter behavior. Treat an out-of-band preloader replacement as hostile tampering/extraction; the compiler cannot promise semantic equivalence under arbitrary attacker-controlled runtime mutation.
5. Evaluate the extracted transformed source as part of the dynamic-analysis threat model. If the transformed source is still too easy to reconstruct, strengthen the obfuscation (or keep sensitive computation server-side in SCO); do not preserve original property names as the remedy.

## Limits

This is a policy interpretation of the existing test evidence, not a proof that the candidate bind admission is correct for every JavaScript program or that a host preloader cannot extract runtime code. A hostile client with DevTools and memory access can inspect transformed code regardless. The goal is to make what they obtain materially harder to reconstruct, while preserving the original program's own observable behavior in an authorized runtime.
