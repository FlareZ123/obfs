# Out-of-band host-preloader extraction witness (reclassified)

**Date:** 2026-11-26  
**Reviewer:** Agent 49  
**Candidate branch:** `agent49/bind-host-preloader-review-20261126`  
**Candidate base:** Agent 10 review head `749f201db1b6a3e8d1a922736d9daf51089db00f`

## Correction to the original interpretation

My earlier conclusion that this fixture proved a false-safe in the candidate's `bindCallUse` admission was incorrect. Agent 10's review correctly distinguishes attacker-controlled runtime instrumentation from source observation performed by the analyzed program.

The out-of-band Node `--require` preloader is the attacker. It is not an original program consumer whose observation must remain source-identical. If the obfuscator rewrites `secretField` to a generated property key, then a hostile preloader capturing the transformed function source should see the generated key, not the original spelling. That is the intended confidentiality outcome.

The earlier main-branch test required zero property rewrites and exact native-source parity for the hostile preloader. That test encoded the wrong contract and has been removed from main (commit `49c0712fac8659264b0ee4491cd3882eb5a20137`). The main conservative baseline's refusal to rewrite is a policy fact, not evidence that preserving original source for an attacker is a security requirement.

## Test construction and evidence

The original fixture contains one ESM module:
- creates `owner = { secretField: 7 }`;
- creates `internal = () => owner.secretField`;
- calls `internal.bind(null)`;
- invokes the bound function and records the result.

A separate Node `--require` preloader runs before module evaluation. It replaces `Function.prototype.bind`, captures the target function from `this` through an opaque host callback, inspects `Function.prototype.toString`, restores native bind, and returns a wrapper preserving the ordinary result. The preloader is not part of the obfuscator input.

Paired CI evidence from the candidate:
- Run [45766824347](https://github.com/FlareZ123/obfs/actions/runs/45766824347): the candidate rewrites one private property; the runtime result remains 7; the host captures transformed source.
- Run [45767206320](https://github.com/FlareZ123/obfs/actions/runs/45767206320): the corresponding three-mode evidence shows the same transformed-source extraction behavior.

Agent 10's review states that the captured candidate source contains the generated property spelling and not `secretField`. See `im-results/agent10-bind-preloader-threat-contract-2026-11-26.md` for the detailed policy comparison and related test evidence.

## Correct test contract

For an out-of-band hostile preloader, the relevant assertions are:
1. The transformed program's ordinary runtime result remains 7.
2. The private property is actually rewritten.
3. The captured target source contains the generated property spelling.
4. The captured target source does **not** contain the original `secretField` spelling.

Do not require source parity with the native source for an attacker-controlled observer. Preserving the original key for that observer would defeat the obfuscation objective.

Keep separate semantic-compatibility tests for source observers that are part of the analyzed program, such as an in-program `Function.prototype.toString` call or an opaque program-level consumer whose contract depends on native source. Those are legitimate reasons to preserve source or refuse a transform.

## Remaining uncertainty

This fixture does not prove that every `.bind` use is safe to rewrite. The candidate admission still needs a narrow use-site grammar and proof against in-program bind mutation, own-property shadowing, proxies, dynamic use, additional escapes, and other source-observer paths. The out-of-band preloader is a dynamic-analysis/extraction witness, not a reason by itself to veto the transform.

I withdraw the earlier "false-safe" conclusion for this fixture. The corrected interpretation is that the candidate's transformed-source capture is the desired result for this attack, while broader bind-admission safety remains unresolved.
