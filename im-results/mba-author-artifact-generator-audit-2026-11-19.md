# Intermediate result: public MBA artifact generator audit

**Agent 7, 19 November 2026. Status: intermediate artifact audit.**

## Scope

This audit examines the public repository:

`BlackBird-BB/Code-Obfuscation-against-Symbolic-Execution-with-Mixed-Boolean-Arithmetic-Permutation`

The inspected repository revision is:

`6bd6f55f30529f39c910d9f37f04296d932c764d`

The inspected `generator.py` blob is:

`fa1581d87342660bc5ae4d30cc3939a21bcea107`

The repository describes itself as code for the 2026 paper with the matching title.
The findings below concern the committed public artifact at that revision.

## Finding 1: the committed SMT replication paths are duplicates

`generator.py` constructs one Z3 solver, creates one randomized protected expression
and one randomized target, then writes `s.to_smt2()` ten times inside its output loop.
The solver is not regenerated inside that loop.

I inspected all nine committed directories under `test on smt/`:

- `1-2-3-16`
- `1-2-3-32`
- `1-2-5-16`
- `1-2-5-32`
- `1-2-5-48`
- `1-3-3-16`
- `1-3-3-32`
- `2-2-3-16`
- `2-2-3-32`

Each directory contains ten SMT file paths and exactly one unique Git blob SHA.
Therefore the 90 committed paths represent nine unique SMT instances, one per setting.

This affects how the committed corpus should be counted. It does not establish what
uncommitted experiments may have been run elsewhere.

## Finding 2: the SMT cyclic-shift generator emits arithmetic right shift

The generator constructs each intended rotation term with the Z3 BitVec expression:

`(x << shift) | (x >> (64 - shift))`

For Z3 bit-vectors, `>>` is arithmetic right shift. The committed SMT files confirm
the distinction directly:

- the cyclic terms contain `bvashr`;
- the separate xor-shift component uses `bvlshr`.

A logical 64-bit left rotation requires zero-filling right shift in the second term.

### Concrete non-injectivity of the emitted cyclic term

Let `1 <= shift <= 63`. Choose any 64-bit `x` whose top bit is one, and define
`x2 = x xor 1`.

For the arithmetic-right term, output bits at positions `shift` through 63 are sign
filled with ones. Flipping input bit zero does not change the lower surviving input
slice of that arithmetic shift. In the left-shift term, flipping input bit zero changes
only output bit `shift`. That bit is already forced to one by the sign-filled
arithmetic-right operand before the OR.

Therefore:

`((x << shift) | (x >> (64 - shift)))`

equals the same expression evaluated at `x2`.

Every emitted cyclic term has this collision for the same pair, so an XOR of such
terms also collides. The emitted cyclic component is therefore non-injective.

This is an implementation-level statement about the public SMT generator. It does not
invalidate a construction that uses the intended logical rotation.

## Finding 3: the C/KLEE path has different shift semantics

The repository's `run_klee/experiment.c` uses `uint64_t`. In C, right shift of that
unsigned type is logical. The KLEE/C path therefore implements the rotation with
zero-fill semantics, while the Z3 SMT generator path emits arithmetic right shift.

The two public evaluation paths are not semantically equivalent for values whose top
bit is one.

## Implication for this repository

The public artifact remains useful for recovering the exact component structure and
for testing generator-aware attacks. Its committed SMT corpus should not be treated as
ten independent randomized samples per directory, and the SMT cyclic layer should not
be treated as the intended permutation without correcting the right-shift operator.

Separate work in this repository evaluates corrected logical-rotation transcriptions
and direct component inversion. This audit should remain scoped to artifact
reproducibility and implementation semantics.

## Reproduction checklist

1. Inspect `generator.py` at blob
   `fa1581d87342660bc5ae4d30cc3939a21bcea107`.
2. Observe that the solver and target are built before the ten-file write loop.
3. Compare Git blob SHAs for the ten files in each committed `test on smt/*` setting.
4. Search a committed SMT file for `bvashr` and `bvlshr`.
5. Compare the cyclic-shift source in `generator.py` with the unsigned
   `uint64_t` implementation under `run_klee/`.

**Agent 7**
