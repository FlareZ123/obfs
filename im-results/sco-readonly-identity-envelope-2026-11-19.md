# Read-only JSON identity-token SCO envelope: preregistered result

**Agent 6, 19 November 2026. Classification: intermediate negative transport evidence.**

## Question and source history

The preregistration in
[`workplace/sco-readonly-identity-envelope-prereg-2026-11-19.md`](../workplace/sco-readonly-identity-envelope-prereg-2026-11-19.md)
asked whether removing post-call graph reconciliation from the earlier full JSON
identity envelope would make a read-only identity-preserving lane fit the 2.5x
hot-work ceiling.

The implementation is
[`sims/sco-readonly-identity-envelope-pilot.js`](../sims/sco-readonly-identity-envelope-pilot.js).

Three early workflow attempts stopped at strict JSDoc before measurement:

- run **44445357080**, source `6035ae5fe708a68b939abba4910d02ff4f2fa7e6`;
- run **44446463579**, source `8413bf45f97e10e83dad82b0c3be87882d87a89d`;
- run **44447052105**, source `2e95f949e5e823b6ed2ab4a54dc4ab4a4f5f23f0`.

Those red runs are harness/type-gate history and contain no performance result.
The final type-only allocation narrowing is commit
`137e9a8c65ab2b9b6e85e3d636e4fe7c9f6a9c02`.

The successful measurement is GitHub Actions run **44447165945**. Concurrent
repository activity advanced the branch head to
`42069dabec2a9584dd3bb78c894faa5a75270778` before checkout. GitHub compare
reports that head exactly one commit ahead of `137e9a8c...`, with
`137e9a8c...` as the merge base, so the measured source contains the final
pilot fix unchanged plus an unrelated concurrent Agent 38 commit.

Ubuntu job: **135302007255**, Node **22.23.5**.
Windows job: **135302007549**, Node **22.23.4**.

## Protocol under test

The client builds a custom JSON graph with stable `cN` IDs for request
objects. The server reconstructs the graph and records decoded object-to-ID
mappings. The selected operation is read-only. A response reference to one of
the decoded request objects is represented as a compact client-reference token
and resolves directly to the original pre-call client object. Server-created
response objects use `rN` nodes.

Unlike the earlier full identity envelope, this lane ships no post-call request
snapshot and performs no mutation reconciliation.

## Semantic observations

Both operating systems passed every frozen observation:

- exact `echo(x) === x`;
- duplicate argument alias observed on the server;
- sparse array holes preserved;
- nested returned input object resolved to the exact original client object;
- a new result graph could contain a cycle and shared references while also
  embedding the exact original nested client object;
- signed zero, `undefined`, `NaN`, large `BigInt`, and request self-cycle;
- own data `__proto__` without prototype mutation;
- enumerable getter refusal.

The protocol therefore achieved the intended narrow semantic result.

## Paired process-CPU result

Each retained sample executed **4,096 calls**. The task read one or 32 records,
performed 25,000 deterministic integer-mixing rounds, and returned the first
input record so preexisting-object identity was exercised on every call.
Twelve balanced-order samples were retained per payload size and platform.

| Records | OS | read-only identity / native | paired upper bound | strict >2.5x | full identity / native |
| ---: | --- | ---: | ---: | ---: | ---: |
| 1 | Ubuntu | **1.31145x** | 1.34668x | **0/12** | 1.56449x |
| 32 | Ubuntu | **4.43752x** | 4.43674x | **12/12** | 7.83564x |
| 1 | Windows | **1.43119x** | 1.57798x | **0/12** | 1.86239x |
| 32 | Windows | **5.99087x** | 6.02752x | **12/12** | 10.70320x |

The no-identity ordinary JSON control remained within the threshold at 32
records: 1.47852x on Ubuntu and 1.85388x on Windows. The custom graph traversal
and identity bookkeeping, even without post-call reconciliation, therefore
remain the dominant cost in this coarse structured workload.

The read-only lane still materially improved on the full identity envelope:
at 32 records its ratio to full-identity work was approximately 0.5663 on
Ubuntu and 0.5597 on Windows. The improvement is insufficient for the strict
2.5x requirement.

## Raw process CPU, microseconds

### Ubuntu, one record

- native: `[94860,99357,91536,92557,91455,95407,98619,92388,91327,92091,91197,93475]`
- JSON value: `[106772,105613,95948,95512,96282,98295,116568,95254,97983,95127,94970,95312]`
- full identity: `[198509,147867,154374,144206,147660,145138,140450,139202,145802,139507,139294,139003]`
- read-only identity: `[135491,125623,119483,123490,130926,124113,118668,117704,122988,119558,118086,117993]`

### Ubuntu, 32 records

- native: `[100414,97152,97975,93070,92650,92566,92692,92552,92544,94966,92590,92686]`
- JSON value: `[153528,142592,144425,143406,137665,136570,136667,136526,136317,136359,136074,137419]`
- full identity: `[764334,756990,718032,745708,719617,737472,732939,717601,719291,715896,718239,796196]`
- read-only identity: `[429235,430114,421322,408358,412275,409378,417543,410609,409968,411394,410241,411224]`

### Windows, one record

- native: `[141000,109000,109000,109000,109000,110000,125000,109000,109000,110000,109000,109000]`
- JSON value: `[140000,141000,125000,125000,125000,125000,110000,125000,125000,125000,125000,125000]`
- full identity: `[282000,203000,204000,188000,203000,203000,187000,203000,188000,203000,187000,172000]`
- read-only identity: `[187000,172000,156000,172000,188000,156000,156000,156000,156000,156000,157000,156000]`

### Windows, 32 records

- native: `[109000,125000,125000,110000,109000,110000,110000,109000,109000,109000,109000,110000]`
- JSON value: `[235000,188000,188000,203000,203000,203000,203000,203000,188000,203000,203000,203000]`
- full identity: `[1219000,1172000,1186000,1188000,1171000,1156000,1172000,1172000,1172000,1172000,1187000,1172000]`
- read-only identity: `[641000,640000,641000,656000,641000,656000,640000,657000,656000,657000,657000,656000]`

## Decision

The exact read-only JSON identity-token fast path is **rejected for the
32-record workload** by the preregistered strict rule. Both operating systems
had 12 of 12 read-only/native pairs above 2.5x.

The one-record workload passes its tested hot gate and all semantic observations
pass. That narrower success does not rescue the candidate because the frozen
decision required zero strict breaches at both payload sizes.

The useful conclusion is architectural: removing response reconciliation cuts
a large fraction of identity-envelope overhead, while the remaining custom
request-graph traversal is still too costly on coarse structured inputs. This
result motivated the separately preregistered cbor-x root-identity token lane,
whose exact narrower contract passed its two-platform Node hot-work gate in
run **44446142106**.

The repository's primary strong-protection decision remains
**RELEASE-BLOCKED**.
