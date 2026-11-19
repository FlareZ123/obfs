# Public input-independent parameter generation is not a secrecy boundary

**Agent 7, 19 November 2026. Classification: intermediate threat-model
reduction plus empirical support.**

## Scope

This note concerns obfuscation whose distributed program deterministically
derives a fixed parameter tuple before or independently of the protected input.
Examples include literal tables, reversibly encoded tables, a public PRNG seed,
or a module initializer that expands public constants into round parameters.

It applies directly to the repository's COO attacker, which receives every
distributed file and may modify and execute them in an instrumented browser,
and to the stronger SNO attacker, which controls the filesystem, Node runtime
and memory. It does not collapse server-private state that remains exclusively
inside the SCO server.

## Reduction

Let a public program contain a deterministic parameter generator

```text
theta = G(public_source, public_environment)
```

where `theta` is independent of the protected input `x`. Suppose the
protected computation subsequently uses `theta` in `F_theta(x)`.

Under COO or SNO, hiding `theta` behind the representation of `G` cannot
create a secrecy boundary. The attacker may execute a modified copy of the
public program, instrument the initializer or the first consumer of each
parameter, and record the concrete tuple. This costs at most the public
initializer execution plus instrumentation overhead. Closure scope, local
bindings, reversible encodings, deterministic PRNG expansion and file layout
can alter automation effort, but they do not prevent extraction in this threat
model.

This reduction makes no claim that `F_theta` itself is easy to invert or
reconstruct. A candidate can still be strong because the concrete transform
remains difficult after `theta` is known. The reduction only rejects
**parameter representation** as the source of that strength.

## Current empirical support

Agent 7's source-normalizer line provides bounded examples of the same
boundary for the tested Int32 author-style MBA family:

- unrolled dataflow mixing: 32/32 post-freeze exact parameter and preimage
  recovery;
- literal table loop: 32/32;
- constant-state flattened control flow: 32/32;
- deterministically encoded public tables: 32/32;
- public LCG seed expansion: 32/32 on Ubuntu and Windows in Actions
  **44454974382**, with the one-round hot candidate also showing zero sampled
  strict >2.5x breaches in that run.

The corresponding code and chronology are in
`im-results/mba-int32-dataflow-mixing-attack-2026-11-19.md`. A later
integration re-freeze adds exact attacker-blob verification and a fresh held-out
seed; its result must be cited separately once complete.

These experiments are stronger than the reduction in one respect: they recover
the concrete transform from source without needing runtime instrumentation.
They remain family-specific and do not prove that every public transform is
easy to invert.

## Research consequence

A source-shape rescue deserves priority only when the surviving difficulty
remains after public, input-independent state has been concretized. Useful next
directions therefore include:

1. input-dependent parameter/control structure whose simplification requires
   reasoning about the protected value;
2. a transform family that remains hard to reconstruct after all concrete
   public parameters are disclosed;
3. SCO-only construction where material state is genuinely server-private and
   the client receives only the minimum protocol outputs required for execution.

Any input-dependent candidate should face both path-sensitive static analysis
and dynamic tracing. Any SCO candidate should face unlimited legitimate
requests and complete interception of every client response. Runtime evidence
still needs the repository's strict 2.5x comparison and an ordinary minified
control.

## Limits

This is a threat-model reduction, not an impossibility theorem for software
obfuscation. It does not bound code-reconstruction effort after parameters are
known, prove a lower bound for symbolic execution, or address a generator that
depends on protected input or inaccessible server state. Source rewriting can
still create engineering friction. Under COO/SNO that friction must be measured
as attacker cost rather than described as secret parameter protection.
