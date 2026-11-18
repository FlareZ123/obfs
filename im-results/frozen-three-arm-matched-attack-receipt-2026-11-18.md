# Byte-frozen native/minified/COO application and matched public-only attack

**Agent 43, 18 November 2026. Intermediate reproducible negative result.**
This is a direct application of the new
[three-arm receipt verifier](../src/artifact-receipt.js), not a new
protection candidate or evidence that the primary security objective is
satisfied. The previously selected affine/polyvariant candidate had
already failed comparative security and strict runtime criteria.

## Source-pinned three-way artifact

At exact source `7927a014ee3fbb444171a131cd81e6aa5dc356a4`,
[manual multi-file attacker workflow 44294800564](https://github.com/FlareZ123/obfs/actions/runs/44294800564)
ran successfully on **Ubuntu and Windows**. Each job used
`npm ci --ignore-scripts --no-audit --no-fund` with the corrected
66-package npm lock, the same three native ESM modules
`{math.mjs,state.mjs,entry.mjs}`, unbundled
`esbuild.transform({minify:true,target:'es2022',format:'esm'})`, and the
same compiler-emitted COO three-module output from
`examples/polyvariant-app/build.cjs`.

The trial wrote every file with `atomicWrite` into three separate
native/minified/candidate directories, recorded individual and grouped
byte digests, ran the ESM graph directly from those directories,
executed a matched independent public-only attacker against their
exported functions, and rechecked every file and dependency-lock
digest **after** execution. No rebuilt substitute files were used
for the attacker or parity check.

| Arm | Total delivered source bytes | Canonical group SHA-256 |
| --- | ---: | --- |
| Native | 2,467 | `cabd2ff548cd80cf8417dee3bd786e350606215f4669eada30f8a76c02c02f73` |
| Ordinary minified | 1,115 | `645165a5a17593c9b3cbd358e5d3c4e57688fd12b49f6ba38e48a20d810323be` |
| COO affine candidate | 7,518 | `19b1ae15e9ccffccba1ed02ddccc35d44653627e891cbe1ff49874a281904807` |

All three arm digests and byte counts matched **exactly across Ubuntu
and Windows**. The dependency-lock SHA-256 was
`539c99fa4525f96eaa4fef42b44a2d2fb5d4928e0831b7368b0a33d08551bc04`
on each runner. The repo source pin and the archived `receipt.json`
preserve all per-file hashes and the exact flags/seed, plus runner
environment metadata.

### Exact archived distributables

- [Ubuntu exact ESM files and receipt, artifact 14422563416](https://github.com/FlareZ123/obfs/actions/runs/44294800564/artifacts/14422563416)
- [Windows exact ESM files and receipt, artifact 14422707215](https://github.com/FlareZ123/obfs/actions/runs/44294800564/artifacts/14422707215)

The compressed artifact ZIPs have different byte sizes because the
receipts record OS-specific host metadata. The **executed program
files themselves match by the complete per-arm cryptographic digests**.

## Real runtime and attacker outcome

Each arm executed the same six-record stateful scenario, including
Unicode, an embedded NUL, a lone surrogate, a negative Int32 input
and repeated events. Native, minified and obfuscated outputs and all
external host callback records matched exactly.

The public-only attacker `threeQueryTranslationClone` was called
independently on the **actual archived minified and candidate
`math.mjs`** ESM exports. It used one `f(0)` observation for each
of the three public numeric helpers in each arm, three fitting queries
per arm total. Its recovered offsets were identical:

| Function | Minified offset | Obfuscated offset |
| --- | ---: | ---: |
| `round1` | 324 | 324 |
| `round2` | 292 | 292 |
| `round3` | 324 | 324 |

Each public attack reproduced **12,288/12,288** held-out values,
including inputs never shown during the three fitting observations,
and agreed with the native original. Both operating systems produced
the same complete attack verdict. The application did execute
three genuinely rewritten public helpers, so this result is not
explained by zero rewrite yield.

This establishes an **equal-query attacker success** against the
specific affine candidate and its ordinary minified control on these
exact frozen bytes. It does not establish that arbitrary attacks are
equally easy, nor measure source reconstruction effort in minutes,
larger nonlinear candidates, SNO/SCO trust models, local tamper
resistance, or environment admission.

## Engine and experimental boundary

- Ubuntu: Node **22.23.4**, V8 **12.4.254.21-node.57**,
  `runnerImage=ubuntu26`, Linux `7.0.0-1019-azure`, x64.
- Windows: Node **22.23.4**, same V8, `runnerImage=win25-vs2026`,
  Windows `10.0.26100`, x64.
- Browser version was **not sampled**; no Chrome claim follows from
  this source-specific receipt.
- The existing `prepare()` helper also ran its previously published
  static recovery before the on-disk freeze; that earlier static
  transcript is separate from the **after-freeze** matched three-query
  attacker explicitly covered here.
- This source run **did not** measure source-coincident fresh-process
  CPU or browser startup, repeated hot function slowdown, independent
  attack labor, or a new strict 2.5× admission decision.

The matched attack and actual program bytes are now independently
inspectable. The historical negative security/performance decision
for this affine architecture remains unchanged. The proposed
[fused stateful ARX Wasm candidate](../workplace/batched-wasm-stateful-arx-candidate-charter-2026-11-18.md)
must produce its own precommitted, byte-frozen, attacker-balanced
receipt and strict CPU/browser run before any promotion.
