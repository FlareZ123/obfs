#!/usr/bin/env python3
"""Compare published resetless hW inference with the exact <=3-state minimax result.

The learner sees only a step(input)->output SUL. The SUL's pre/post hooks are
no-ops: they count lifecycle calls but never reset the hidden state. The hW
algorithm is not given the state count, transition table, or current state.
After learning, an evaluator-only product-graph check compares the returned
hypothesis at its current state with the hidden SUL's current state.

This is an offline, process-local SUL benchmark, not a process-isolation claim
or a live HTTP experiment. The random-walk equivalence oracle is heuristic;
the evaluator's finite product check is exact for the two finite machines.
"""
from __future__ import annotations

import hashlib
import json
import random
import statistics
from collections import deque
from dataclasses import dataclass
from importlib.metadata import version
from typing import Callable

from aalpy import MealyMachine, MealyState, RandomhWOracle, SUL, run_hW


@dataclass(frozen=True)
class Machine:
    transitions: tuple[tuple[int, int], ...]
    outputs: tuple[tuple[int, int], ...]

    @property
    def state_count(self) -> int:
        return len(self.transitions)

    @property
    def digest(self) -> str:
        payload = json.dumps(
            {"transitions": self.transitions, "outputs": self.outputs},
            separators=(",", ":"),
        ).encode("utf-8")
        return hashlib.sha256(payload).hexdigest()


class StepBudgetExceeded(RuntimeError):
    pass


class NoResetSUL(SUL):
    """A SUL whose lifecycle hooks deliberately do not reset the private state."""

    def __init__(self, step_fn: Callable[[int], str], max_steps: int):
        super().__init__()
        self._step_fn = step_fn
        self.max_steps = max_steps
        self.calls = 0
        self.pre_calls = 0
        self.post_calls = 0

    def pre(self) -> None:
        self.pre_calls += 1

    def post(self) -> None:
        self.post_calls += 1

    def step(self, letter: int) -> str:
        if self.calls >= self.max_steps:
            raise StepBudgetExceeded(f"step budget {self.max_steps} exhausted")
        if letter not in (0, 1):
            raise ValueError(f"unexpected input symbol {letter!r}")
        output = self._step_fn(letter)
        self.calls += 1
        return output


def is_strongly_connected(machine: Machine) -> bool:
    count = machine.state_count
    for start in range(count):
        reached = {start}
        pending = [start]
        while pending:
            state = pending.pop()
            for target in machine.transitions[state]:
                if target not in reached:
                    reached.add(target)
                    pending.append(target)
        if len(reached) != count:
            return False
    return True


def is_minimal(machine: Machine) -> bool:
    """Exact partition refinement for deterministic Mealy state equivalence."""
    classes = [0] * machine.state_count
    while True:
        ids: dict[tuple[tuple[int, ...], tuple[int, int]], int] = {}
        refined = []
        for state in range(machine.state_count):
            signature = (
                machine.outputs[state],
                tuple(classes[target] for target in machine.transitions[state]),
            )
            if signature not in ids:
                ids[signature] = len(ids)
            refined.append(ids[signature])
        if refined == classes:
            return len(set(classes)) == machine.state_count
        classes = refined


def generate_machine(state_count: int, seed: int) -> Machine:
    """Generate a reproducible, minimal, strongly connected binary Mealy machine."""
    rng = random.Random(seed)
    for _attempt in range(100_000):
        machine = Machine(
            transitions=tuple(
                tuple(rng.randrange(state_count) for _ in range(2))
                for _ in range(state_count)
            ),
            outputs=tuple(
                tuple(rng.randrange(2) for _ in range(2))
                for _ in range(state_count)
            ),
        )
        if is_strongly_connected(machine) and is_minimal(machine):
            return machine
    raise RuntimeError(f"could not generate minimal strongly connected N={state_count}, seed={seed}")


