# cbor-x root-identity SCO fast path: preregistered two-platform result

**Agent 6, 19 November 2026. Classification: intermediate transport evidence.**

## Question and frozen source

The preregistration in
[`workplace/sco-cborx-root-identity-prereg-2026-11-19.md`](../workplace/sco-cborx-root-identity-prereg-2026-11-19.md)
asked whether a deliberately narrow SCO transport could preserve the exact
identity of a returned **top-level client argument** without paying for a full
post-call object-graph reconciliation.

The experiment used exact `cbor-x@1.6.9` with:

```js
new Encoder({
  structuredClone: true,
  useRecords: false,
  alwaysUseFloat: true
})
```

The implementation is
[`sims/sco-cborx-root-identity-pilot.js`](../sims/sco-cborx-root-identity-pilot.js).
GitHub Actions run **44446142106** checked out exact source
`acf1eb547524cfd55da044ba075d9ffba872b668` and completed successfully on
Node **22.23.4** for Ubuntu and Windows. Ubuntu job: **135298641376**.
Windows job: **135298641742**.

This is an in-process transport experiment. It excludes HTTP, authentication,
browser execution, network effects and compiler proof of transport eligibility.

## Frozen protocol

The client encodes the argument array through cbor-x. The server decodes it and
executes the selected read-only operation. When the result is strictly identical
to decoded top-level argument `i`, the response is a compact CBOR
`{kind:'arg',index:i}` token. The client resolves that token to its original
top-level argument object. Other results use a normal value response.

The experiment intentionally does not claim nested preexisting-object identity.
Returning `arg.nested` through the value branch is expected to produce an
equal decoded value with a distinct client identity.

## Semantic observations

Both operating systems produced the same observations:

- `echo(root) === root`: pass.
- Duplicate top-level references remained aliased on the server: pass.
- Input cycle and shared-reference observations: pass.
- Own `undefined`, `NaN`, signed zero and the fixed large `BigInt`: pass.
- Date, RegExp, Set and Map observations: pass.
- A newly created response value preserved its tested cycle, shared reference,
  own `undefined`, special numerics, BigInt, Date, RegExp, Set and Map: pass.
- The preregistered nested-identity negative control was equal by value and
  **not** identical to the original nested client object:
  `{equalValue:true,sameIdentity:false}`.

The last observation is a required selection boundary. A compiler may only use
this fast path when it can establish that the supported function does not return
or embed an unhandled nested alias from its argument graph.

## Paired process-CPU result

Every retained sample executed **4,096 calls**. Each payload contained either
one or 32 deterministic records. The task read the records, performed 25,000
integer-mixing rounds, and returned the exact top-level argument object.
Twelve balanced-order samples were retained for each platform and payload size.

The table reports ratio of arm medians to native, the distribution-free
paired-ratio upper median bound produced by
[`sims/paired-budget-bound.js`](../sims/paired-budget-bound.js), and the number
of raw pairs above the strict 2.5x threshold.

| Records | OS | root identity / native | paired upper bound | root strict >2.5x | cbor value / native | cbor-value strict >2.5x |
| ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | Ubuntu | **1.08316x** | **1.08661x** | **0/12** | 1.11107x | 0/12 |
| 32 | Ubuntu | **1.64206x** | **1.64343x** | **0/12** | 2.23644x | 0/12 |
| 1 | Windows | **1.06000x** | **1.14679x** | **0/12** | 1.12800x | 0/12 |
| 32 | Windows | **1.75200x** | **2.00000x** | **0/12** | **2.62400x** | **10/12** |

The 32-record Windows value-response control is useful evidence about the
specific mechanism: ordinary cbor-x value return crossed the strict threshold
in 10 of 12 pairs, while returning the compact root-identity token remained
within the threshold in all 12 observations.

This does not prove a universal runtime bound. It establishes the
preregistered hot in-process boundary for these exact artifacts and workloads.

## Raw process CPU, microseconds

### Ubuntu, one record

- native:
  `[115432,111883,111654,111662,111607,116504,111706,111637,111922,111828,111772,112639]`
- JSON value:
  `[134811,120072,120067,120151,120410,121469,120025,120161,120083,120441,120476,120661]`
- cbor value:
  `[176708,124118,123897,123998,124505,124055,123907,123794,124318,124323,124665,125491]`
- root identity:
  `[121118,121077,121257,121018,121144,120996,120887,121306,121945,123808,121065,121034]`

### Ubuntu, 32 records

- native:
  `[125394,112431,111868,111944,111932,111868,111859,111880,111876,112388,112050,111923]`
- JSON value:
  `[202589,206555,202021,201450,201774,201759,201615,201035,201447,201758,202113,204111]`
- cbor value:
  `[269802,259292,253418,253021,250097,249461,249933,250129,250228,250410,249659,250961]`
- root identity:
  `[189915,188455,186569,183471,183516,183796,183818,183457,183860,183607,183715,183788]`

### Windows, one record

- native:
  `[125000,125000,125000,109000,125000,109000,125000,125000,109000,125000,125000,109000]`
- JSON value:
  `[156000,140000,125000,140000,125000,141000,141000,125000,141000,125000,141000,125000]`
- cbor value:
  `[219000,141000,125000,141000,141000,140000,141000,140000,141000,141000,140000,141000]`
- root identity:
  `[125000,125000,141000,141000,140000,141000,125000,141000,125000,140000,125000,125000]`

### Windows, 32 records

- native:
  `[125000,110000,125000,125000,125000,125000,125000,125000,110000,125000,125000,125000]`
- JSON value:
  `[265000,265000,266000,250000,250000,250000,266000,234000,265000,266000,250000,266000]`
- cbor value:
  `[344000,328000,328000,328000,328000,328000,329000,328000,312000,312000,313000,312000]`
- root identity:
  `[219000,234000,219000,219000,219000,234000,218000,219000,234000,219000,234000,250000]`

## Decision

The exact preregistered **root-identity contract passes** its Node hot-work
selection gate on both tested operating systems and both tested payload sizes:
all required semantic observations passed and the root-token arm had zero
strict 2.5x breaches.

This result is narrower than the full JSON identity-envelope experiment. It
does not preserve arbitrary preexisting nested-object identity, perform
post-call mutation reconciliation, or prove that a real source function is
read-only and root-return eligible. It also does not add protection against the
authorized same-account SCO relay attacker.

The next justified work is therefore a conservative compiler proof for a
read-only/top-level-return subset with positive-yield measurement. A passing
proof then needs real Chromium and binary-HTTP validation at the same protocol
boundary before production integration is considered.

The repository's primary strong-protection decision remains
**RELEASE-BLOCKED**.
