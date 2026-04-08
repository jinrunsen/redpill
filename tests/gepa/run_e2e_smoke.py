"""
BDD Phase Workflow — End-to-End Smoke Test with GEPA

Sets up a real minimal Flask+behave project, then uses GEPA to validate
that the bdd-phase workflow prompt can correctly orchestrate the full
RED → WORK → GREEN cycle.

This test:
1. Copies e2e_fixture/ to a temp directory
2. Sets up .planning/ structure with DESIGN.md
3. Runs the workflow prompt through a simulated orchestration
4. Validates the orchestrator produces correct agent dispatches
5. Optionally runs behave to verify the fixture itself works

Usage:
    export ANTHROPIC_API_KEY="sk-ant-..."
    python run_e2e_smoke.py
"""

import os
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

import dspy

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

WORKFLOW_PATH = Path(__file__).parent.parent.parent / "get-shit-done" / "workflows" / "bdd-phase.md"
FIXTURE_PATH = Path(__file__).parent / "e2e_fixture"
TASK_MODEL = "anthropic/claude-sonnet-4-20250514"
REFLECTION_MODEL = "anthropic/claude-sonnet-4-20250514"

# ---------------------------------------------------------------------------
# E2E Scenario
# ---------------------------------------------------------------------------

class E2EOrchestration(dspy.Signature):
    """Simulate the bdd-phase orchestrator for a real project.
    Given the workflow prompt and a complete project state (feature files,
    design doc, behave output), produce the sequence of actions the
    orchestrator should take."""

    workflow_prompt: str = dspy.InputField(desc="The full bdd-phase.md workflow prompt")
    project_state: str = dspy.InputField(desc="Complete project state: feature file content, DESIGN.md content, behave dry-run output, init JSON")
    action_sequence: str = dspy.OutputField(desc="Step-by-step sequence of orchestrator actions. Each step should state: what check/action is performed, what the result is, and what happens next. Use the format: STEP N: [action] → [result] → [next step]")


class E2EOrchestrator(dspy.Module):
    def __init__(self):
        super().__init__()
        self.orchestrate = dspy.ChainOfThought(E2EOrchestration)

    def forward(self, workflow_prompt, project_state):
        return self.orchestrate(workflow_prompt=workflow_prompt, project_state=project_state)


# ---------------------------------------------------------------------------
# Setup fixture
# ---------------------------------------------------------------------------

def setup_fixture():
    """Copy e2e_fixture to a temp dir and set up .planning/ structure."""
    tmpdir = Path(tempfile.mkdtemp(prefix="gsd-bdd-e2e-"))

    # Copy fixture files
    shutil.copytree(FIXTURE_PATH / "features", tmpdir / "features")
    shutil.copy2(FIXTURE_PATH / "app.py", tmpdir / "app.py")

    # Create .planning/ structure
    phase_dir = tmpdir / ".planning" / "phases" / "01-greet"
    phase_dir.mkdir(parents=True)
    shutil.copy2(FIXTURE_PATH / "DESIGN.md", phase_dir / "01-DESIGN.md")

    # Create minimal STATE.md
    (tmpdir / ".planning" / "STATE.md").write_text("# State\n\n## Current Phase\nPhase 1: Greeting API\n")
    (tmpdir / ".planning" / "ROADMAP.md").write_text("# Roadmap\n\n## Phase 1: Greeting API\nGoal: Implement greeting endpoint\n")

    return tmpdir


def get_behave_dry_run(tmpdir):
    """Run behave --dry-run on the fixture to get real output."""
    try:
        result = subprocess.run(
            ["behave", "--dry-run", "--no-capture", "--format", "plain"],
            cwd=str(tmpdir),
            capture_output=True, text=True, timeout=30,
        )
        return result.stdout + result.stderr
    except FileNotFoundError:
        return "[behave not installed — simulated output]\nUndefined step: Given the API is running\nYou can implement step definitions for undefined steps"
    except Exception as e:
        return f"[behave error: {e}]"


# ---------------------------------------------------------------------------
# Metric
# ---------------------------------------------------------------------------

