# Opt-in multi-register expression VM: nested operator trees, source-only recovery, and measured costs

**Status:** intermediate reproducible engineering result, Agent 30, 15 November 2026. No claim of new cryptographic secrecy, robust client authorization or a general 2.5x runtime guarantee.

## Method and reproducible artifacts

The existing experimental register VM accepted only single-register left-associated immediate chains, leaving a useful class of expression graphs unsupported. This invocation added a second, opt-in compiler at [src/expression-vm.js](../src/expression-vm.js), integrated into [src/core.js](../src/core.js), exported in [src/index.js](../src/index.js) and exposed to COO/SNO command-line use through the **--expression-vm** flag in [src/cli.js](../src/cli.js).

The compiler recognizes one-parameter top-level function declarations with one return expression and a tree of parameter references, 0..255 numeric literals and selected native JavaScript binary arithmetic/bitwise operators. It declines unknown AST nodes, unsupported shape, direct eval/with and syntactically recognized source inspection. The postorder emitter produces a multi-register instruction tape with seed-dependent opcode rotation and XOR masks. The helper is declaration-hoisted, and the tape is cached after first invocation. A register array with own initialized slots prevents inherited index setters from intercepting stores.

The [committed original and compiler-generated before/after](../examples/expression-vm/README.md) encode the six-op nested function:

    function mix(x) {
      return ((x + 7) * (x - 5)) ^ ((x + 3) & 255);
    }

The generator [build-sample.cjs](../examples/expression-vm/build-sample.cjs) calls the real compiler with seed **expression-vm-example-v1** and verifies exact identity against [after.cjs](../examples/expression-vm/after.cjs) in the tests. There are no hand-constructed sample stand-ins.

## Compatibility evidence and threat limits

[Behavior tests](../test/expression-vm.test.js) include 1,500 deterministic numeric samples, unusual primitives, BigInt/Symbol exceptions, stateful user-defined ToPrimitive hooks, early calls before the function declaration, prototype setter poisoning, unsupported-shape refusal, native function name and arity, preserved external API property spelling, and integration through the COO/SNO programmatic pipeline. [Attacker tests](../test/expression-vm-static-recovery.test.js) independently reconstruct the full original expression from published bytes and switch cases, without seed or original source, plus **48 independently seeded builds** with 120 numerical checks each. Static recovery succeeds for all cases checked. These checks intentionally falsify any assertion that the multi-register masking produces source confidentiality.

**Verified cross-platform run:** [full manual validation 43736969268](https://github.com/FlareZ123/obfs/actions/runs/43736969268) pinned to main SHA **b695775e2508f5fe830f47fc33922e0cd75cd6fa** included all eight new tests. Their cases passed on Ubuntu and Windows; both root JSDoc and external strict JSDoc typechecks succeeded. The *whole run failed*, with 7 unrelated preexisting cross-file assignment-flow test failures and an existing Chromium 0-versus-2 assertion. Do not cite this as an overall green release gate. A focused gate is needed for a clean feature result, and a later complete integration gate is required after the unrelated failures are resolved.

The current compiler does **not** establish observational equivalence for all JavaScript programs. Function source text and stack frames can differ, and source observation through indirect, external and cross-file mechanisms can be undetected. Local source observers cause conservative refusal. Optimized object-property transformations are separate and retain their own proof boundaries.

## Security and performance conclusions

1. **Static analysis:** full expression graph recovered from distribution only, against 48 masked variants. No demonstrated barrier.
2. **Dynamic analysis:** any receiver can invoke, intercept, patch and extract the helper in the COO/SNO full-control model. The preserved semantics enable legal program execution, including instrumented execution.
3. **Tampering and authorization:** no new integrity anchor or trusted environment. The VM offers no domain/URL authorization.
4. **Compatibility:** restricted and explicitly opt-in, differential checks as above; source/stack introspection remain known caveats.
5. **Performance:** each binary operator incurs an interpreted dispatch. Mixed-workload measurement at a VM call once per 512 iterations is reported by the test but does not establish the required 2.5x bound for arbitrary call frequency. Because code is public and runtime overhead can be large, default enablement would be unwarranted.

**Decision:** retain the compiler as an explicitly selected, research-only feature with exact generated artifacts and an attack witness. Further work should target coarse mixed native/VM scheduling with a measured application-level budget and independent held-out attackers. The SCO architecture's real trusted boundary remains undistributed server-side code/keys, paired with online oracle exposure controls.
