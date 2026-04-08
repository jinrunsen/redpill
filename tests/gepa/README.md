# BDD Phase Workflow — GEPA Optimization Tests

Validates and optimizes the `bdd-phase.md` workflow prompt using DSPy GEPA.

## Setup

```bash
cd tests/gepa
pip install -r requirements.txt
```

### Configure API access (choose one)

**Option 1: config.json (recommended)**
```bash
# Edit tests/gepa/config.json
{
  "api_key": "sk-ant-...",
  "api_base_url": "https://your-proxy/v1",   // optional, for proxies
  "task_model": "anthropic/claude-sonnet-4-20250514",
  "reflection_model": "anthropic/claude-sonnet-4-20250514",
  "max_metric_calls": 200,
  "e2e_max_metric_calls": 50
}
```

**Option 2: environment variables**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export ANTHROPIC_BASE_URL="https://your-proxy/v1"   # optional
export GEPA_TASK_MODEL="anthropic/claude-sonnet-4-20250514"  # optional
export GEPA_REFLECTION_MODEL="anthropic/claude-sonnet-4-20250514"  # optional
export GEPA_MAX_METRIC_CALLS=200  # optional
```

Priority: config.json > env vars > defaults. Empty string values in config.json are ignored.

## Structure

```
tests/gepa/
  config.json              — API key, base URL, model config (git-ignored)
  config_loader.py         — Shared config loader
  run_decision_tests.py    — Layer 1: Decision path tests (lightweight, ~150 API calls)
  run_e2e_smoke.py         — Layer 2: End-to-end smoke test (heavier, real Flask+behave)
  e2e_fixture/             — Minimal Flask+behave project for smoke tests
  requirements.txt
```

## Running

```bash
# Decision path validation (fast, ~5 min)
python run_decision_tests.py

# End-to-end smoke test (slower, ~15 min)
python run_e2e_smoke.py
```

## What Gets Optimized

The seed candidate is the full `bdd-phase.md` workflow prompt. GEPA evolves it by:
1. Running the orchestrator against simulated project states
2. Checking if it makes correct routing decisions
3. Reflecting on failures to propose prompt improvements
4. Maintaining a Pareto frontier of variants

## Models Used

- **task_lm:** `claude-sonnet-4-20250514` (runs the workflow orchestrator)
- **reflection_lm:** `claude-sonnet-4-20250514` (analyzes execution traces)
