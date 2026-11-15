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

**Verified cross-platform run:** [full manual validation 43736969268](https://github.com/FlareZ123/obfs/actions/runs/43736969268) pinned to main SHA **b695775e2508f5fe830f47fc33922e0cd75cd6fa** included all eight new tests. Their cases passed on Ubuntu and Windows; both root JSDoc and external strict JSDoc typechecks succeeded. The *whole run failed*, with 7 unrelated preexisting cross-file assignment-flow test failures and an existing Chromium 0-versus-2 assertion. The focused [dispatch-only expression VM verification 43737485123](https://github.com/FlareZ123/obfs/actions/runs/43737485123), pinned to **318d34d11ed22cd5a226d6a6014dea101e20330b**, subsequently **passed both Ubuntu and Windows jobs**, including the eight focused new tests and main strict JSDoc typecheck. The isolated run avoids reporting unrelated property-flow failures as defects of this VM. A later [focused gate 43737865749](https://github.com/FlareZ123/obfs/actions/runs/43737865749) at **64e81e15245fbd0cc5cf9afc59f5ce3fc6908b65** also passed on both OSes after adding an actual end-to-end COO two-file ESM CLI and SNO launcher execution test, along with the byte-exact sample and static-recovery checks. Do not cite this as an overall green release gate. A focused gate is needed for a clean feature result, and a later complete integration gate is required after the unrelated failures are resolved.

The current compiler does **not** establish observational equivalence for all JavaScript programs. Function source text and stack frames can differ, and source observation through indirect, external and cross-file mechanisms can be undetected. Local source observers cause conservative refusal. Optimized object-property transformations are separate and retain their own proof boundaries.

## Security and performance conclusions

1. **Static analysis:** full expression graph recovered from distribution only, against 48 masked variants. No demonstrated barrier.
2. **Dynamic analysis:** any receiver can invoke, intercept, patch and extract the helper in the COO/SNO full-control model. The preserved semantics enable legal program execution, including instrumented execution.
3. **Tampering and authorization:** no new integrity anchor or trusted environment. The VM offers no domain/URL authorization.
4. **Compatibility:** restricted and explicitly opt-in, differential checks as above; source/stack introspection remain known caveats.
5. **Performance:** each binary operator incurs an interpreted dispatch. Mixed-workload measurement at a VM call once per 512 iterations is reported by the test but does not establish the required 2.5x bound for arbitrary call frequency. Because code is public and runtime overhead can be large, default enablement would be unwarranted.

**Decision:** retain the compiler as an explicitly selected, research-only feature with exact generated artifacts and an attack witness. Further work should target coarse mixed native/VM scheduling with a measured application-level budget and independent held-out attackers. The SCO architecture's real trusted boundary remains undistributed server-side code/keys, paired with online oracle exposure controls.


### Later independently selected corpus and multi-function regression

[Deterministic graph fuzz](../test/expression-graph-fuzz.test.js) compiled 80 expression trees (depth two through four, eleven permitted operators) through both backends. It compared **3,040 typed or stateful input results**, preserving native coercion hints, exception names/messages, and results, and covered **1,320 emitted operations**. In addition, the [multi-target test](../test/expression-vm.test.js) transforms two exported functions in one CommonJS module with eight total graph operations, checking bytecode and native output for edge primitive inputs. The cross-platform [focused gate 43740910563](https://github.com/FlareZ123/obfs/actions/runs/43740910563) pinned to **9e05a7278df9d03959b4a93a145248a8f1b362d9** passed **20/20 Node tests**, root strict JSDoc checks, and real Chromium COO ESM output (98) on Ubuntu; Windows passed the 20 tests and typecheck. In that run the native hot ratio was **0.996x Ubuntu**; the earlier cross-platform paired hot measurements remain the primary before/after optimization evidence. The whole-main release workflow remains separately red for unrelated private-property proof tests.


### Restricted expression-value preservation argument

For the accepted AST grammar, leaves are either a read of the only formal parameter or a primitive numeric literal. With no assignments, getters, calls, lexical captures or computed properties inside the selected expression, obtaining a leaf has no program-visible side effect. Both emitters may therefore initialize numeric and parameter registers before evaluating any operator. Induct on the source binary-expression tree: each internal node's two operand values are already available in left-before-right postorder, and the emitted instruction executes **the same native JavaScript binary operator** with those values. Observable ToPrimitive conversion hooks occur at this native operator, in the original left-to-right operator order, and receive the same operands. The induction establishes matching returned primitive values or matching throws for the restricted evaluation semantics. Shared object references passed as the argument remain the same references in registers.

This is deliberately a **value-and-coercion proof within a restricted grammar**. It does not imply full JavaScript observational equivalence: extra allocation, stack frames, function source text, nonlocal debugger inspection, and independently observable process/resource timing can differ. The interpreted VM allocates a register array, while the native backend creates extra lexical locals; the compiled sources are separately verified for syntax and differential behavior. Application-level constraints and unmodeled source observers remain reasons to refuse a transformation.

A subsequent [seedless-reconstruction fuzz gate 43741266407](https://github.com/FlareZ123/obfs/actions/runs/43741266407), pinned to **0170aec7db38a899f5e4eb5c3682d42bb30cf9a1**, passed after extending every one of the 80 generated trees through both independent, compiler-free deobfuscators. The test reconstructs each published function and re-executes it against the original across the 3,040 typed/stateful cases, alongside the transformed function. Linux and Windows jobs completed green, with the existing focused browser and typecheck steps. This strengthens the negative security result beyond one fixed expression template.


### Distribution-size observation

The exact committed CommonJS baseline is **106 UTF-8 bytes**. The bytecode VM output is **1,347 bytes (12.708x source size)**; the final inlined native-register version is **576 bytes (5.434x)**. These ratios describe the one-function example's source file only. Network compression, aggregate bundle size, parse time and cold browser startup were not measured with this byte count, so no general cold-start or transfer-time claim follows. The extra bytes could matter especially for COO, where the initialization exception to the 2.5x compute rule is unavailable.
