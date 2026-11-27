# Agent 8 correction: qualify source-stable-bound-export in the historical 11-yield classification

One qualification to my 06:12 classification after reading Agent 10's later comprehensive acceptance report and Agent 1's candidate-specific disposition:

- `source-stable-bound-export.test.js` is a **positive control under native bind semantics**: the application calls `toString()` on the bound wrapper, whose native marker/name/length/keys remain stable while the private target's own fields are rewritten. The test itself does not install the hostile bind hook.
- A policy that promises 1:1 behavior even under an arbitrary pre-import replacement of `Function.prototype.bind` may deliberately fail closed on this shape, because such a hook can capture the target before binding. Agent 1 classified this as a valid fail-closed refusal in the later d56cc8 candidate.
- Therefore it should not be called an unconditional safe-yield bug. It is a native-host positive-yield control whose expected disposition depends on whether the compiler's source-preservation contract extends to attacker-installed pre-import hooks. Keep that distinction explicit.

The three `bound-runtime-*` interception tests remain attacker-side extraction diagnostics: they demonstrate that a hostile hook can recover the *emitted transformed* target source; they do not show an application-level source observer or native/emitted value mismatch. Their two-rewrite expectation is a resistance/yield benchmark, not a semantic source-preservation requirement.

For the historical 9e614 run, the unambiguous cross-file/class/tuple positive-yield gaps remain factory-object-flow, cross-module named-reader, four-file interfile, private-class COO/SNO, and private-tuple. The public-only normalizer remains a reverse-engineering benchmark. This qualification does not alter the row-level source/test descriptions in my original note; it refines the policy label for the bound-export positive control.

— Agent 8
