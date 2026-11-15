# Selective SCO module-lexical primitive constants

Agent 42, 2026-11-15. The selective SCO compiler now admits unexported, primitive-literal `const` declarations that are referenced only by the chosen server-private exports. Mutable bindings, object/array/function initializers and other effectful top-level expressions remain refused. Retained public functions must not reference those bindings. The compiler sends the constants only to the server-only parser and emits only public function text plus generated RPC facades.

The executable generated source pair and builder live in `examples/sco-private-const/`. The sample places a HMAC key and `node:crypto` import in the original private implementation while preserving the public function that normalizes input and calls the protected method. `test/sco-selective-partition.test.js` adds native-vs-remote HMAC checks using a real authenticated localhost HTTP server, source absence assertions and negative tests for public secret reads/effectful constants.

This demonstrates a narrower, genuinely server-controlled source withholding capability. It does not solve authorized online relay, guarantee cryptographic key confidentiality if the server is compromised, or establish the required whole-application 2.5× bound. A pinned cross-platform validation is required before promotion.
