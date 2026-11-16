# SCO RPC JSON: malformed UTF-8 transport bytes

**Status:** bounded request canonicalization and compatibility hardening.

## Native pre-fix behavior and threat condition

Prior `handleRpc` used `Buffer.concat(chunks).toString('utf8')` before `JSON.parse`. Node's UTF-8 decoder replaces malformed octet sequences with U+FFFD. Consequently, a raw HTTP request with the method `probe` and a JSON string argument containing a single invalid octet `0xFF` was admitted as if the client had intentionally sent the distinct valid UTF-8 encoding `EF BF BD` of U+FFFD. The method saw the replacement character and ran. The same ambiguity affects other invalid or incomplete UTF-8 encodings.

For a trusted SCO server using exact RPC argument policies or canonical encodings, input-bytes ambiguity is undesirable. This is a transport validity defect, not a demonstrated bypass of cryptographic authentication or of an otherwise correctly configured policy.

`test/sco-malformed-utf8-rpc.test.js` uses raw `node:http` byte writes, not fetch's automatic string encoding, and includes four negative raw-octet cases: `FF`, overlong `C0 AF`, truncated `E2 82` and surrogate `ED A0 80`. It expects generic HTTP 400 and **zero private work**. Positive controls distinguish an intentionally submitted U+FFFD in valid UTF-8 and a valid euro symbol split across three HTTP chunks.

**Red control:** [Linux/Windows run 43959484022](https://github.com/FlareZ123/obfs/actions/runs/43959484022) at exact source `e011d2a60054870d33875e1e1adc1d948f1a3453` failed the new malformed UTF-8 HTTP test in both OS jobs, before changing the parser. Other SCO tests continued to execute in the same targeted job; detailed pass/fail counts require targeted log verification.

## Fix and limitations

`src/sco.js` now imports Node 22-supported `isUtf8` from `node:buffer` and validates the concatenated bounded raw body before UTF-8 decoding and JSON parsing. Invalid bytes throw into the existing malformed JSON catch and return HTTP 400 before any private method invocation. This avoids per-chunk validation, which would incorrectly refuse valid multi-byte sequences split across network chunks. Legitimate U+FFFD remains permitted because its UTF-8 octets are valid.

Implementation is deliberately minimal and uses [Node's documented built-in `buffer.isUtf8`](https://nodejs.org/download/release/latest-jod/docs/api/buffer.html), which returns `true` only for valid UTF-8 encoded data. The new check imposes an additional linear scan of the bounded body. It does not prove the full-session 2.5× budget, prevent authenticated relays, eliminate duplicate JSON keys, or validate application-level method arguments.

Files: `src/sco.js`, `test/sco-malformed-utf8-rpc.test.js`, `docs/SCO_AUTHORIZATION.md`, manual SCO authorization gate. **Green repair:** [targeted Ubuntu/Windows SCO run 43960136902](https://github.com/FlareZ123/obfs/actions/runs/43960136902) passed both operating-system jobs, including the raw-octet negative controls, valid UTF-8 split-chunk positive, related RPC suites, simulations, and strict JSDoc at exact source `01645e2e99b90b32ab99ed0727b79e9865f3022f`. This targeted gate predates the later full integration run cited below.

## Paired byte-admission CPU profile

The reusable [`sims/sco-utf8-admission-profile.js`](../sims/sco-utf8-admission-profile.js) measures the exact permissive `JSON.parse(bytes.toString('utf8'))` route against the strict `isUtf8(bytes)` precheck followed by identical parsing, on valid JSON with a single string argument. It uses nine alternating warm trials, checksum verification, and sizes 96, 1,056, 16,416 and 65,568 UTF-8 bytes; each trial repeats 150,000, 75,000, 7,000 and 1,500 parses respectively. Median processing time per iteration was:

| Valid body bytes | Linux permissive ms | Linux strict ms | Linux ratio | Windows permissive ms | Windows strict ms | Windows ratio |
|---:|---:|---:|---:|---:|---:|---:|
| 96 | 0.00036973 | 0.00040520 | 1.095934× | 0.00082566 | 0.00090010 | 1.090151× |
| 1,056 | 0.00076446 | 0.00082422 | 1.078181× | 0.00162231 | 0.00174922 | 1.078230× |
| 16,416 | 0.00706549 | 0.00739117 | 1.046094× | 0.01930773 | 0.02020174 | 1.046303× |
| 65,568 | 0.02860098 | 0.02964805 | 1.036610× | 0.07375667 | 0.07754420 | 1.051352× |

**Pinned cross-platform gate:** [43960646966](https://github.com/FlareZ123/obfs/actions/runs/43960646966), exact source `87c8126e2185c01204c63f32f74ca69d50dae50d`, both Ubuntu and Windows Node22 jobs successful, including byte-exact HTTP cases, the profile and strict JSDoc for the newly added script. These ratios measure a narrow CPU parsing component under warm-runner conditions and do **not** include network/authentication, private operation computation, cold process startup, or whole application workload. Do not interpret them as a universal 2.5× verdict. All observed medians were below that cap solely for the measured parser component.

## Later full integration

[Full validation run 43961051109](https://github.com/FlareZ123/obfs/actions/runs/43961051109) passed the repository-wide Node 22 Linux/Windows behavior suite, strict source and external JSDoc checks, sampled benchmark steps, and real Ubuntu Chromium checks, pinned at `87c8126e2185c01204c63f32f74ca69d50dae50d`. Node tests: 1,798 on each OS; Ubuntu 1,797 passes/one skip, Windows 1,796 passes/two skips, **zero failures**. This establishes compatibility on the tested software and hardware; it does not settle the larger reconstruction-resistance or worst-case 2.5× objective.

The request-order audit subsequently added real HTTP tests proving that malformed UTF-8 is rejected **after** a non-isolated coarse `authorizeRpc` check, but **before** `authorizeOperation`; under `runRpcIsolated`, invalid bytes reach neither isolation nor coarse/method gates. Valid requests still execute the expected checks. Both OS jobs passed the [targeted ordering run 43962408702](https://github.com/FlareZ123/obfs/actions/runs/43962408702) at exact SHA `ebf4bab4737f2b5f894989227f7bdd252bf22e5a`. These test-only and documentation changes occurred after the full-suite source pin.