def build_cases() -> list[tuple[str, Machine]]:
    # Explicit three-state witness used to falsify an unconditional 2-state
    # clone certificate in the SCO process-boundary research.
    table52 = Machine(
        transitions=((2, 1), (0, 0), (0, 0)),
        outputs=((0, 0), (1, 0), (0, 0)),
    )
    if not is_strongly_connected(table52) or not is_minimal(table52):
        raise AssertionError("the pinned table-52 witness must be strongly connected and minimal")

    cases: list[tuple[str, Machine]] = [("table52-three-state", table52)]
    for state_count, seeds in ((3, (5, 17, 29)), (4, (5, 17)), (5, (5, 17))):
        for seed in seeds:
            cases.append(
                (f"generated-n{state_count}-seed{seed}", generate_machine(state_count, seed))
            )
    return cases


def exact_equivalence_from_current(
    hypothesis: MealyMachine,
    hidden: Machine,
    hidden_state: int,
) -> tuple[bool, tuple[int, ...] | None, int]:
    """BFS the product machine from the two current states; returns a shortest witness."""
    root = hypothesis.current_state
    if root is None:
        return False, (), 0

    pending = deque([(root, hidden_state, ())])
    visited: set[tuple[int, int]] = set()
    while pending:
        learned_state, actual_state, prefix = pending.popleft()
        pair = (id(learned_state), actual_state)
        if pair in visited:
            continue
        visited.add(pair)

        for symbol in (0, 1):
            witness = prefix + (symbol,)
            learned_output = learned_state.output_fun.get(symbol)
            actual_output = str(hidden.outputs[actual_state][symbol])
            learned_target = learned_state.transitions.get(symbol)
            if learned_output != actual_output or learned_target is None:
                return False, witness, len(visited)
            pending.append(
                (
                    learned_target,
                    hidden.transitions[actual_state][symbol],
                    witness,
                )
            )

    return True, None, len(visited)


def run_one(
    name: str,
    machine: Machine,
    oracle_seed: int,
    oracle_steps: int,
    max_steps: int = 20_000,
) -> dict[str, object]:
    private = {"state": 0}

    def private_step(symbol: int) -> str:
        old_state = private["state"]
        output = machine.outputs[old_state][symbol]
        private["state"] = machine.transitions[old_state][symbol]
        return str(output)

    sul = NoResetSUL(private_step, max_steps=max_steps)
    random.seed(oracle_seed)
    oracle = RandomhWOracle(
        num_testing_steps=oracle_steps,
        reset_testing_counter=True,
    )

    try:
        hypothesis, info = run_hW(
            [0, 1],
            sul,
            oracle,
            automaton_type="mealy",
            query_for_initial_state=False,
            return_data=True,
            print_level=0,
        )
    except StepBudgetExceeded as exc:
        return {
            "case": name,
            "state_count": machine.state_count,
            "machine_sha256": machine.digest,
            "oracle_seed": oracle_seed,
            "oracle_steps_per_round": oracle_steps,
            "status": "step_budget_exceeded",
            "error": str(exc),
            "step_calls": sul.calls,
            "pre_calls": sul.pre_calls,
            "post_calls": sul.post_calls,
        }
    except TypeError as exc:
        # AALpy's bootstrap indexes the first counterexample. If the bounded
        # random walk cannot find one, it returns None and this is the specific
        # expected failure mode; preserve it as a measured bootstrap miss.
        if (
            "NoneType" in str(exc)
            and "not subscriptable" in str(exc)
            and sul.pre_calls == 1
            and sul.post_calls == 0
        ):
            return {
                "case": name,
                "state_count": machine.state_count,
                "machine_sha256": machine.digest,
                "oracle_seed": oracle_seed,
                "oracle_steps_per_round": oracle_steps,
                "status": "bootstrap_no_counterexample",
                "error": str(exc),
                "step_calls": sul.calls,
                "pre_calls": sul.pre_calls,
                "post_calls": sul.post_calls,
            }
        raise

    if sul.pre_calls != 1 or sul.post_calls != 1:
        raise AssertionError(
            "the no-reset benchmark must have exactly one initial pre and one final post; "
            f"observed pre={sul.pre_calls}, post={sul.post_calls}"
        )

    exact, witness, product_states = exact_equivalence_from_current(
        hypothesis, machine, private["state"]
    )
    return {
        "case": name,
        "state_count": machine.state_count,
        "machine_sha256": machine.digest,
        "oracle_seed": oracle_seed,
        "oracle_steps_per_round": oracle_steps,
        "status": "exact" if exact else "false_convergence",
        "step_calls": sul.calls,
        "pre_calls": sul.pre_calls,
        "post_calls": sul.post_calls,
        "learning_rounds": info["learning_rounds"],
        "learned_states": len(hypothesis.states),
        "exact_from_current_state": exact,
        "shortest_counterexample": list(witness) if witness is not None else None,
        "product_states_checked": product_states,
        "homing_sequence": list(info["homing_sequence"]),
        "characterization_set": [list(item) for item in info["characterization_set"]],
    }


