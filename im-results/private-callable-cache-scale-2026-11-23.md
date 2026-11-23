# Cached callable-privacy inventory: source-pinned compiler A/B

**Date:** 23 November 2026. **Status:** intermediate compiler-build-time experiment, not a security/performance release decision.

## Hypothesis and exact source boundary

The conservative callable-source privacy proof introduced with merged [PR #322](https://github.com/FlareZ123/obfs/pull/322) is an AST-global fact but was recomputed inside `proveLocalObject` for each candidate private owner. Caching the exact private callable Set on the immutable parsed AST should avoid redundant work without altering emitted source or which private owners are proved.

- **Baseline source SHA:** `dd4ae7be4098cf45173418dee151b3f7e5ad1291`; original repeated per-owner proof with a new differential scale fixture.
- **Candidate executable source SHA:** `c0d9def6aef2f562a2d2eb24d75becc20cc1bfcc`; `src/properties.js` adds `privateCallableCache` WeakMap keyed by AST and reuses the unchanged proof.
- **Harness:** `sims/property-private-cache-paired.js`, same candidate SHA. Both variants loaded in one Node 22.23.4 process, seven sequential balanced alternations at each fixed owner count, after warmup on both variants. Both checkout directories separately install locked dependencies.
- **CI:** [source-pinned cross-platform run 45109724033](https://github.com/FlareZ123/obfs/actions/runs/45109724033): Ubuntu job `137479064489`, Windows job `137479064157`; both passed, alongside strict focused JSDoc and scale/parity tests.
- Owner fixture: 256/512/1024 direct-call-only private helper functions, one unique object per helper, two own literal property reads per object. This is a property-analysis **build-time** workload, not an obfuscated program runtime benchmark.
- The harness asserts identical **emitted SHA-256 bytes** between cached and uncached implementations and identical positive property-rewrite count at every size on each OS. No output behavioral change was observed. The separate focused test also checks generated source against native evaluated CommonJS output.

## Measured medians (milliseconds; lower is better)

| Runner | Owners | Native baseline compiler | Cached compiler | Cached/baseline | Renamed property reads |
|---|---:|---:|---:|---:|---:|
| Ubuntu | 256 | 181.65 | 165.39 | 0.910× | 512 |
| Ubuntu | 512 | 503.83 | 431.13 | 0.856× | 1024 |
| Ubuntu | 1024 | 2123.34 | 1833.97 | 0.864× | 2048 |
| Windows | 256 | 200.58 | 187.88 | 0.937× | 512 |
| Windows | 512 | 571.19 | 507.46 | 0.888× | 1024 |
| Windows | 1024 | 2393.43 | 2023.70 | 0.846× | 2048 |

Observed paired median reductions were **6.3–15.4%** for these six source-pinned OS/size cells. This describes compile wall time with compilation + parser+obfuscation, not source runtime or a universal speed-up. Single-run sampling can vary, so use the complete trial vectors below rather than extrapolating a tight confidence bound.

## Seven raw elapsed-millisecond samples per arm

```json
[
  {
    "os": "Ubuntu",
    "job_id": 137479064489,
    "records": [
      {
        "size": 256,
        "sourceBytes": 36147,
        "baselineMs": [
          250.81939899999998,
          188.86624199999983,
          184.72881099999995,
          180.90762999999993,
          169.27618099999972,
          181.6520770000002,
          174.42618900000025
        ],
        "candidateMs": [
          228.41582399999993,
          180.2096590000001,
          160.8288970000001,
          165.38510900000006,
          155.3910350000001,
          171.11091100000021,
          153.91442099999995
        ],
        "baselineMedianMs": 181.6520770000002,
        "candidateMedianMs": 165.38510900000006,
        "ratio": 0.910449865101184,
        "properties": 512,
        "hash": "964e0e73b7a13df06f7b644e1060d4eba9ff0e6206a89c39e90b85b98f03d5c2"
      },
      {
        "size": 512,
        "sourceBytes": 73702,
        "baselineMs": [
          503.8288670000002,
          494.37689599999976,
          632.6985800000002,
          493.0811390000008,
          491.9139099999993,
          504.26470100000006,
          581.6884570000002
        ],
        "candidateMs": [
          431.133472,
          441.673354,
          514.0742419999997,
          425.9706550000001,
          429.3499810000003,
          420.4607530000003,
          492.85980200000085
        ],
        "baselineMedianMs": 503.8288670000002,
        "candidateMedianMs": 431.133472,
        "ratio": 0.8557141129430359,
        "properties": 1024,
        "hash": "23055009fd16bee1a8e1144dd4367f33afa7f20d5a107111db99061b49d6544d"
      },
      {
        "size": 1024,
        "sourceBytes": 149230,
        "baselineMs": [
          2024.3761009999998,
          2292.853932,
          2033.3560270000016,
          2330.3174370000015,
          2123.3399439999994,
          2212.020048999999,
          2060.7125700000033
        ],
        "candidateMs": [
          1973.8059079999985,
          1709.562027,
          1833.9671239999989,
          1752.9776679999995,
          1875.4979310000017,
          1804.525823,
          1861.8441909999965
        ],
        "baselineMedianMs": 2123.3399439999994,
        "candidateMedianMs": 1833.9671239999989,
        "ratio": 0.8637180914823874,
        "properties": 2048,
        "hash": "f08351914273676c4ebb649cf11c7f9c5cb362eca43e394bf877673974b8fa4c"
      }
    ]
  },
  {
    "os": "Windows",
    "job_id": 137479064157,
    "records": [
      {
        "size": 256,
        "sourceBytes": 36147,
        "baselineMs": [
          292.5846,
          216.8411000000001,
          213.78669999999988,
          200.58120000000008,
          193.8388,
          200.5063,
          197.7748999999999
        ],
        "candidateMs": [
          269.9828,
          202.10580000000004,
          191.98990000000003,
          187.88359999999966,
          183.58019999999988,
          184.02129999999988,
          178.4094
        ],
        "baselineMedianMs": 200.58120000000008,
        "candidateMedianMs": 187.88359999999966,
        "ratio": 0.936695961535775,
        "properties": 512,
        "hash": "964e0e73b7a13df06f7b644e1060d4eba9ff0e6206a89c39e90b85b98f03d5c2"
      },
      {
        "size": 512,
        "sourceBytes": 73702,
        "baselineMs": [
          581.4598000000005,
          686.4148999999998,
          588.8060999999998,
          559.2232999999997,
          571.1900999999998,
          556.6826000000001,
          554.5501000000004
        ],
        "candidateMs": [
          490.4970999999996,
          509.0673000000006,
          570.5685000000003,
          507.45730000000003,
          487.78919999999925,
          483.39910000000054,
          570.9791000000005
        ],
        "baselineMedianMs": 571.1900999999998,
        "candidateMedianMs": 507.45730000000003,
        "ratio": 0.8884210353085605,
        "properties": 1024,
        "hash": "23055009fd16bee1a8e1144dd4367f33afa7f20d5a107111db99061b49d6544d"
      },
      {
        "size": 1024,
        "sourceBytes": 149230,
        "baselineMs": [
          2561.1726,
          2285.5520000000033,
          2658.478799999997,
          2333.367900000001,
          2363.8548999999985,
          2454.558499999999,
          2393.428500000002
        ],
        "candidateMs": [
          1984.4645999999993,
          2011.6509999999998,
          2088.4457999999977,
          2023.6972000000023,
          2215.042399999995,
          2007.041799999999,
          2037.6131000000023
        ],
        "baselineMedianMs": 2393.428500000002,
        "candidateMedianMs": 2023.6972000000023,
        "ratio": 0.8455223124484399,
        "properties": 2048,
        "hash": "f08351914273676c4ebb649cf11c7f9c5cb362eca43e394bf877673974b8fa4c"
      }
    ]
  }
]
```

## Limits and integration

The candidate does not change output logic, runtime extraction difficulty, deployed bytes, tamper resistance, authorization, or the required 2.5× executed-compute bound. An untrusted host can still inspect/modify COO or SNO code. The aggregate security release remains **RELEASE-BLOCKED**.

**Critical orthogonal finding:** the post-merge exact main source `9d793f3f83e88059d9207702aa8dfdd9db16a8de` of PR #322 showed **58 full-suite Node failures on Ubuntu** [full integration run 45109068605](https://github.com/FlareZ123/obfs/actions/runs/45109068605), largely because many legacy positive fixtures require property rewriting inside public source-observable functions. This cache change does **not** fix that compatibility/test-inventory regression. Do not merge this microoptimization as a substitute for the still-blocked full integration; wait for a reconciled semantics-vs-positive-yield disposition.
