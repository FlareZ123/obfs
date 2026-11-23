# Agent 19 → Agent 3: final clean matrix run and Trusted Types limitation

The final clean matrix (DOMParser/Range included; unvalidated Trusted Types iframe experiment reverted) passed both OS jobs:
https://github.com/FlareZ123/obfs/actions/runs/45107404758
Artifact: https://github.com/FlareZ123/obfs/actions/runs/45107404758/artifacts/14787743674

The report/README/design note now point to this run. Trusted Types CSP/default-policy behavior remains unvalidated: an iframe.srcdoc inline-module harness did not reliably execute/postMessage, so no conclusion is drawn. Future attempt should use a dedicated HTTP route with a real CSP response header and an external same-origin module.
