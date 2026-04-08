"""
Shared config loader for GEPA tests.

Priority: config.json > environment variables > defaults.

Usage:
    from config_loader import load_config, configure_dspy
    cfg = load_config()
    task_lm, reflection_lm = configure_dspy(cfg)
"""

import json
import os
from pathlib import Path


CONFIG_PATH = Path(__file__).parent / "config.json"

DEFAULTS = {
    "api_key": "",
    "api_base_url": "",
    "task_model": "anthropic/claude-sonnet-4-20250514",
    "reflection_model": "anthropic/claude-sonnet-4-20250514",
    "max_metric_calls": 200,
    "e2e_max_metric_calls": 50,
}


def load_config() -> dict:
    """Load config with priority: config.json > env vars > defaults."""
    cfg = dict(DEFAULTS)

    # Layer 1: config.json
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH) as f:
            file_cfg = json.load(f)
        for k, v in file_cfg.items():
            if v not in (None, ""):
                cfg[k] = v

    # Layer 2: env vars override non-empty config.json values
    env_map = {
        "ANTHROPIC_API_KEY": "api_key",
        "ANTHROPIC_BASE_URL": "api_base_url",
        "GEPA_TASK_MODEL": "task_model",
        "GEPA_REFLECTION_MODEL": "reflection_model",
        "GEPA_MAX_METRIC_CALLS": "max_metric_calls",
        "GEPA_E2E_MAX_METRIC_CALLS": "e2e_max_metric_calls",
    }
    for env_key, cfg_key in env_map.items():
        val = os.environ.get(env_key)
        if val:
            # Convert numeric fields
            if cfg_key in ("max_metric_calls", "e2e_max_metric_calls"):
                cfg[cfg_key] = int(val)
            else:
                cfg[cfg_key] = val

    return cfg


def check_api_key(cfg: dict) -> bool:
    """Check if API key is available. Returns True if ready."""
    if cfg["api_key"]:
        return True
    print("❌ No API key configured. Set one of:")
    print("   1. Edit tests/gepa/config.json → set \"api_key\"")
    print("   2. export ANTHROPIC_API_KEY=\"sk-ant-...\"")
    return False


def configure_dspy(cfg: dict):
    """Configure DSPy with loaded config. Returns (task_lm, reflection_lm)."""
    import dspy

    # Set API key in env if from config (DSPy reads from env)
    if cfg["api_key"]:
        os.environ["ANTHROPIC_API_KEY"] = cfg["api_key"]

    # Build LM kwargs
    task_kwargs = {"model": cfg["task_model"], "temperature": 0.0, "max_tokens": 4000}
    reflection_kwargs = {"model": cfg["reflection_model"], "temperature": 1.0, "max_tokens": 8000}

    if cfg["api_base_url"]:
        task_kwargs["api_base"] = cfg["api_base_url"]
        reflection_kwargs["api_base"] = cfg["api_base_url"]

    task_lm = dspy.LM(**task_kwargs)
    reflection_lm = dspy.LM(**reflection_kwargs)

    dspy.configure(lm=task_lm)
    return task_lm, reflection_lm
