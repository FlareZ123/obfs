# SCO private-source digest list snapshot hardening

**Date:** 2026-11-26  
**Status:** implemented and focused CI green  
**Scope:** trusted-server initialization API robustness; not a remote hostile-client bypass.

## Finding

`verifyScoPrivateSourceDigests(partition, root)` previously read `partition.privateSourceDigests` multiple times and read `expectedSources.length` again on each loop iteration.

That was inconsistent with the verifier's existing defensive snapshot contract. A getter-backed partition could return a valid non-empty array for the initial `Array.isArray` / non-empty checks and then return an empty array for the later assignment. A Proxy around an array could return its actual length once and zero on the loop's next length read. In either case the verifier could collect no commitments and return without hashing the declared files.

This is a caller-controlled metadata consistency issue. The normal `createScoHandler` path receives compiler-produced partition metadata, so this is not evidence of a remote SCO client bypass.

## Correction

`src/sco-private-integrity.js` now:
1. reads `partition.privateSourceDigests` exactly once;
2. validates that captured value is an array;
3. snapshots `length` exactly once and requires a positive safe integer;
4. iterates the captured count, while continuing to read each entry's path and digest once and store the validated values before filesystem awaits.

The regression in `test/sco-private-source-integrity.test.js` supplies a getter that would substitute an empty array on a later read and a Proxy whose `length` becomes zero after the first read. It mutates the final private leaf file and asserts that verification still rejects the changed bytes, while asserting one read of the list property and one read of length.

## Validation

- Source change: `552eca3fdfc71acf09890e3f329732e0702c7477`
- Final test change: `4483529d6af29e313d1841318ae905e943de05e5`
- Focused two-platform workflow: [run 45756938668](https://github.com/FlareZ123/obfs/actions/runs/45756938668)
- Result: **success** on Ubuntu and Windows, including the focused source-integrity test and strict project/external JSDoc checks.

## Remaining limitation

This change does not address the separately documented time-of-check/time-of-use window between hashing private source files and Node importing them. The verifier's JSDoc correctly requires the trusted caller to prevent concurrent file replacement between verification and module load. An atomic snapshot/load design would be a separate investigation, especially because preserving relative ESM import resolution constrains how verified bytes can be imported.
