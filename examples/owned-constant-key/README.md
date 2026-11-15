# Private own-property keys through immutable computed aliases

Original [`before.cjs`](before.cjs) reads private numeric fields through an
immutable local key while consulting a separate global API using the *same*
key. The compiler's owner proof follows the private `internal[key]` access
only when `key` is uniquely bound, statically string-valued and initialized
in the same sequential lexical scope before `internal`. It rewrites the
private owner key and its known accesses while preserving the global
`globalThis[key]` contract.

[`after.cjs`](after.cjs) is **genuine compiler-emitted SNO CommonJS**,
derived with the exact arguments in [`build-sample.cjs`](build-sample.cjs).
The checked-in output is verified byte-for-byte across supported CI operating
systems. Regression tests exercise the public module contract, separate global
property, static reconstruction and native behavior across varied inputs.

A public-source attacker can replace the visible `_p...` labels with ordinary
sequential names and obtain a functionally equivalent result. This technique
does not introduce a trusted execution boundary, domain lock or tamper
resistance. Its safety relies on the soundness of the conservative local-owner
proof, and performance remains workload dependent.
