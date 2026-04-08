"""
BDD Phase Workflow — Decision Path Validation with GEPA

Tests whether the bdd-phase.md workflow prompt makes correct routing
decisions given different project states. Does NOT run real behave or
spawn real agents — it simulates the orchestrator's decision-making.

Usage:
    export ANTHROPIC_API_KEY="sk-ant-..."
    python run_decision_tests.py
"""

import os
import json
import dspy
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

WORKFLOW_PATH = Path(__file__).parent.parent.parent / "get-shit-done" / "workflows" / "bdd-phase.md"
TASK_MODEL = "anthropic/claude-sonnet-4-20250514"
REFLECTION_MODEL = "anthropic/claude-sonnet-4-20250514"
MAX_METRIC_CALLS = 200

# ---------------------------------------------------------------------------
# Load workflow prompt
# ---------------------------------------------------------------------------

def load_workflow_prompt() -> str:
    return WORKFLOW_PATH.read_text()

# ---------------------------------------------------------------------------
# Test scenarios (trainset + valset)
# ---------------------------------------------------------------------------

DECISION_SCENARIOS = [
    # --- Pre-flight checks ---
    {
        "id": "preflight_no_planning",
        "description": "No .planning/ directory",
        "init_json": {"planning_exists": False, "phase_found": False},
        "expected_action": "ERROR",
        "expected_contains": ["new-project"],
        "expected_not_contains": ["step-writer", "executor"],
    },
    {
        "id": "preflight_no_phase",
        "description": "Phase not found in ROADMAP",
        "init_json": {"planning_exists": True, "phase_found": False, "phase_dir": None},
        "expected_action": "ERROR",
        "expected_contains": ["phase"],
        "expected_not_contains": ["step-writer", "BDD-PROGRESS"],
    },
    {
        "id": "preflight_no_features",
        "description": "No .feature files",
        "init_json": {
            "planning_exists": True, "phase_found": True, "phase_dir": ".planning/phases/03-auth",
            "has_feature_files": False, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True,
        },
        "expected_action": "ERROR",
        "expected_contains": [".feature"],
        "expected_not_contains": ["step-writer", "executor"],
    },
    {
        "id": "preflight_no_design",
        "description": "No DESIGN.md",
        "init_json": {
            "planning_exists": True, "phase_found": True, "phase_dir": ".planning/phases/03-auth",
            "has_feature_files": True, "design_path": None,
            "behave_available": True,
        },
        "expected_action": "ERROR",
        "expected_contains": ["DESIGN.md"],
        "expected_not_contains": ["step-writer", "executor"],
    },
    {
        "id": "preflight_no_behave",
        "description": "behave not installed",
        "init_json": {
            "planning_exists": True, "phase_found": True, "phase_dir": ".planning/phases/03-auth",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": False,
        },
        "expected_action": "ERROR",
        "expected_contains": ["behave"],
        "expected_not_contains": ["step-writer", "executor"],
    },

    # --- Fresh start ---
    {
        "id": "fresh_start",
        "description": "All pre-flight pass, no progress file, scenarios have undefined steps",
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/03-auth", "phase_number": "03",
            "phase_name": "Authentication", "padded_phase": "03",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True, "has_bdd_progress": False,
            "state_path": ".planning/STATE.md", "step_writer_model": "sonnet",
            "executor_model": "sonnet", "verifier_model": "sonnet",
        },
        "behave_dry_run": "You can implement step definitions for undefined steps",
        "expected_action": "DISPATCH_STEP_WRITER",
        "expected_contains": ["step-writer", "BDD-PROGRESS"],
        "expected_not_contains": [],
    },

    # --- No undefined steps → executor ---
    {
        "id": "no_undefined_steps",
        "description": "All steps defined, scenario fails with HTTP error",
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/03-auth", "phase_number": "03",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True, "has_bdd_progress": False,
        },
        "behave_dry_run": "1 scenario passed, 0 failed, 0 skipped, 0 undefined",
        "behave_run": "ConnectionError: connection refused localhost:8000",
        "expected_action": "DISPATCH_EXECUTOR",
        "expected_contains": ["executor"],
        "expected_not_contains": ["step-writer"],
    },

    # --- GREEN: scenario passes → review ---
    {
        "id": "scenario_passes",
        "description": "Scenario passes after executor, review not skipped",
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/03-auth",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True, "has_bdd_progress": True,
        },
        "behave_run": "1 scenario passed, 0 failed\nEXIT_CODE=0",
        "skip_review": False,
        "expected_action": "DISPATCH_VERIFIER",
        "expected_contains": ["verifier", "review"],
        "expected_not_contains": [],
    },

    # --- GREEN: scenario passes + skip-review ---
    {
        "id": "scenario_passes_skip_review",
        "description": "Scenario passes, --skip-review flag set",
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/03-auth",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True, "has_bdd_progress": True,
        },
        "behave_run": "1 scenario passed, 0 failed\nEXIT_CODE=0",
        "skip_review": True,
        "expected_action": "SKIP_REVIEW",
        "expected_contains": ["regression", "progress"],
        "expected_not_contains": ["verifier"],
    },

    # --- STUCK: scenario fails after max attempts ---
    {
        "id": "stuck_max_attempts",
        "description": "Scenario fails after 2 fix attempts",
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/03-auth",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True,
        },
        "behave_run": "FAILED: AssertionError: expected 200 got 500",
        "fix_attempt": 2,
        "max_fix_attempts": 2,
        "expected_action": "STUCK",
        "expected_contains": ["STUCK", "skip", "abort"],
        "expected_not_contains": [],
    },

    # --- Resume from progress ---
    {
        "id": "resume_progress",
        "description": "BDD-PROGRESS.json exists with 3 passed scenarios",
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/03-auth",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True, "has_bdd_progress": True,
            "bdd_progress_path": ".planning/phases/03-auth/BDD-PROGRESS.json",
        },
        "bdd_progress": {"phase": 3, "total_scenarios": 5, "passed": ["login", "register", "logout"],
                         "failed": [], "skipped": [], "current": None, "iteration": 3, "stuck_count": 0},
        "expected_action": "RESUME",
        "expected_contains": ["resum", "3", "passed"],
        "expected_not_contains": [],
    },

    # --- All scenarios passed → completion ---
    {
        "id": "all_done",
        "description": "All scenarios already passed",
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/03-auth", "phase_name": "Authentication",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True, "has_bdd_progress": True,
        },
        "bdd_progress": {"phase": 3, "total_scenarios": 3, "passed": ["login", "register", "logout"],
                         "failed": [], "skipped": [], "current": None, "iteration": 3, "stuck_count": 0},
        "behave_dry_run_scenarios": ["login", "register", "logout"],
        "expected_action": "COMPLETION",
        "expected_contains": ["COMPLETE", "SUMMARY"],
        "expected_not_contains": ["step-writer", "executor"],
    },

    # --- Regression detected ---
    {
        "id": "regression_detected",
        "description": "Previously passing scenario now fails",
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/03-auth",
            "has_feature_files": True, "design_path": ".planning/phases/03-auth/03-DESIGN.md",
            "behave_available": True, "has_bdd_progress": True,
        },
        "regression_output": "FAILED: login scenario - AssertionError",
        "expected_action": "REGRESSION",
        "expected_contains": ["REGRESSION", "Auto-fix", "Manual", "Rollback"],
        "expected_not_contains": [],
    },
]


