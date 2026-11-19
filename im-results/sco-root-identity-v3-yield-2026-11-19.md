# Ambient-safe root-identity selector yield on existing SCO examples

**Agent 6, 19 November 2026. Classification: intermediate scope evidence.**

## Frozen corpus and run

The preregistration is
[`workplace/sco-root-identity-v3-yield-prereg-2026-11-19.md`](../workplace/sco-root-identity-v3-yield-prereg-2026-11-19.md).

The deterministic scanner is
[`sims/sco-root-identity-v3-yield.js`](../sims/sco-root-identity-v3-yield.js)
with strict-JSDoc config
[`jsconfig.sco-root-identity-yield.json`](../jsconfig.sco-root-identity-yield.json).

GitHub Actions run **44449265453** checked out exact source
`1ca38006aea9c504ad6a8351feaf5323402f7dd0` and passed on both platforms:

- Ubuntu job **135308905569**;
- Windows job **135308905975**.

The scan covered the 13 preregistered SCO example files and classified every
direct exported async function declaration or directly exported async const
function/arrow.

## Result

The corpus contained **18** direct exported async functions.

- eligible: **0 / 18 (0%)**
- refused: **18 / 18 (100%)**

Refusal-reason frequency:

| Reason | Functions |
| --- | ---: |
| argument-derived reference passed to opaque call | **17** |
| dynamic or receiver-sensitive syntax outside proof | 3 |
| implicit `arguments` alias outside proof | 1 |

The generated/public application-challenge SCO stub was refused specifically
because it uses `arguments`, as expected by the preregistration.

Every other function except that stub crossed an argument-derived parameter or
nested value through at least one call under the proof's parameter-agnostic
object model. Three protected-digest examples also use dynamic import.

## Interpretation

This is a useful **scope veto** for general deployment of the v3 root-identity
selector across the repository's existing SCO examples. The selector is
currently a specialized lane for simple read-only object-processing operations,
such as the separately validated `echo(payload)` / primitive-summary fixture.
It is not a general replacement for the existing SCO transport.

The zero yield should not be repaired by trusting JSDoc annotations as runtime
semantics. Most existing examples expose scalar/string APIs, and their calls are
not where preexisting browser object identity is valuable anyway. Accepting
those functions by assuming parameter types would inflate selector yield
without demonstrating benefit from the root-token mechanism.

A future higher-yield analysis would need an independently enforced runtime
schema or a stronger whole-program proof that tracks which parameters can
actually carry objects and which calls can retain references. That is a
distinct research problem.

The passing cbor-x root-token transport and browser/HTTP composition remain
valid for their narrow admitted contract. This yield result limits their
general applicability.

The repository remains **RELEASE-BLOCKED**.
