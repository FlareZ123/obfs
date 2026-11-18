# 2026 MBA-permutation primary implementation artifact

## Source

Primary author repository:

- https://github.com/BlackBird-BB/Code-Obfuscation-against-Symbolic-Execution-with-Mixed-Boolean-Arithmetic-Permutation
- Pinned revision inspected: `6bd6f55f30529f39c910d9f37f04296d932c764d` ("Revision Done.", 2026-06-14).
- Repository description: code for *Code Obfuscation against Symbolic Execution with Mixed Boolean-Arithmetic Permutation*.
- The repository's initial commit `af7a827add47a77a80769f9959d471e2993d7114` is authored by Wang Moxuan.

Relevant files:

- `generator.py`: SMT-LIB generator for the polynomial, xor-shift, cyclic-XOR composition.
- `parallel_test.py`: Z3/cvc5/Yices/Bitwuzla runner.
- `run_klee/genstr.py`: C-expression generator and extensive notes on the construction.
- `anti-mba-simplyfy/genstr.py`: simplifier-test expression generator.
- `run_klee/experiment.c`: unsigned 64-bit KLEE harness.
- `anti-mba-simplyfy/test.c`: unsigned 64-bit example.
- `test on smt/**`: committed SMT-LIB corpus.

## Construction transcribed from the implementation

For each round, `generator.py` applies:

1. A polynomial-XOR layer, `c0 XOR c1*x XOR ... XOR cd*x^d` over 64-bit bitvectors. It accepts coefficients when `c1` is odd, the sum of even-index coefficients is even, and the sum of odd-index coefficients from index 3 is even.
2. An xor-shift layer, starting from `x` and XORing `LShR(x, shift)` for `b-1` shifts selected from 1 through 63.
3. A cyclic-XOR layer with `c` randomly selected shifts. The Python source expresses each term using a left shift OR a right shift.

The C artifacts use `uint64_t` or `unsigned long long`, so their ordinary right shifts are logical. The SMT generator's cyclic term uses Python `x >> k` on a Z3 BitVec, which serializes as `bvashr`. The ordinary xor-shift layer separately uses `LShR` and serializes as `bvlshr`.

## Corpus structure at the pinned revision

The committed `test on smt/` tree contains 90 SMT2 paths across nine configurations. Each ten-file configuration directory maps all ten names to one Git blob SHA. The unique blobs are:

| Configuration | Files | Unique blobs | Blob SHA | Bytes |
| --- | ---: | ---: | --- | ---: |
| 1-2-3-16 | 10 | 1 | `7892f871e67ccade947bda50683c88d17021df47` | 10,555 |
| 1-2-3-32 | 10 | 1 | `e64f872062a4a254e84724606b93e01015907ed0` | 21,893 |
| 1-2-5-16 | 10 | 1 | `29ce50e5aec068736b02f7409c06ca23b82813de` | 15,887 |
| 1-2-5-32 | 10 | 1 | `3b92d2df7a475a139cdadbed69334dad636015d7` | 32,404 |
| 1-2-5-48 | 10 | 1 | `eab53101d103ee152cd21d162267299af37b8d7d` | 48,385 |
| 1-3-3-16 | 10 | 1 | `d1ab8f2a5c9241fcdc900f7701a0f7bcd1445c92` | 11,418 |
| 1-3-3-32 | 10 | 1 | `d19241a6085123d32e7e138bff90dfb2beaa7df3` | 22,863 |
| 2-2-3-16 | 10 | 1 | `82b93432700761b134aaae9edb6d2be141262453` | 12,405 |
| 2-2-3-32 | 10 | 1 | `2b2b246a2cb72651b621d3493c4cb21fd7d23611` | 24,267 |

This matches `generator.py`: it constructs one solver instance and one target equation before entering the ten-file output loop.

## Scope

This resource records the public implementation artifact and observed repository state. It does not establish which exact revision, files, or runs underlie every published table in the paper. Paper-level conclusions require reconciliation against the final paper text and experimental provenance.
