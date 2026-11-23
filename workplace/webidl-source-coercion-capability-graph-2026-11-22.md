# Web IDL source-coercion capability graph: proposal for canonical source observer

**Status: architectural proposal for review, not an implemented feature or
a validated proof of completeness.** Agent 19, 22 November 2026.

## Motivation: two confirmed semantic-failure classes

The obfuscator transforms private function bodies as part of safe
identifier and property renaming. Host APIs can implicitly call ECMAScript
ToString on a function value, exposing its exact original source spelling.
A semantics-preserving transform must account for such implicit conversion.

Current source-pinned Chromium witnesses demonstrate two kinds of sinks:

1. **Host method arguments:** `CSS.escape(fn)` and
   `element.setAttribute(name, fn)` or `setAttributeNS(..., fn)`.
   The latter exposes the converted value through
   `element.getAttribute(name)`. Fixed bounded guards are in draft
   [PR #308](https://github.com/FlareZ123/obfs/pull/308)
   and [PR #309](https://github.com/FlareZ123/obfs/pull/309);
   their exact native red-green evidence is in
   `im-results/css-escape-function-source-2026-11-22.md` and
   `im-results/dom-attribute-function-source-2026-11-22.md`
   on their respective research branches.
2. **Writable host properties:** `element.id = fn` and
   `element.textContent = fn` retain exact source text in the
   subsequent property read. Native Chromium RED
   [45085898680](https://github.com/FlareZ123/obfs/actions/runs/45085898680)
   at `da228cd965fbcc211a46c0d96e29c32c8c27dc2d`,
   with independent primitive-only positive yield. This class has
   **no implemented guard** in the independent witness branch.
   Reproduction and limits:
   `im-results/domstring-reflected-property-source-2026-11-22.md`
   on `agent19/domstring-reflected-property-red-20261122`.

The [DOM Living Standard](https://dom.spec.whatwg.org/) declares
many DOMString argument and attribute types.
The [CSSOM specification](https://drafts.csswg.org/cssom/)
declares CSSOMString arguments. Web IDL conversion and subsequent
host API serialization/storage should be considered as observable
source-code channels whenever the input may be a function.

## Proposed analysis domain

A central abstract capability summary could track a finite set of host
receiver identities and method references alongside ordinary local
value-flow. Suggested labels:

- `Global`, `CSSNamespace`, `Document`, `Element`,
  `Node`, `CharacterData`, `NativeMethodReference`;
- `MayBeFunction`, `DefinitelyPrimitive`, `Unknown`
  for a converted input, with local lexical binding and import/export
  provenance where existing analysis can establish it;
- a source-observation obligation recording that exact input
  `Function#toString` spelling might become externally readable.

Represent known host **call** sinks and **assignment** sinks using
separate descriptors, retaining the argument index or assignment RHS,
receiver requirement, Web IDL conversion category, and any optional
error/validation semantics. Example descriptor forms in prose:

- `CSSNamespace.escape`: call, argument 0, CSSOMString;
- `Element.setAttribute`: call, arguments 0 and 1, string-valued
  qualified name and value;
- `Element.setAttributeNS`: call, arguments 1 and 2 with namespace
  conversion treated separately;
- `Element.id`: assignment RHS, DOMString;
- `Node.textContent`: assignment RHS, nullable DOMString.

These are an initial candidate set. A standards-driven inventory would
need explicit browser-version support and native tests before broad
claims of coverage. Other likely candidates include
`Document.createTextNode`, `Document.createComment`, and
`Element.insertAdjacentText`; none is established as a compiler
mismatch by these particular experiments.

A syntax-specific evaluator should answer two separate questions:
whether the **receiver really may be a native host object** and whether
the **converted input may be source-bearing**. Local aliases, direct
element factories, destructuring, `.bind`, `.call`, `.apply`,
`Reflect.apply`, and known constant property keys should reuse
existing bounded may-flow, not independent per-API rescans.

## Correctness and yield policy

When host capability and source-bearing input are both possible,
conservatively preserve the relevant original function body and any
property/binding spellings observable through source text. Preserve
cross-file dependency closure where function and sink inhabit different
modules. If receiver or value proof is incomplete, record that
uncertainty rather than claiming exhaustive safety.

When a sink input is a proven primitive, continue renaming independently
owned private fields. For every new sink category, keep a transformed
positive fixture with an actual nonzero private-key yield.
Avoid global bans on names such as `id`, `textContent`, or
`setAttribute` when they belong to ordinary user-created objects.
Conservative over-refusal remains a measurable obfuscation-yield loss
and should be reported separately from semantic correctness.

## Validation program

For each descriptor and supported alias form, create a source-bearing
negative and primitive-only positive; test with the same compiler seed,
mode and options. Use native Chromium for browser Web IDL semantics and
isolate emitted ES modules through real HTTP origins and module imports.
Export only already-observed primitive data from the negative test:
exporting the source-bearing function itself can trigger an unrelated
conservative global source guard and mask the target defect.

Record source SHAs and distinguish three outcomes:
1. analyzer misses exact source-observation classification;
2. actual native versus emitted behavior differs;
3. emitted private-key positive transforms and still matches native.
An isolated red runner is valuable intermediate evidence and should
remain outside main until a guard is validated. Final integration on
canonical current-main needs source-pinned two-OS full Node, strict JSDoc,
and native Chromium tests. Compile-time overhead and refusal/yield rate
should be measured separately. These source-preservation checks add
no inherent generated runtime instructions but could affect what other
transforms remain eligible.

## Security and scope boundary

The capability graph addresses compiler **semantic equivalence** for
measured API contracts. It cannot establish code secrecy against a
client who controls DevTools, nor against a server adversary who can
read memory and filesystem. It does not prove source resistance under
arbitrary native monkey-patching or future browser API additions.
Research release policy remains **RELEASE-BLOCKED** and the 2.5× runtime
requirement remains independently unverified.

This should complement the existing Agent 16
`workplace/agent16-public-callable-source-closure-2026-11-22.md`
proposal. Agent 16 covers exported callable, class, constructor, factory
return, and public-reachability categories with positive private-yield
constraints. The present proposal focuses on **additional native host
observation roots**, especially property assignments, that could feed
the same source-closure propagation and owner proof. Designing one
shared proof would reduce overlapping per-API and per-export special
cases.

Suggested integration owner: Agent 3, who maintains the canonical
source observer. The current draft PRs are targeted implementation
evidence; a registry design can be evaluated incrementally without
silently broadening those source-pinned correctness claims.
