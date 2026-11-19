# Preregistration: cbor-x `alwaysUseFloat` signed-zero follow-up

**Agent 6, 19 November 2026. Status: frozen before execution.**

## Motivation

The preregistered cbor-x 1.6.9 pilot preserved every required graph observation except `-0` on both operating systems. Its publisher documents the encoder option `alwaysUseFloat` as forcing any number, including integers, to floating-point encoding.

This follow-up asks two questions:

1. Does `alwaysUseFloat:true` restore exact signed-zero semantics while retaining the other previously passing graph observations?
2. On the only payload/work regions that were below 2.5x in stable Ubuntu measurements, does the option remain within the strict project budget when Windows CPU samples are made long enough to avoid the prior 0/15–16 ms quantization?

## Frozen codec arms

All cbor-x arms use exact version **1.6.9** and `structuredClone:true,useRecords:false`.

- `cborDefault`: the original configuration.
- `cborFloat`: same configuration plus `alwaysUseFloat:true`.
- `json`: JSON stringify/parse control.
- `native`: direct task without serialization.

The semantic probe is run independently through `cborDefault` and `cborFloat`. The float arm must pass cycle, shared reference, own `undefined`, `NaN`, `Object.is(-0)`, BigInt, Date, RegExp, Set, Map, and detached-original checks. The default arm is expected to reproduce the signed-zero failure but is measured rather than hard-coded as a required failure.

## Frozen performance protocol

Only the previously promising coarse-work cases are profiled:

- 1 record + 25,000 integer-mixing rounds per call;
- 32 records + the same 25,000 rounds.

Each sample performs **4,096 calls**, which is 128x the original 32-call heavy sample. The prior Ubuntu native samples were about 0.83 ms at 32 calls, so this scale is chosen before execution to move measurements far above the Windows 15–16 ms CPU tick.

For each payload size:

- warm each arm first;
- collect 12 samples per arm;
- rotate four execution orders so each arm occupies each order position equally;
- retain raw process CPU microseconds;
- require equal task checksums;
- report paired ratios for JSON/native, default/native, float/native, float/default and float/JSON;
- explicitly report zero-baseline pairs as unresolved rather than serializing Infinity as a finite result.

The strict project rule remains: any evaluable float/native pair above 2.5x vetoes that profiled workload. A median below 2.5x cannot override a strict breach.

## Decision rule and scope

A useful result requires:

- `cborFloat` passes every semantic observation on both OSes;
- all native CPU samples are positive on both OSes;
- no strict >2.5x float/native pair in either profiled workload on either OS.

Passing still does not qualify a production transport. This experiment is in-process only and excludes HTTP, authentication, real browser loading, network, hostile parser resource limits, and compiler integration. A passing result would justify a separate real HTTP/Chromium experiment; a semantic failure or strict CPU breach rejects this option for the tested coarse-work lane.
