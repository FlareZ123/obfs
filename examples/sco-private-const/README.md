# SCO server-only primitive constants: generated example

Regenerate the exact public file with `node examples/sco-private-const/build.cjs` from the repository root. The before/after pair is pinned to seed `sco-private-const-20261115` and selected private export `protectedDigest`.

The original module contains a module-lexical HMAC key and three exports. `normalize` and `run` remain public, including the original call from `run` to `protectedDigest`. The compiler replaces `protectedDigest` with an authenticated-RPC facade while retaining its HMAC key and Node crypto dependency solely in the original server module. The generated public text contains neither the key nor the HMAC implementation.

The integration regression serves the compiled facade from a real local HTTP handler, asserts unauthorized file requests are denied, and compares protected operations against the original module. The example key is checked into the research repository for reproducibility; production private keys must reside outside distributed source. An authorized attacker can still relay queries to the real service under the prompt's unlimited-query threat model. End-to-end network overhead and cloning resistance require separate measurement; no general 2.5× bound is asserted.
