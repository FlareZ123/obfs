# Independent public-only static recovery of emitted strings (2026-11-16)

**Status:** reproducible negative security evidence for the existing eager XOR string encoder; limited corpus and compiler grammar. This is intermediate research, not an established confidentiality or anti-LLM result.

## Pinned evidence

- Validated full three-lane manual workflow: [43828383951](https://github.com/FlareZ123/obfs/actions/runs/43828383951) on exact source `b5cb7526e72f466e7547096abe38c591efdb8d90`; all jobs successful. Matrix: COO script, SNO script, SNO CommonJS.
- Earlier attacker implementation gate: [43826715666](https://github.com/FlareZ123/obfs/actions/runs/43826715666) on `39b9d53fe1ebfd6ff5af4777a238074f18da2053`; all three lanes successful. The later run is stronger because attacker inputs no longer contain the original program, official answers, or private compiler metrics.
- Public upstream source: 2025 CCS [JsDeObsBench](https://github.com/Ch3nYe/JsDeObsBench), CodeNet JSONL at pinned upstream commit `8b2e1c35dc4ae25a46ea580ea5dcb6b5de5edbe9`, Git blob `4bde98f958eb81b070f411f39545ea6d5339e8d8`. See [original corpus evaluation](jsdeobsbench-adapter-2026-11-15.md) for independent baseline audit and earlier full 2,199 eligible official comparisons per lane.

## Attack and isolation protocol

The attacker `sims/jsdeobsbench-public-static-attack.js` consumes only a separate JSONL containing four properties per program:

```text
filename, obfuscated, obfs_source_type, obfs_output_sha256
```

`sims/jsdeobsbench-public-protocol.js --publish` constructs that input by explicitly stripping original programs, official test cases, all compiler metrics and the compiler seed. The attack stage checks the distributed-source SHA-256, parses public JavaScript with Acorn directly, then recognizes an adjacent top-level literal array and eager `for` decoder with a public `String.fromCharCode` and integer XOR expression. It statically inverts the XOR over JavaScript UTF-16 code units, including lone surrogates, and replaces the array's statically indexed literal reads with recovered string literals. It leaves the original decoder in place, avoiding assumptions about decoder side effects. The attacker does not execute the target, use the seed, import the obfuscator's parsing or ownership proofs, or read original answers.

The separately invoked `--verify` stage takes the private compiled benchmark and public recovered output, checks identity and content commitments, asserts that *every* encoded literal reference counted by the compiler was recovered in **every** supplied program, then only afterward rejoins originals and official test cases into a verifier-side dataset. The attacker cannot query this stage. The independently run Docker evaluator compares original and recovered behavior for a deterministic 100-program sample, up to two official cases each, with positive fixed V8 PRNG seeds; the existing full compiled-vs-original differential remains on all 1,301 corpus programs in each lane. Original execution failures remain baseline exclusions.

The manual gate passed both SNO source grammars. The static attack recovered every compiler-reported encoded literal reference across the supplied SNO corpus, and its verifier/sample execution gate passed. The COO lane tests ordinary compatibility, but its default encoder is disabled, so this result does not establish a COO decoding pass.

## Reproduce and challenge

The [manual external workflow](../.github/workflows/manual-jsdeobsbench.yml) contains the complete generation, public-only projection, attack, private verification and Docker differential sequence. The five regression tests in [test/jsdeobsbench-public-static-attack.test.js](../test/jsdeobsbench-public-static-attack.test.js) cover independent script/CommonJS decoding, long chunked Unicode, unpaired surrogates, false-pattern refusal, public/private input isolation, stale hash rejection, deliberate incomplete recovery and deterministic output. Run the workflow manually, never per commit. The exact source SHA and upstream blob are pinned above.

This is a source-only *algorithmic* recovery of one easily recognizable public decoder. It does not reconstruct arbitrary JavaScript control flow, secret server-side implementations, hidden property names, unknown generated decoders, dynamic keys, authorization policies, or the original CodeNet source bytes. Preserving behavior on the bounded corpus does not establish general semantic preservation. Attack runtime excludes implementation effort and is not a quantified adversarial-human cost. No anti-LLM or tamper-resistance score follows, and no 2.5× whole-session performance guarantee follows. Under the stated COO/SNO full-control attacker models, distributing the XOR key and all encoded bytes offers no confidential storage boundary.

## Cross-mode ESM confirmation

A separate [real Node ESM regression](../test/jsdeobsbench-public-esm.test.js) now emits the same original exported function through COO (`strings:true`), SCO (`strings:true`) and SNO (default strings). The output calls a genuine host-owned `globalThis.externalApi.decorate` callback. The attacker parses each delivered ESM source with independent Acorn module grammar, reconstructs its emitted string literal and verifies the same exports/callback results through the actual Node ESM loader, preserving the external callback spelling. The [pinned extended workflow 43829642708](https://github.com/FlareZ123/obfs/actions/runs/43829642708) at `9e9fb1e1e7efb1e0fdbf00a553348ffcbefa8c06` passed this ESM test and the three external benchmark lanes. This does not prove real Chromium compatibility, SCO source secrecy failure for *server-private* methods, or protection of non-XOR encodings.

## Research implication

The existing seeded string-encoding layer is a transformable display surface. Spending compute on alternate encodings should require a publicly reproducible attacker-cost win beyond this static normalization baseline and independent whole-session performance evidence. Prefer testing genuinely withheld SCO server functionality under the authorized-online-relay threat model; reject source-only security claims for this XOR mechanism.
