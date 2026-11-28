# Independent C++ reproduction of the exact three-state Mealy minimax value

**28 November 2026 — Agent 11 independent review.** This is an independent computational reproduction of Agent 14's finite-model result, not a claim about arbitrary JavaScript or production SCO security.

## Conclusion

The independent C++20 implementation reproduces the exact minimax value:

\[
\boxed{24\text{ oracle calls}}
\]

For deterministic Mealy machines with binary inputs, binary outputs, at most three states, known initial state zero, and no reset:

- no adaptive input policy identifies the future-behavior class of every possible source within 23 calls;
- a policy exists that identifies every possible source within 24 calls.

This independently agrees with Agent 14's JavaScript solver and its final all-source replay at [CI run 46170255006](https://github.com/FlareZ123/obfs/actions/runs/46170255006), source pin `014d86c962821da637c19b9a20e6a096d301df79).

## Independent implementation

The verifier is [`sims/agent11-independent-mealy-minimax.cpp`](../sims/agent11-independent-mealy-minimax.cpp). It was written independently in C++20 rather than ported from the JavaScript implementation.

1. Enumerate all \(6^6=46,656\) labelled three-state tables and their 139,968 rooted states.
2. Build the behavioral quotient with sorted tuple signatures and deterministic partition refinement. The implementation checks that refinement never merges old classes, that the fixed point is stable, and that every state in a quotient class has identical outputs and successor classes.
3. Deduplicate the 46,656 state-zero classes into the root belief.
4. Solve the finite-horizon AND/OR recurrence with exact sorted-set keys. The memo table uses a binary string containing every 16-bit class ID; hash collisions are resolved by exact string equality, not treated as distinct states.
5. Materialize a winning policy DAG and replay it against every concrete labelled table, checking the terminal quotient class against the actual machine state.

The game recurrence is:

\[
\operatorname{Win}(B,0)=\mathrm{false}
\]

\[
\operatorname{Win}(B,k)=
\bigvee_{a\in\{0,1\}}
\bigwedge_{\substack{o\in\{0,1\}\\
\operatorname{Child}(B,a,o)\ne\varnothing}}
\operatorname{Win}(\operatorname{Child}(B,a,o),k-1).
\]

The attacker selects the next input. Every nonempty output branch must remain winning, so the recurrence represents worst-case adaptive identification rather than an average-case or fixed-input sequence.

## Reproduced values

| Quantity | Independent C++ result |
|---|---:|
| Labelled source tables | 46,656 |
| Rooted states before quotient | 139,968 |
| Future-behavior classes | 11,500 |
| Distinct initial classes | 11,500 |
| Winning within 23 calls | No |
| Winning within 24 calls | Yes |
| Memoized belief/budget states | 4,443,360 |
| Policy DAG nonterminal nodes | 13,329 |
| Terminal policy leaves | 6,628 |
| Maximum policy path | 24 |
| Concrete tables replayed | 46,656 |
| Minimum replay calls | 10 |
| Maximum replay calls | 24 |
| Mean replay calls | 22.3407 |

The search counters also match the reference implementation:

| Search | Visited states | Cache hits |
|---|---:|---:|
| Budget 23 | 2,488,929 | 914,343 |
| Budget 24 | 4,443,360 | 1,578,390 |

The replay query-count histogram is:

`10:16, 11:176, 12:144, 13:96, 14:328, 15:344, 16:88, 17:56, 18:280, 19:488, 20:1416, 21:2864, 22:18008, 23:10256, 24:12096`.

All 46,656 concrete machines reached the correct singleton future-behavior class in at most 24 calls.

## Reproduction command and environment

No external libraries or random seed are required. Compile with assertions enabled; the source deliberately rejects `NDEBUG`.

```sh
g++ -O3 -std=c++20 -Wall -Wextra -Wpedantic \
  sims/agent11-independent-mealy-minimax.cpp \
  -o /tmp/agent11-independent-mealy-minimax
/usr/bin/time -f 'elapsed=%e max_rss_kb=%M exit=%x' \
  /tmp/agent11-independent-mealy-minimax
```

Observed local environment: Linux 6.18.57 x86_64, g++ 14.2.0. The run completed in **9.38 seconds** with **599,440 KB** maximum resident memory and exit status 0. These are local research-computation measurements, not runtime measurements for the obfuscated target or a CI performance guarantee.

## Assessment and limitations

This is an independent implementation of the same mathematical recurrence, not a formal proof and not a claim that a real service necessarily belongs to the modeled class. The exact result is limited to stationary deterministic Mealy machines with two input symbols, two output symbols, at most three states, known initial state, and no reset.

It does not establish a minimax value for four or more states, larger alphabets, randomized or nonstationary services, arbitrary JavaScript, or services with session/reset semantics. It does not establish source secrecy, an incremental advantage over minification, universal environment locking, or compliance with the 2.5× target-runtime budget.

**Disposition:** the independent reproduction supports Agent 14's exact finite-model claim. Keep this as intermediate evidence until the reference author or another independent reviewer inspects the implementation and assumptions; do not promote it to a generalized SCO security result.
