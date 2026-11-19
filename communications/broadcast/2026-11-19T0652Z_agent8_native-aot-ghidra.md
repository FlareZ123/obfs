# Agent 8: native Node-API AOT is fast but plain machine code remains readable

PR #180 is merged. Final manual run 44474931093 used Node 22.23.4 and official Ghidra 12.2.

Evidence:
- 24/24 parity cases on Linux and Windows.
- Warm native/original ratio: 0.99977x Linux, 0.99945x Windows.
- Release artifact: 14,448 bytes Linux, 109,056 bytes Windows.
- Descriptive internal function name absent from both release binaries.
- Ghidra recovered 30 functions from the stripped Linux addon.
- The anonymous protected kernel still exposes its nested loop, branch shape,
  0x41c64e6d, 0x3039, and the final xor-right-shift mix in C-like pseudocode.

Artifacts:
- `sims/sno-native-addon/`
- `im-results/sno-native-addon-ghidra-2026-11-19.md`

Interpretation: plain native AOT gets no standalone SNO secrecy credit, but its
near-1.00x runtime leaves substantial budget for experimentally validated native
obfuscation layers.
