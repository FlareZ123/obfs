# Node WebSocket function-source observation donor

**Date:** 23 November 2026  
**Status:** Intermediate donor evidence; PR #341 is draft and not merged.

## Observation

On Node.js 22, passing a function object to the native global WebSocket's `send` method converts the function to its source string and transmits those bytes in the text frame. The probe uses a real HTTP Upgrade handshake, receives the actual masked client-to-server frame, unmasks it, and compares the payload. This is not a mocked `send` method.

The red-first evidence:
- Run [45238797958](https://github.com/FlareZ123/obfs/actions/runs/45238797958), source pin `f0f86e2efbdba04f3e4e37b326a8e29bb14fb574`: direct native `socket.send(function)` source mismatch on Ubuntu and Windows.
- Run [45240127672](https://github.com/FlareZ123/obfs/actions/runs/45240127672), source pin `8a6d2f2ebb31888f7ff078ff3d5c3a399ada7eec`: detached `sender.call(socket, function)` also missed by the first receiver guard on both OS.
- The observed direct native frame contained `function protocolSensitive(){return "value-723";}`; the transformed frame exposed a rewritten body referencing an obfuscator string-table identifier.

## Donor fix and validation

Draft [PR #341](https://github.com/FlareZ123/obfs/pull/341), source pin `6792b2c8014f2973be6979cc17e859753af558e0`, extends the existing source-observation may-flow predicate for native WebSocket constructor/instance aliases and extracted, bound, `.call`, `.apply`, and `Reflect.apply` sender forms. It suppresses source-altering transforms for non-primitive payloads while preserving primitive-string work.

The focused manual source-observation run [45240583336](https://github.com/FlareZ123/obfs/actions/runs/45240583336) passed on Ubuntu and Windows. It includes seven native-frame patterns (direct, constructor/receiver alias, detached call, bound, apply, Reflect.apply, primitive string), existing source-boundary regressions, and strict project/external JSDoc. The primitive string control asserts positive literal-transform yield.

## Limitations

- This is a Node 22 native-WebSocket witness, not a browser Web IDL proof or a claim about every WebSocket implementation.
- The donor extends the current spelling/alias-based `observesFunctionSource` analysis; it is not yet composed with the read-only lexical BindingId resolver. A locally shadowed `WebSocket` constructor/instance negative control is still requested.
- No full current-main gate, all-mode SCO/COO/SNO acceptance, 2.5× performance result, or attacker-resistance result is established.
- PR #341 remains draft; no source change has been merged into main.

## Disposition

Add Node WebSocket function coercion as a distinct source-observation sink in the canonical intake and future compatibility matrix. Treat PR #341 as a donor, not a release candidate. The overall decision remains **RELEASE-BLOCKED**.
