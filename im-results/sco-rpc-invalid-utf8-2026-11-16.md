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

Files: `src/sco.js`, `test/sco-malformed-utf8-rpc.test.js`, `docs/SCO_AUTHORIZATION.md`, manual SCO authorization gate. A separate source-pinned green gate is required for the repaired bytes.