# ---------------------------------------------------------------------------
# DSPy Program: Workflow Orchestrator Simulator
# ---------------------------------------------------------------------------

class WorkflowDecision(dspy.Signature):
    """Given a BDD workflow prompt and a project state, determine what the
    orchestrator should do next. Simulate the orchestrator's decision-making
    without actually running commands."""

    workflow_prompt: str = dspy.InputField(desc="The full bdd-phase.md workflow prompt")
    scenario_state: str = dspy.InputField(desc="JSON describing the current project state, behave outputs, and flags")
    decision: str = dspy.OutputField(desc="The orchestrator's next action: ERROR, DISPATCH_STEP_WRITER, DISPATCH_EXECUTOR, DISPATCH_VERIFIER, SKIP_REVIEW, STUCK, RESUME, COMPLETION, REGRESSION. Include reasoning and any output messages the orchestrator would produce.")


class BddWorkflowOrchestrator(dspy.Module):
    def __init__(self):
        super().__init__()
        self.decide = dspy.ChainOfThought(WorkflowDecision)

    def forward(self, workflow_prompt, scenario_state):
        return self.decide(workflow_prompt=workflow_prompt, scenario_state=scenario_state)


# ---------------------------------------------------------------------------
# Metric: Score + Feedback
# ---------------------------------------------------------------------------

def workflow_decision_metric(gold, pred, trace=None):
    """Evaluate whether the orchestrator made the correct decision.

    Returns a dict with 'score' (0.0-1.0) and 'feedback' (text for GEPA reflection).
    """
    decision_text = pred.decision.lower() if hasattr(pred, 'decision') else ""
    expected_action = gold.expected_action.lower()

    # 1. Check correct action type (50% of score)
    action_correct = expected_action in decision_text
    action_score = 0.5 if action_correct else 0.0

    # 2. Check expected_contains (25% of score)
    contains_list = gold.get("expected_contains", [])
    if contains_list:
        contains_hits = sum(1 for c in contains_list if c.lower() in decision_text)
        contains_score = 0.25 * (contains_hits / len(contains_list))
    else:
        contains_score = 0.25

    # 3. Check expected_not_contains (25% of score)
    not_contains_list = gold.get("expected_not_contains", [])
    if not_contains_list:
        violations = [c for c in not_contains_list if c.lower() in decision_text]
        not_contains_score = 0.25 * (1.0 - len(violations) / len(not_contains_list))
    else:
        not_contains_score = 0.25

    total_score = action_score + contains_score + not_contains_score

    # Build feedback for GEPA reflection
    feedback_parts = []
    if not action_correct:
        feedback_parts.append(
            f"WRONG ACTION: Expected '{expected_action}' but orchestrator decided something else. "
            f"The workflow prompt should clearly route to '{expected_action}' when given this state."
        )
    if contains_list:
        missing = [c for c in contains_list if c.lower() not in decision_text]
        if missing:
            feedback_parts.append(f"MISSING in output: {missing}. The orchestrator should mention these.")
    if not_contains_list:
        violations = [c for c in not_contains_list if c.lower() in decision_text]
        if violations:
            feedback_parts.append(
                f"SHOULD NOT appear in output: {violations}. "
                f"The orchestrator incorrectly referenced these for this state."
            )
    if not feedback_parts:
        feedback_parts.append("Correct decision. Orchestrator routed properly.")

    return {
        "score": round(total_score, 2),
        "feedback": " | ".join(feedback_parts),
    }