def e2e_metric(gold, pred, trace=None):
    """Evaluate e2e orchestration quality."""
    action_seq = pred.action_sequence.lower() if hasattr(pred, 'action_sequence') else ""

    checks = {
        "preflight_checks": any(w in action_seq for w in ["pre-flight", "preflight", "check 1", "planning_exists"]),
        "discovers_scenarios": any(w in action_seq for w in ["discover", "dry-run", "dry_run", "scenario"]),
        "detects_undefined": any(w in action_seq for w in ["undefined", "step-writer", "step_writer"]),
        "dispatches_step_writer": "step-writer" in action_seq or "step_writer" in action_seq,
        "dispatches_executor": "executor" in action_seq,
        "verifies_green": any(w in action_seq for w in ["green", "pass", "exit code 0", "verify"]),
        "dispatches_verifier": any(w in action_seq for w in ["verifier", "review"]),
        "updates_progress": any(w in action_seq for w in ["progress", "bdd-progress", "persist"]),
        "correct_order": (
            action_seq.find("step-writer") < action_seq.find("executor")
            if "step-writer" in action_seq and "executor" in action_seq
            else True
        ),
    }

    passed = sum(checks.values())
    total = len(checks)
    score = passed / total

    feedback_parts = []
    for check_name, passed_check in checks.items():
        if not passed_check:
            feedback_parts.append(f"MISSING: {check_name}")

    if not feedback_parts:
        feedback_parts.append("All orchestration steps present and in correct order.")

    return {
        "score": round(score, 2),
        "feedback": " | ".join(feedback_parts),
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print(" BDD Phase Workflow — E2E Smoke Test")
    print("=" * 60)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("\n❌ ANTHROPIC_API_KEY not set. Run:")
        print('   export ANTHROPIC_API_KEY="sk-ant-..."')
        return

    # Setup
    tmpdir = setup_fixture()
    print(f"\nFixture created at: {tmpdir}")

    # Get real behave output
    behave_output = get_behave_dry_run(tmpdir)
    print(f"Behave dry-run output:\n{behave_output[:200]}...")

    # Load workflow prompt
    workflow_prompt = WORKFLOW_PATH.read_text()

    # Build project state
    feature_content = (tmpdir / "features" / "greet.feature").read_text()
    design_content = (tmpdir / ".planning" / "phases" / "01-greet" / "01-DESIGN.md").read_text()

    project_state = json.dumps({
        "init_json": {
            "planning_exists": True, "phase_found": True,
            "phase_dir": ".planning/phases/01-greet", "phase_number": "01",
            "phase_name": "Greeting API", "padded_phase": "01", "phase_slug": "greet",
            "has_feature_files": True, "design_path": ".planning/phases/01-greet/01-DESIGN.md",
            "behave_available": True, "has_bdd_progress": False,
            "state_path": ".planning/STATE.md", "roadmap_path": ".planning/ROADMAP.md",
            "step_writer_model": "sonnet", "executor_model": "sonnet", "verifier_model": "sonnet",
        },
        "feature_file_content": feature_content,
        "design_content": design_content,
        "behave_dry_run_output": behave_output,
        "flags": {"skip_review": False, "resume": False},
    }, indent=2)

    # Configure DSPy
    task_lm = dspy.LM(model=TASK_MODEL, temperature=0.0, max_tokens=8000)
    reflection_lm = dspy.LM(model=REFLECTION_MODEL, temperature=1.0, max_tokens=8000)
    dspy.configure(lm=task_lm)

    # Build dataset (single example for smoke test)
    example = dspy.Example(
        workflow_prompt=workflow_prompt,
        project_state=project_state,
        expected_action="FULL_CYCLE",
    ).with_inputs("workflow_prompt", "project_state")

    # --- Baseline ---
    print("\n" + "-" * 60)
    print(" Baseline: Unoptimized orchestrator")
    print("-" * 60)

    program = E2EOrchestrator()
    result = program(workflow_prompt=workflow_prompt, project_state=project_state)

    print(f"\nOrchestrator action sequence:\n{result.action_sequence[:1000]}")

    score_result = e2e_metric(example, result)
    print(f"\nBaseline score: {score_result['score']:.0%}")
    print(f"Feedback: {score_result['feedback']}")

    # --- GEPA Optimization ---
    print("\n" + "-" * 60)
    print(" GEPA Optimization (E2E)")
    print("-" * 60)

    gepa = dspy.GEPA(
        metric=e2e_metric,
        max_metric_calls=50,  # Small budget for smoke test
        reflection_lm=reflection_lm,
        reflection_minibatch_size=1,
        track_stats=True,
    )

    optimized = gepa.compile(
        student=E2EOrchestrator(),
        trainset=[example],
        valset=[example],
    )

    # Evaluate optimized
    opt_result = optimized(workflow_prompt=workflow_prompt, project_state=project_state)
    opt_score = e2e_metric(example, opt_result)

    print(f"\nOptimized score: {opt_score['score']:.0%}")
    print(f"Feedback: {opt_score['feedback']}")

    # --- Save ---
    results_dir = Path(__file__).parent / "results"
    results_dir.mkdir(exist_ok=True)

    with open(results_dir / "e2e_scores.json", "w") as f:
        json.dump({
            "baseline_score": score_result["score"],
            "optimized_score": opt_score["score"],
            "baseline_feedback": score_result["feedback"],
            "optimized_feedback": opt_score["feedback"],
        }, f, indent=2)

    with open(results_dir / "e2e_action_sequence.txt", "w") as f:
        f.write("=== BASELINE ===\n")
        f.write(result.action_sequence)
        f.write("\n\n=== OPTIMIZED ===\n")
        f.write(opt_result.action_sequence)

    print(f"\nResults saved to: {results_dir}")

    # Cleanup
    shutil.rmtree(tmpdir)
    print(f"Fixture cleaned up: {tmpdir}")

    print("\n" + "=" * 60)
    print(f" Done. Baseline: {score_result['score']:.0%} → Optimized: {opt_score['score']:.0%}")
    print("=" * 60)


if __name__ == "__main__":
    main()
