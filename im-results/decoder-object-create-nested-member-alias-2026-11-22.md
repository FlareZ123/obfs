# Nested Object.create descriptor-member alias: red differential

**Date:** 2026-11-22  
**Researcher:** Agent 42  
**Status:** intermediate compatibility falsification; not an established security result

## Finding

The composed descriptor-map scanner in PR #239 at source pin
`0672b0c5e7f8ce7cea7a506b549d3800b7e72162` still misses a decoder-sensitive
getter installed through an alias to a nested descriptor value:

```js
const descriptors = { ref: {} };
const entry = descriptors.ref;
entry.get = () => String.prototype;

const box = Object.create(null, descriptors);
box.ref.charCodeAt = () => 0;
```

The descriptor map itself is passed to `Object.create` as `descriptors`,
but the mutation is performed through `entry`, which aliases the nested
`descriptors.ref` object. The current reverse alias relation covers identifier
aliases of the descriptor-map object; it does not connect this member-expression
alias to the nested descriptor value. The getter subsequently returns
`String.prototype`, and the following write replaces the decoder's
`charCodeAt` method.

The native program prints the original long string. The obfuscated program's
eager decoder uses the modified intrinsic and prints corrupted characters.

## Reproduction

- Branch: `agent42/pr239-nested-member-alias-20261122`
- Test: `test/decoder-object-create-nested-member-alias.test.js`
- Branch head: `c17aad827c53364c350328f12bea432b4ee10201`
- Parent PR #239 head: `0672b0c5e7f8ce7cea7a506b549d3800b7e72162`
- Existing manual workflow: `.github/workflows/manual-array-source-coercion.yml`
- Workflow run: [44978959616](https://github.com/FlareZ123/obfs/actions/runs/44978959616)

The workflow ran on Ubuntu and Windows with Node 22. On **both** platforms,
the three unsafe cases failed native-versus-emitted output equality, one each
for COO, SNO and SCO. The three matched `Number.prototype` controls passed,
including their positive-yield assertion that one string literal remained
encoded. The pre-existing array/source and Proxy-get steps passed on both
platforms. The job stopped at the new failing step, so the later JSDoc step
was skipped; this run is a red witness, not a green validation of the branch.

## Interpretation and boundary

This is a source-pinned, executable counterexample to the current #239
compatibility claim for the tested descriptor shape. It is not evidence that
all descriptor aliasing is unsafe, nor a proof about arbitrary proxies,
reflection, closures, returned values or opaque host callbacks. It makes no
claim about static reconstruction resistance, hostile-runtime integrity,
environment locking, or the 2.5x runtime budget.

The canonical integration should include this regression alongside the
existing direct identifier-alias, bound-call, cross-file and browser cases.
The PR should remain draft until a single composed source pin passes the
combined native/emitted matrix on both operating systems and the configured
Chromium checks. A passing child-branch run does not establish that combined
source state.

## Next action

Agent 5 owns PR #239 integration. Please add the nested member-expression
alias witness to the canonical regression suite, repair or conservatively
refuse the unsafe path, and run the combined gate on the resulting exact
source SHA. Agent 1 should independently review the member-alias closure
alongside the already identified bound-call and holder cases.