# ---------------------------------------------------------------------------
# Build dataset
# ---------------------------------------------------------------------------

def build_dataset():
    """Convert DECISION_SCENARIOS into dspy.Example instances."""
    workflow_prompt = load_workflow_prompt()
    examples = []

    for sc in DECISION_SCENARIOS:
        # Build scenario state as a readable JSON string
        state = {
            "init_json": sc["init_json"],
        }
        for key in ["behave_dry_run", "behave_run", "skip_review", "fix_attempt",
                     "max_fix_attempts", "bdd_progress", "behave_dry_run_scenarios",
                     "regression_output"]:
            if key in sc:
                state[key] = sc[key]

        example = dspy.Example(
            workflow_prompt=workflow_prompt,
            scenario_state=json.dumps(state, indent=2),
            expected_action=sc["expected_action"],
            expected_contains=sc.get("expected_contains", []),
            expected_not_contains=sc.get("expected_not_contains", []),
        ).with_inputs("workflow_prompt", "scenario_state")

        examples.append(example)

    return examples


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print(" BDD Phase Workflow — GEPA Decision Path Validation")
    print("=" * 60)

    # Check API key
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("\n❌ ANTHROPIC_API_KEY not set. Run:")
        print('   export ANTHROPIC_API_KEY="sk-ant-..."')
        return

    # Configure DSPy
    task_lm = dspy.LM(model=TASK_MODEL, temperature=0.0, max_tokens=4000)
    reflection_lm = dspy.LM(model=REFLECTION_MODEL, temperature=1.0, max_tokens=8000)
    dspy.configure(lm=task_lm)

    # Build dataset
    all_examples = build_dataset()
    # Use 70% train, 30% val
    split = int(len(all_examples) * 0.7)
    trainset = all_examples[:split]
    valset = all_examples[split:]

    print(f"\nDataset: {len(trainset)} train, {len(valset)} val")
    print(f"Task LM: {TASK_MODEL}")
    print(f"Reflection LM: {REFLECTION_MODEL}")

    # --- Phase 1: Evaluate baseline ---
    print("\n" + "-" * 60)
    print(" Phase 1: Baseline Evaluation (unoptimized)")
    print("-" * 60)

    program = BddWorkflowOrchestrator()
    evaluator = dspy.Evaluate(
        devset=all_examples,
        metric=workflow_decision_metric,
        num_threads=1,
        display_progress=True,
    )
    baseline_score = evaluator(program)
    print(f"\nBaseline score: {baseline_score:.1f}%")

    # --- Phase 2: GEPA Optimization ---
    print("\n" + "-" * 60)
    print(" Phase 2: GEPA Optimization")
    print("-" * 60)

    gepa = dspy.GEPA(
        metric=workflow_decision_metric,
        max_metric_calls=MAX_METRIC_CALLS,
        reflection_lm=reflection_lm,
        reflection_minibatch_size=3,
        track_stats=True,
        candidate_selection_strategy="pareto",
    )

    optimized = gepa.compile(
        student=BddWorkflowOrchestrator(),
        trainset=trainset,
        valset=valset,
    )

    # --- Phase 3: Evaluate optimized ---
    print("\n" + "-" * 60)
    print(" Phase 3: Optimized Evaluation")
    print("-" * 60)

    optimized_score = evaluator(optimized)
    print(f"\nOptimized score: {optimized_score:.1f}%")
    print(f"Improvement: {optimized_score - baseline_score:+.1f}%")

    # --- Save results ---
    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(exist_ok=True)

    # Save optimized prompt (the evolved instructions)
    if hasattr(optimized, 'detailed_results') and optimized.detailed_results:
        best = optimized.detailed_results.best_candidate
        with open(results_dir / "optimized_instructions.json", "w") as f:
            json.dump(best, f, indent=2)
        print(f"\nOptimized instructions saved to: {results_dir / 'optimized_instructions.json'}")

    # Save score comparison
    with open(results_dir / "scores.json", "w") as f:
        json.dump({
            "baseline": baseline_score,
            "optimized": optimized_score,
            "improvement": optimized_score - baseline_score,
            "scenarios": len(all_examples),
            "max_metric_calls": MAX_METRIC_CALLS,
        }, f, indent=2)

    print(f"Scores saved to: {results_dir / 'scores.json'}")

    print("\n" + "=" * 60)
    print(f" Done. Baseline: {baseline_score:.1f}% → Optimized: {optimized_score:.1f}%")
    print("=" * 60)


if __name__ == "__main__":
    main()
