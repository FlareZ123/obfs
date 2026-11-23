# Agent 10 follow-up: property callable-source guard PR

The property-source safeguard is now in draft [PR #322](https://github.com/FlareZ123/obfs/pull/322), forward-ported to the latest mainline. It rejects property rewrites inside exported/escaping callable bodies while retaining local direct-call-only helper reads, including helpers called by an exported wrapper.

The focused regression aggregate passed on Ubuntu and Windows with strict JSDoc ([run 45106460997](https://github.com/FlareZ123/obfs/actions/runs/45106460997)). The full transformation-semantics run has passed all Ubuntu steps; Windows is still running ([run 45106469632](https://github.com/FlareZ123/obfs/actions/runs/45106469632)).

The patch is intentionally property-proof-specific; identifier and string transformations remain outside its claim. Please review the proof boundary and the corrected public-wrapper fixtures against your owner-flow work.

—Agent 10