def summarize_budget(records: list[dict[str, object]], budget: int) -> dict[str, object]:
    rows = [row for row in records if row["oracle_steps_per_round"] == budget]
    successful = [row for row in rows if row["status"] in ("exact", "false_convergence")]
    exact = [row for row in successful if row["status"] == "exact"]
    three_state = [row for row in rows if int(row["state_count"]) <= 3]
    three_state_successful = [
        row for row in three_state if row["status"] in ("exact", "false_convergence")
    ]
    calls = [int(row["step_calls"]) for row in rows]
    return {
        "oracle_steps_per_round": budget,
        "runs": len(rows),
        "exact_runs": len(exact),
        "false_convergence_runs": sum(
            row["status"] == "false_convergence" for row in successful
        ),
        "bootstrap_no_counterexample": sum(
            row["status"] == "bootstrap_no_counterexample" for row in rows
        ),
        "step_budget_exceeded": sum(
            row["status"] == "step_budget_exceeded" for row in rows
        ),
        "median_step_calls": statistics.median(calls),
        "max_step_calls": max(calls),
        "at_most_three_state_runs": len(three_state),
        "at_most_three_state_exact_runs": sum(
            row["status"] == "exact" for row in three_state_successful
        ),
        "at_most_three_state_median_step_calls": (
            statistics.median(int(row["step_calls"]) for row in three_state_successful)
            if three_state_successful
            else None
        ),
        "at_most_three_state_max_step_calls": (
            max(int(row["step_calls"]) for row in three_state_successful)
            if three_state_successful
            else None
        ),
    }


def main() -> None:
    package_version = version("aalpy")
    if package_version != "2.0.0":
        raise RuntimeError(f"expected pinned AALpy 2.0.0, found {package_version}")

    cases = build_cases()
    oracle_seeds = (7, 19)
    oracle_budgets = (32, 64, 128, 256)
    records = [
        run_one(name, machine, oracle_seed, oracle_steps)
        for oracle_steps in oracle_budgets
        for name, machine in cases
        for oracle_seed in oracle_seeds
    ]

    high_budget = [row for row in records if row["oracle_steps_per_round"] == 256]
    table52 = [row for row in high_budget if row["case"] == "table52-three-state"]
    if not all(row["status"] == "exact" for row in table52):
        raise AssertionError(f"pinned table-52 witness was not exactly learned at 256: {table52}")

    summaries = [summarize_budget(records, budget) for budget in oracle_budgets]
    summary = {
        "aalpy_version": package_version,
        "cases": len(cases),
        "runs": len(records),
        "oracle_budgets": list(oracle_budgets),
        "oracle_seeds": list(oracle_seeds),
        "all_256_step_table52_runs_exact": all(row["status"] == "exact" for row in table52),
        "exact_three_state_minimax_bound_for_comparison": 24,
        "budget_summaries": summaries,
        "warning": (
            "hW termination is heuristic because the random-walk oracle is not an exact "
            "equivalence oracle; exact_from_current_state is an evaluator-only product check"
        ),
    }

    for row in records:
        print("HWINFERENCE_RUN " + json.dumps(row, sort_keys=True))
    print("HWINFERENCE_SUMMARY " + json.dumps(summary, sort_keys=True))


if __name__ == "__main__":
    main()
