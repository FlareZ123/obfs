# JSON graph/identity SCO envelope pilot

**Date:** 2026-11-19. **Classification:** intermediate semantic/performance experiment. This does not change production SCO.

## Question

The current SCO RPC contract intentionally carries plain JSON data. Earlier repository evidence shows two separate semantic failures outside that contract: JSON cannot generally represent cycles/shared graph identity and special JavaScript values, and a value clone cannot preserve a preexisting client object's identity such as native `await echo(x) === x`.

The preregistered experiment in `workplace/sco-json-identity-envelope-prereg-2026-11-19.md` tests whether an application-owned JSON envelope can repair both properties without a third-party codec.

## Prototype contract

The research codec admits null/boolean/string, ordinary numbers plus tagged special numeric values, `BigInt`, `undefined`, Arrays, ordinary Object-prototype objects and null-prototype objects. It supports cycles and shared references. Every admitted custom property must be an enumerable own string data property. Accessors, symbols, functions, custom prototypes and non-enumerable custom properties are refused.

The client assigns stable opaque `cN` graph IDs. The server decodes fresh clones while retaining object -> `cN` mappings. After invocation, the response graph contains the return value plus post-call input snapshots. Existing server-side input objects keep their `cN`; new response objects receive `rN`. The client reuses its original objects for `cN`, clears/repopulates them from server snapshots, and allocates only `rN` objects. An own `__proto__` key is restored with `Object.defineProperty`.

## Reproduced semantic result

Actions run **44427858413**, evidence commit `75e9990271932466d6936b3da53825fd5aa7cc48`, passed on Ubuntu and Windows Node 22 including strict isolated JSDoc. Both systems reported every preregistered semantic observation true:

- `echo(x)` returned the exact original client object;
- a self-cycle remained a cycle;
- the same client object passed twice remained aliased on the server;
- sparse Array holes were preserved;
- server mutations were reconciled into original client objects;
- returning `input.nested` resolved to the exact original nested object;
- a newly created server result remained new and preserved its own cycle and aliases;
- a getter was rejected;
- an own data property named `__proto__` was preserved without prototype mutation;
- the fixed probes for `-0`, `NaN`, `undefined` and a large `BigInt` passed.

The first run 44427545469 had already completed the runtime observations but failed research-code JSDoc and misreported the getter-rejection boolean because `assert.throws` was treated as returning an error. Commit `ab2ac2f4923421cd32051ce09c1cd8f5a060fb08` repaired only typing and reporting.

## Performance result: veto

Each sample performs 2,048 calls of a deterministic workload with 25,000 integer-mixing rounds. The identity path includes both graph directions and post-call reconciliation. Twelve balanced-order paired samples were retained.

| OS | Records | JSON/native median ratio | identity/native median ratio | identity/native observed pairs <=2.5x | Decision |
| --- | ---: | ---: | ---: | ---: | --- |
| Ubuntu | 1 | 1.0473x | **1.4903x** | **11/12** | strict veto |
| Windows | 1 | 1.0000x | **1.9841x** | **10/12** | strict veto |
| Ubuntu | 32 | 1.4765x | **7.5572x** | **0/12** | exceeded |
| Windows | 32 | 1.8651x | **12.1508x** | **0/12** | exceeded |

Passing one-record medians do not override observed strict pairs above 2.5x under the repository decision rule. The 32-record cost is decisively outside budget.

## Decision

Do **not** progress this full two-way JSON identity-envelope design to browser/HTTP or production integration. It solves the targeted identity/graph semantics within its admitted contract, but full graph traversal plus post-call reconciliation is too expensive for the tested repeated workload.

Narrower descendants would require separate evidence, for example a deliberately persistent remote-handle API or a statically proved read-only/pass-by-value fast path. Automatic selection would itself require conservative interprocedural analysis.

## Reproduction

- preregistration: `workplace/sco-json-identity-envelope-prereg-2026-11-19.md`
- pilot: `sims/sco-json-identity-envelope-pilot.js`
- first runtime/type-red run: 44427545469
- typed two-platform run: **44427858413**
