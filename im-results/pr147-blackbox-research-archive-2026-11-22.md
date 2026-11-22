# Source-pinned preservation of historical PR #147 chosen-query attack research

**22 November 2026. Agent 25. Research archive, not an academically established new result.**

The inactive draft [PR #147](https://github.com/FlareZ123/obfs/pull/147) bundled four distinct adversarial investigations and had seven report/simulator paths absent from main. Its one-sided compatible-permutation linear-wrapper simulator had subsequently been extended on main into the broader [established affine-wrapper theorem](../results/compatible-permutation-one-sided-linear-wrapper-inversion.md), whose proof and bounds supersede that portion. Silently closing the draft would otherwise leave its independent polynomial and full-sandwich experiments accessible only through a branch that may eventually be pruned.

## Exact preserved corpus

The following **seven paths** were copied to main with unchanged Git blob IDs from `agent2-polynomial-blackbox-20261118`, after a paired source-pinned replay. These are the original 18 November research documents and simulations, preserving the author's claims, unsuccessful counterexample, caveats, and exact methods:

| Path | Git blob SHA |
| --- | --- |
| [Black-box linear-wrapper research](compatible-permutation-linear-wrapper-blackbox-2026-11-18.md) | `dbd382a25e1f5d686a3be7cc15b5abbdacfcdf7b` |
| [Two-sided affine-fiber heuristic and counterexample](compatible-permutation-two-sided-affine-fiber-2026-11-18.md) | `38884c7278b6d31bc015c36af77ce7c46b84c4bf` |
| [Polynomial oracle and shell evidence](permutation-polynomial-blackbox-2026-11-18.md) | `5400f95b7d0b1739c9283edbd1db165b4fbc53df` |
| [Public sandwich runtime-extraction evidence](sandwich-imul-runtime-extraction-2026-11-18.md) | `f592dfa8fc500db7fe272735085d020a4d9024b0` |
| [Polynomial oracle reproduction](../sims/permutation-polynomial-blackbox.js) | `cc196c07f0e12c79ccb0a38d8711a3ed706068b3` |
| [Three-stage polynomial/XOR/rotation reproduction](../sims/permutation-polynomial-linear-shell-blackbox.js) | `57a66cef631bdb99f19e6a5951d249ed291ff99e` |
| [Public sandwich instrumentation reproduction](../sims/sandwich-imul-runtime-extraction.js) | `7f13fa3b96adc4efc962c443b0a12c8d0b4902a7` |

Each main copy was verified against the branch's exact blob after committing. The three scripts require only Node's built-in `node:perf_hooks` and run independently. The main `package.json`, `jsconfig.external.json`, `src/ast.js` and `src/cross-properties.js` blobs were byte-identical to those of the replay branch at validation.

## Cross-platform reproduction

In an isolated branch based on main, the seven files were copied unchanged and the existing `manual-attacker-normalizer.yml` workflow was temporarily scoped to the three simulators and strict compiler/external JSDoc. No workflow was added to main.

[GitHub Actions 44982003376](https://github.com/FlareZ123/obfs/actions/runs/44982003376) at exact SHA `c1385adaf138d3f28e72d31fdc0013e1fdc1fc42` completed **green on Ubuntu and Windows** (Node 22) for all five prescribed steps:

1. `node sims/permutation-polynomial-blackbox.js`
2. `node sims/permutation-polynomial-linear-shell-blackbox.js`
3. `node sims/sandwich-imul-runtime-extraction.js`
4. `npm run typecheck:external`
5. `npm run typecheck`

The simulation scripts contain their own exact input/output and recovery assertions. Passing establishes only reproducibility on these fixed synthetic families and public artifacts; it gives no general guarantee against arbitrary JavaScript or the complete external Wang et al. construction.

## Research and queue disposition

This is a **negative candidate-screening** and attack-method archive. A two-sided sealed black-box permutation with unrestricted wrappers remains outside the proved one-sided theorem. The two-sided affine-fiber report explicitly documents a sparse-triangular counterexample against its finite random-derivative sampling heuristic, which must not be omitted in downstream summaries. Public JavaScript runtime extraction leverages mutable instrumentation authority and cannot be generalized to an inaccessible trusted server's private source.

All seven previously unique files are now independently recoverable from main. The eighth PR-changed path, `sims/compatible-permutation-linear-wrapper-blackbox.js`, is already present there in a stronger affine-offset form. Closing the old draft as superseded archival preserves all exact-source methods, reports, and old branch history. The repository's strong-protection decision remains **RELEASE-BLOCKED**.
