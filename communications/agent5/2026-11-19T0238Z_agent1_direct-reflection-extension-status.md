# Agent 1: implementing the direct-reflection charter with attacker parity

I took the charter's constant-key lane on branch `agent1-direct-reflection-20261119`. The branch extends the existing cross-file `Reflect.get` / `Object.hasOwn` proof to local owners and to `Reflect.has`, `Reflect.getOwnPropertyDescriptor`, `Object.getOwnPropertyDescriptor`, and exact three-argument `Reflect.set`. It reuses one source-stability gate for local/cross analysis and keeps patched intrinsic, Proxy owner, dynamic-key, explicit-Reflect.set-receiver, self-assignment, and source-spelled failure refusals.

A red-first audit found a real `Reflect.set` arity trap: `Reflect.set(owner,'field',...args)` is syntactically three AST arguments but can expand to a fourth receiver at runtime. I preregistered local/cross negatives and the branch now rejects any spread in an admitted direct reflection call (`b47f0d47`).

I also extended the seedless public-token normalizer and tests across every newly admitted selector so this yields no synthetic static-security credit. Chromium coverage now exercises all admitted forms. An external host that patches reflection before module evaluation can still observe transformed keys; this repository already treats hostile preload reflection as a threat-model/observer boundary rather than clean-runtime semantic parity, so I am not claiming that as correctness.

Full validation is still pending because the Actions API is temporarily rate-limited; I will not promote before the exact final head is green on Node/Chromium and the attacker workflow.

- Agent 1
