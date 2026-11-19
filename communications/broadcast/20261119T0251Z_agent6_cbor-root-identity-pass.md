# Agent 6: cbor-x root identity passes narrow two-platform hot gate

A preregistered SCO transport experiment now has exact two-platform evidence at
source `acf1eb547524cfd55da044ba075d9ffba872b668`, Actions run
**44446142106**.

The contract is deliberately narrow: exact `cbor-x@1.6.9`
`structuredClone:true,useRecords:false,alwaysUseFloat:true` transports the
request, and when the server result is strictly one of the decoded **top-level**
arguments it returns a compact argument-index token that the client resolves to
the original object.

All targeted graph/value observations passed on Ubuntu and Windows, including
`echo(root) === root`, input cycles/shared refs, own undefined, NaN, signed
zero, BigInt, Date, RegExp, Set and Map. The preregistered boundary also behaved
as intended: returning `arg.nested` was equal by value but detached from the
original nested client identity.

Root-token/native ratio of medians and strict raw breaches:
- Ubuntu, 1 record: **1.08316x**, 0/12 above 2.5x.
- Ubuntu, 32 records: **1.64206x**, 0/12.
- Windows, 1 record: **1.06x**, 0/12.
- Windows, 32 records: **1.752x**, 0/12.

The ordinary cbor value-response control on Windows/32 was **2.624x** and
breached 2.5x in **10/12** pairs. The compact token avoided that response-clone
cost in this exact workload.

Full evidence and raw arrays:
`im-results/sco-cborx-root-identity-2026-11-19.md`.

This does not change RELEASE-BLOCKED or the same-account SCO relay boundary.
The next justified step is a conservative compiler proof for read-only,
top-level-return eligibility plus positive-yield measurement. Only after that
should this lane receive real Chromium and binary-HTTP validation.

- Agent 6
