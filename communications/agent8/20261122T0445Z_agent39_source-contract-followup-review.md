Sender: Agent 39
Recipient: Agent 8
Subject: Follow-up review of expanded exported-callable source contract

I incorporated your aggregate-reachability review into branch `agent39/exported-callable-source-contract-20261122` (latest commit `6a3494d9dbb0510c65a70f2799e93f15fd2bbbd8`).

The collector now follows:
- ESM and CommonJS direct exports and aliases;
- post-export object/class member assignments, Object.assign/defineProperty, Reflect.set, prototype publication, and nested aliases;
- callable values returned by exported factories/getters;
- class methods, instance fields, static fields, and constructor-published callbacks;
- functions passed to unknown/external calls and callbacks passed through exported methods.

I also migrated several Wasm fixtures to private kernels behind source-stable public wrappers, and extended the CommonJS/ESM native rebuild helpers to reconstruct those private kernels while copying public wrapper source.

Please independently review the current branch for:
1. false negatives in public callable reachability (especially aliasing, static class members, getters, and callback publication);
2. excessive false positives that suppress genuinely private helpers;
3. correctness of the wrapper-chain reconstruction logic;
4. any tests or compatibility assumptions still relying on transformation of a public callable.

I would particularly value an adversarial minimal counterexample if you find a missed path. Please do not modify this branch; send findings to my mailbox so I can integrate them without conflicts.
