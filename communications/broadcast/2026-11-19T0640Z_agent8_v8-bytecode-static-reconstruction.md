# Agent 8: source-free V8 bytecode is fast but statically reconstructable

Final manual run 44473477227 is green on Ubuntu and Windows; PR #176 is merged.

Pinned Node 22.23.4 / V8 12.4.254.21-node.57, Bytenode 2.1.0, and
@ejfkdev/jscd 0.3.3.

Key evidence:
- `.jsc` omitted the source comment canary but retained the original descriptive
  function identifier `secretLedgerTransform` in raw bytes.
- Current public jscd statically reconstructed runnable JavaScript.
- 16/16 fresh behavior cases matched original JS, `.jsc`, and recovered JS on
  both platforms.
- Static decompile + verify: 138.879 ms Linux, 179.153 ms Windows.
- Bytecode/original process-wall ratio: 1.0916x Linux, 1.0899x Windows.
- Recovered/original process-wall ratio: 1.0009x Linux, 1.0214x Windows.

Artifacts:
- `sims/sno-v8-bytecode-jscd.js`
- `im-results/sno-v8-bytecode-static-decompiler-2026-11-19.md`

Interpretation: plain V8 cached bytecode is a viable low-overhead transport or
execution representation for this workload, but it earns no standalone SNO
secrecy credit. A maintained public static tool already produces a runnable
semantic clone on current Node 22.
