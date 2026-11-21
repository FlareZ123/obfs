# SCO WebAuthn proof binding: signed-zero HTTP substitution and verified exact-value repair

**Agent 5, 21 November 2026. Classification: experimental protocol-authorization correctness, intermediate security witness.** Primary strong-obfuscation release remains **RELEASE-BLOCKED**.

## Independent hypothesis

The experimental real-browser WebAuthn SCO gateway in `test/sco-webauthn-origin-boundary-browser.js` stores a parsed JSON argument alongside a server-issued random challenge and later validates arguments with JavaScript strict equality (`requested!==record.value`, vector members `requested[index]===value`). JavaScript considers `+0===-0` true; `Object.is(+0,-0)` is false. JSON.parse of the **raw** valid JSON token `-0` retains negative zero, even though ordinary `JSON.stringify(-0)` emits `0`. A private method may distinguish these two accepted numeric arguments, so a one-use signed proof for one value cannot legitimately authorize the other if the authorization policy promises exact arguments.

Standards background: [MDN equality and sameness](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Equality_comparisons_and_sameness), [MDN Object.is](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is), and [W3C WebAuthn Level 3](https://www.w3.org/TR/webauthn-3/). WebAuthn signs an authenticator response bound to the server challenge. Binding that challenge to a particular application operation remains the server application's own responsibility.

## Real Chromium/HTTP red witness (before repair)

The deliberately failing source at `38ce510f5cf46ab5c59acfe751c35741af9529fb`, branch `agent5/sco-signedzero-proof-20261121`, was run in [manual Linux Chromium workflow 44961575939](https://github.com/FlareZ123/obfs/actions/runs/44961575939), job `137021312995`, Node 22.23.5.

A real allowed-origin browser credential signed a fresh `navigator.credentials.get` challenge for a trusted server record created by submitting `{"method":"proofZero","args":[-0]}` to `/proof-challenge`. The test asserted the server had actually stored `Object.is(record.value,-0)===true`. Without asking for a second signature, an independent raw HTTP client forwarded that same signed proof and session cookie to the actual `createScoHandler` RPC endpoint with `{"method":"proofZero","args":[0]}`.

The pre-repair log reported:

```text
SCO_WEBAUTHN_SIGNED_ZERO {"issued":"-0","submitted":"+0","recordedNegativeZero":true,"substitutedStatus":200,"substitutedBody":{"ok":true,"value":"positive-zero"},"privateCalls":1}
```

The original challenge authorized the sign-sensitive server-private `proofZero(value)` method, which observes `Object.is(value,-0)`. It executed with the *other* signed-zero value and returned `positive-zero`; this is an **actual unauthorized argument substitution under the experimental exact-argument policy**. There was no credential signature forgery and no bypass of the session cookie: one genuinely issued proof was repurposed. The test's expected 403 assertion intentionally failed. The result does not suggest a separate external source disclosure, new code recovery capability or a WebAuthn standard flaw.

## Fix and source-coincident controls

The narrowly scoped experimental verifier now uses `Object.is(requested,record.value)` for scalar arguments and `Object.is(requested[index],value)` for every array element; it still verifies the original challenge, session, origin, RP hash, UP/UV flags, signature and one-use challenge consumption.

The first repaired pin `d370a6fa01ead7ead66e098ac61cafbe59f77676` passed the full targeted Linux Chromium WebAuthn workflow [44961670059](https://github.com/FlareZ123/obfs/actions/runs/44961670059), including strict project and external JSDoc. It observed **403** for the `-0`-proof/`+0`-request substitution, **zero** private `proofZero` invocations on rejection, and separate **200** accepted controls for exactly `+0` and exactly `-0`, with different expected `positive-zero` and `negative-zero` results.

The extended source pin `d11de71d0e2615cd042efc56f4f452263920dee3` passed full targeted Chromium and JSDoc in [run 44961796697](https://github.com/FlareZ123/obfs/actions/runs/44961796697), job `137022006338`. It additionally tested a real 128-element signed proof-challenge vector containing `-0` at index 17. The copied HTTP client replacing only that element with `+0` received **403**, with zero extra private batch executions; a fresh signed proof for the exact `-0` vector received **200**, with matching full output and one private batch execution. A raw JSON serializer in the test preserves intentional `-0` tokens on both the issuing and submitted sides, preventing a test-harness `JSON.stringify` normalization from masking the distinction. The existing other-origin online relay, cross-origin WebAuthn refusal, challenge replay, wrong payload, modified signature, session revocation, batched performance sample and unauthenticated-enrollment negative control continued to pass.

## Outcome and limitations

This is a concrete **server-authorization correctness repair** in the experimental WebAuthn integration fixture. The generic `src/sco.js` handler already delegates operation authorization to an application callback; the bug and its repair live in this example callback. Production integrations must independently define a canonical, semantic argument representation, especially across number, JSON, and unusual input types. `Object.is` closes the demonstrated `+0/-0` distinction for this fixture's admitted safe integers and fixed-length numeric arrays; it is not a general JSON canonicalization protocol.

The accepted same-origin online relay remains possible under the project's unlimited-legitimate-requests SCO threat model. Moreover, the separate deliberately unauthenticated enrollment fixture still accepts a software-controlled credential as already recorded in `im-results/sco-webauthn-untrusted-enrollment-software-key-2026-11-21.md`. Neither issue is repaired by exact numeric comparison.

The Node/Chromium targeted runs do not provide a general 2.5x CPU-compute bound or browser portability outside the tested Linux runner. The underlying primary strong-protection objective stays **RELEASE-BLOCKED**. Preserve this as bounded intermediate experimental evidence and a native runtime regression gate, rather than promote it as a universal obfuscation or cryptographic advance.
