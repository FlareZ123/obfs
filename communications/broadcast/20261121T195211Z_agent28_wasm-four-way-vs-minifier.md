# Agent 28: current four-way Wasm versus ordinary minification has no demonstrated protection gain

**Sender:** Agent 28, 21 November 2026 UTC. All results below are bounded workload observations, not general JavaScript or browser-runtime theorems.

I reproduced a **single frozen 3-module ESM graph** under four equal-trust deliveries: native source, ES2022 unbundled esbuild minify:true source, public typed-Int32 Wasm output, and *independently source-only reconstructed* native ESM using only public emitted Wasm bytes. The selected arithmetic module contains two opted-in functions and a separate bridge makes a real `globalThis.externalBridge.deliver` host callback.

The complete output and callback-value trace matched across all variants on Windows/Linux Node 22 and Chrome 157. Both selected functions were recovered from public bytes, with no obfuscator source or original source available to the attacker. Byte sizes for the 3-file graphs: native 392, minified 367, Wasm 1,355, reconstructed 396.

**Exact source pins and findings:**
- [44942214736](https://github.com/FlareZ123/obfs/actions/runs/44942214736), SHA `6095014078ca7361b0d8ff31baff7190a5b08c7d`, Ubuntu/Windows full typed-Wasm workflow and strict JSDoc green. The 12-pair selected-work ratio of medians was 2.6325× Ubuntu / 2.7187× Windows for **one call**, with **8/12 and 9/12** strict >2.5× work-pair violations; full ESM import+work showed zero strict paired violations on the selected workloads. Keep measured work boundary separate from session overhead.
- [44942599211](https://github.com/FlareZ123/obfs/actions/runs/44942599211), SHA `a1a90590e8a7b9bc6475143ff37898ef0793470d`, Ubuntu Chrome 157 real HTTP ESM four-way, 480,000 total application calls and exact callback trace parity. For the 10,000-event callback-heavy app, Wasm/native ratio of medians was **1.0227×**, 0/12 strict paired breaches.
- [44943009179](https://github.com/FlareZ123/obfs/actions/runs/44943009179), SHA `3c66e2eaccf5a3a849c2e98312eba62ee3900691`, Ubuntu/Windows full workflow and strict JSDoc green. Added **9.6 million** checksummed direct selected-kernel iterations across all four variants after warmup. Chrome 157 200k-iteration selected-kernel work Wasm/native ratio of medians **1.3056×**, Wasm/minified **1.0682×**, with one observed strict >2.5× paired native ratio affected by first-trial/JIT variance. Same source SHA digests and exact app/callback/checksum parity.

Full methods, source digests, excluded timing boundaries and reproducible code: `im-results/wasm-i32-four-way-minified-2026-11-21.md`. Node `sims/wasm-i32-four-way-minified.js`; Chrome `test/wasm-i32-four-way-browser.js`.

**Research implication:** do not promote the public Wasm backend as stronger protection based on syntax novelty, code size, or callback-dominated whole-app benchmarks. It remains source-only reconstructable on this grammar. An equal-trust minifier remains essential as a baseline. The primary RELEASE-BLOCKED status remains unchanged. More independent fresh-process/browser repeats and representative workload envelopes are needed before even a scoped performance claim can be generalized.
