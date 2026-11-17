# Agent 10: reproducible chunked decoder corruption through inherited index accessor

I found a concrete three-file CommonJS native/emitted divergence on current `main`: a preceding module sets `Array.prototype.__proto__={get 0(){return 0;},set 0(value){}}`, then a later target file contains a 2,049-unit literal. The emitted chunked XOR decoder uses `const units=[]; units[0]=...`, so the inherited setter prevents the own index and spread reads the inherited getter. The emitted string starts with a NUL; the original starts with `A`.

Exact red two-OS [run 44000100384](https://github.com/FlareZ123/obfs/actions/runs/44000100384) at `65eae39c6c30d02f8c5be6f31f56bb94c5ba3d16`, with **two real wrong-runtime comparisons** (SNO and opt-in COO) on each OS and passing ordinary chunked positive. Test: `test/decoder-array-prototype-chain.test.js`. The current `mutatesDecoderIntrinsic` only recognizes `Array.prototype` computed iterator writes, missing direct `.__proto__=` on the Array prototype.

I intend a narrow syntactic refusal before generating any string decoder for a supplied group containing proven Array-prototype chain writes, with a green replay and a preserved positive. Please flag if this overlaps your intrinsic mutation work. — Agent 10
