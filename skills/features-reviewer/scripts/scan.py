#!/usr/bin/env python3
"""
scan.py — Features 目录扫描器 (v2, 冒号格式)

遍历一个 BDD features/ 目录，解析每个 .feature 文件的标签、scenario、
Scenario Outline 及其 Examples，产出 JSON 形式的客观度量数据。

本版本识别的标签维度：
- @spec:*         需求视角 (互斥必备)
- @test-layer:*   测试分层 (互斥必备)
- @nfr:*          非功能性需求 (非互斥可选)
- @by:*           作者来源 (互斥可选)
- @status:*       生命周期状态 (互斥可选)
- @exec:*         执行特征 (非互斥可选)
- @story:* @epic:* @owner:* @risk:*   追溯 (非互斥可选)
- @boundary       Marker (无前缀例外)

评审时由 LLM 读取这份 JSON，基于 references/rules.md 的规则给出定性判断。
脚本本身不做严重度判定，只做"可机械测量的事实采集"。

用法：
    python scan.py <features-dir> [--output <path>]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

# ============================================================================
# Gherkin 解析
# ============================================================================

TAG_LINE = re.compile(r"^\s*(@[\w\-:]+(?:\s+@[\w\-:]+)*)\s*$")
FEATURE_LINE = re.compile(r"^\s*Feature\s*:\s*(.*)$", re.IGNORECASE)
BACKGROUND_LINE = re.compile(r"^\s*Background\s*:", re.IGNORECASE)
SCENARIO_LINE = re.compile(r"^\s*Scenario\s*:\s*(.*)$", re.IGNORECASE)
SCENARIO_OUTLINE_LINE = re.compile(r"^\s*Scenario\s+Outline\s*:\s*(.*)$", re.IGNORECASE)
EXAMPLES_LINE = re.compile(r"^\s*Examples\s*(?::\s*(.*))?\s*$", re.IGNORECASE)
STEP_LINE = re.compile(r"^\s*(Given|When|Then|And|But)\s+(.*)$", re.IGNORECASE)
TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$")
COMMENT_LINE = re.compile(r"^\s*#")
EMPTY_LINE = re.compile(r"^\s*$")


@dataclass
class Scenario:
    name: str
    line: int
    is_outline: bool
    tags: list[str] = field(default_factory=list)
    inherited_tags: list[str] = field(default_factory=list)
    step_count: int = 0
    when_count: int = 0
    then_and_count: int = 0
    examples_tables: list[dict] = field(default_factory=list)

    @property
    def effective_tags(self) -> list[str]:
        return sorted(set(self.tags + self.inherited_tags))


@dataclass
class FeatureFile:
    path: str
    absolute_path: str
    feature_name: str = ""
    feature_description: str = ""
    feature_tags: list[str] = field(default_factory=list)
    has_background: bool = False
    scenarios: list[Scenario] = field(default_factory=list)
    parse_errors: list[str] = field(default_factory=list)


def parse_feature_file(path: Path, root: Path) -> FeatureFile:
    rel = str(path.relative_to(root))
    ff = FeatureFile(path=rel, absolute_path=str(path))

    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (UnicodeDecodeError, OSError) as e:
        ff.parse_errors.append(f"cannot read file: {e}")
        return ff

    pending_tags: list[str] = []
    current_scenario: Optional[Scenario] = None
    in_description = False
    description_lines: list[str] = []
    in_examples_table = False
    current_examples_header: Optional[list[str]] = None
    current_examples_rows = 0
    current_examples_name = ""

    def flush_examples():
        nonlocal in_examples_table, current_examples_header, current_examples_rows, current_examples_name
        if current_scenario and current_examples_header is not None:
            current_scenario.examples_tables.append({
                "name": current_examples_name,
                "row_count": current_examples_rows,
                "col_count": len(current_examples_header),
            })
        in_examples_table = False
        current_examples_header = None
        current_examples_rows = 0
        current_examples_name = ""

    for i, raw in enumerate(lines, start=1):
        line = raw.rstrip()

        if COMMENT_LINE.match(line):
            continue

        if TAG_LINE.match(line.strip()):
            if in_examples_table:
                flush_examples()
            tags = [t for t in line.strip().split() if t.startswith("@")]
            pending_tags.extend(tags)
            continue

        m = FEATURE_LINE.match(line)
        if m:
            ff.feature_name = m.group(1).strip()
            ff.feature_tags = pending_tags[:]
            pending_tags = []
            in_description = True
            continue

        if BACKGROUND_LINE.match(line):
            if in_examples_table:
                flush_examples()
            ff.has_background = True
            in_description = False
            pending_tags = []
            current_scenario = None
            continue

        m = SCENARIO_OUTLINE_LINE.match(line)
        if m:
            if in_examples_table:
                flush_examples()
            in_description = False
            s = Scenario(
                name=m.group(1).strip(), line=i, is_outline=True,
                tags=pending_tags[:], inherited_tags=ff.feature_tags[:],
            )
            pending_tags = []
            ff.scenarios.append(s)
            current_scenario = s
            continue

        m = SCENARIO_LINE.match(line)
        if m:
            if in_examples_table:
                flush_examples()
            in_description = False
            s = Scenario(
                name=m.group(1).strip(), line=i, is_outline=False,
                tags=pending_tags[:], inherited_tags=ff.feature_tags[:],
            )
            pending_tags = []
            ff.scenarios.append(s)
            current_scenario = s
            continue

        m = EXAMPLES_LINE.match(line)
        if m:
            if in_examples_table:
                flush_examples()
            in_examples_table = True
            current_examples_name = (m.group(1) or "").strip()
            current_examples_header = None
            current_examples_rows = 0
            continue

        if TABLE_ROW.match(line):
            if in_examples_table:
                if current_examples_header is None:
                    current_examples_header = [
                        c.strip() for c in line.strip().strip("|").split("|")
                    ]
                else:
                    current_examples_rows += 1
            continue

        m = STEP_LINE.match(line)
        if m:
            if in_examples_table:
                flush_examples()
            in_description = False
            if current_scenario is not None:
                current_scenario.step_count += 1
                kw = m.group(1).lower()
                if kw == "when":
                    current_scenario.when_count += 1
                elif kw in ("then", "and", "but"):
                    current_scenario.then_and_count += 1
            continue

        if in_description and not EMPTY_LINE.match(line):
            description_lines.append(line.strip())

        if EMPTY_LINE.match(line) and in_examples_table:
            pass

    if in_examples_table:
        flush_examples()
    ff.feature_description = " ".join(description_lines).strip()

    return ff


# ============================================================================
# 标签常量 (v2)
# ============================================================================

LAYER_TAGS = [
    "@test-layer:api", "@test-layer:ui",
    "@test-layer:config", "@test-layer:e2e",
]
SPEC_TAGS = [
    "@spec:main", "@spec:normal", "@spec:related",
    "@spec:exception", "@spec:constraint",
    "@spec:testability", "@spec:contract", "@spec:technical",
]
STATUS_TAGS = [
    "@status:draft", "@status:review", "@status:pending",
    "@status:impl", "@status:deprecated", "@status:blocked",
]
EXEC_TAGS = [
    "@exec:smoke", "@exec:regression", "@exec:slow",
    "@exec:flaky", "@exec:hard",
]
BY_TAGS = ["@by:dev", "@by:qa"]

NFR_PREFIX = "@nfr:"
STORY_PREFIX = "@story:"
EPIC_PREFIX = "@epic:"
OWNER_PREFIX = "@owner:"
RISK_PREFIX = "@risk:"

BAD_TOPLEVEL_DIRS = {
    "ui", "api", "e2e", "smoke", "regression", "integration", "unit",
    "frontend", "backend", "web", "mobile", "main", "exception",
    "happy", "negative", "positive", "test", "tests",
}
STORY_ID_PATTERN = re.compile(r"^(US|JIRA|STORY|TICKET|TASK)[\-_]?\d+", re.IGNORECASE)

TECH_STACK_TAGS = {
    "@postgres", "@mysql", "@redis", "@kafka", "@rabbitmq", "@mongo",
    "@react", "@vue", "@angular", "@selenium", "@cypress", "@playwright",
    "@docker", "@kubernetes", "@aws", "@gcp", "@azure",
}

# 旧格式 → 新格式的迁移提示
LEGACY_TAGS = {
    "@main": "@spec:main",
    "@normal": "@spec:normal",
    "@exception": "@spec:exception",
    "@constraint": "@spec:constraint",
    "@testability": "@spec:testability",
    "@contract": "@spec:contract",
    "@related": "@spec:related",
    "@technical": "@spec:technical",
    "@layer-api": "@test-layer:api",
    "@layer-ui": "@test-layer:ui",
    "@layer-config": "@test-layer:config",
    "@layer-e2e": "@test-layer:e2e",
}
LEGACY_PREFIX_MIGRATION = {
    "@nfr-": "@nfr:",
    "@status-": "@status:",
    "@by-": "@by:",
    "@exec-": "@exec:",
    "@story-": "@story:",
    "@epic-": "@epic:",
    "@owner-": "@owner:",
    "@risk-": "@risk:",
}


def classify_single(tags: list[str], options: list[str]) -> tuple[str, int]:
    """互斥维度分类：返回 (命中标签 / 'unlabeled' / 'conflict', 命中数量)"""
    hits = [t for t in tags if t in options]
    if len(hits) == 0:
        return ("unlabeled", 0)
    if len(hits) == 1:
        return (hits[0], 1)
    return ("conflict", len(hits))


# ============================================================================
# 度量聚合
# ============================================================================

def aggregate(files: list[FeatureFile], root: Path) -> dict:
    total_scenarios = 0
    total_outlines = 0

    layer_counts = {t: 0 for t in LAYER_TAGS}
    layer_counts.update({"unlabeled": 0, "conflict": 0})
    spec_counts = {t: 0 for t in SPEC_TAGS}
    spec_counts.update({"unlabeled": 0, "conflict": 0})
    status_counts = {t: 0 for t in STATUS_TAGS}
    status_counts.update({"unlabeled (default-impl)": 0, "conflict": 0})
    by_counts = {t: 0 for t in BY_TAGS}
    by_counts.update({"unlabeled": 0, "conflict": 0})

    exec_counts = {t: 0 for t in EXEC_TAGS}
    nfr_counts: dict[str, int] = {}
    story_count = 0
    epic_count = 0
    owner_count = 0
    risk_count = 0

    all_tags: dict[str, int] = {}

    scenarios_missing_layer: list[dict] = []
    scenarios_missing_spec: list[dict] = []
    layer_conflicts: list[dict] = []
    spec_conflicts: list[dict] = []
    status_conflicts: list[dict] = []
    by_conflicts: list[dict] = []
    technical_outside_tech_dir: list[dict] = []
    tech_stack_tag_usages: list[dict] = []
    long_examples: list[dict] = []
    many_when: list[dict] = []
    long_steps: list[dict] = []
    nfr_without_exec: list[dict] = []
    flaky_scenarios: list[dict] = []
    legacy_tag_usages: list[dict] = []

    for ff in files:
        for s in ff.scenarios:
            total_scenarios += 1
            if s.is_outline:
                total_outlines += 1
            tags = s.effective_tags

            for t in tags:
                all_tags[t] = all_tags.get(t, 0) + 1

            layer, _ = classify_single(tags, LAYER_TAGS)
            layer_counts[layer] = layer_counts.get(layer, 0) + 1
            if layer == "unlabeled":
                scenarios_missing_layer.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                })
            elif layer == "conflict":
                layer_conflicts.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "tags": [t for t in tags if t in LAYER_TAGS],
                })

            spec, _ = classify_single(tags, SPEC_TAGS)
            spec_counts[spec] = spec_counts.get(spec, 0) + 1
            if spec == "unlabeled":
                scenarios_missing_spec.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                })
            elif spec == "conflict":
                spec_conflicts.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "tags": [t for t in tags if t in SPEC_TAGS],
                })

            status, _ = classify_single(tags, STATUS_TAGS)
            if status == "unlabeled":
                status_counts["unlabeled (default-impl)"] += 1
            elif status == "conflict":
                status_counts["conflict"] += 1
                status_conflicts.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "tags": [t for t in tags if t in STATUS_TAGS],
                })
            else:
                status_counts[status] = status_counts.get(status, 0) + 1

            by, _ = classify_single(tags, BY_TAGS)
            by_counts[by] = by_counts.get(by, 0) + 1
            if by == "conflict":
                by_conflicts.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "tags": [t for t in tags if t in BY_TAGS],
                })

            has_nfr = False
            has_exec = False
            for t in tags:
                if t in EXEC_TAGS:
                    exec_counts[t] = exec_counts.get(t, 0) + 1
                    has_exec = True
                if t.startswith(NFR_PREFIX):
                    nfr_counts[t] = nfr_counts.get(t, 0) + 1
                    has_nfr = True
                if t.startswith(STORY_PREFIX):
                    story_count += 1
                if t.startswith(EPIC_PREFIX):
                    epic_count += 1
                if t.startswith(OWNER_PREFIX):
                    owner_count += 1
                if t.startswith(RISK_PREFIX):
                    risk_count += 1

            if has_nfr and not has_exec:
                nfr_without_exec.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "nfr_tags": [t for t in tags if t.startswith(NFR_PREFIX)],
                })

            if "@exec:flaky" in tags:
                flaky_scenarios.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                })

            if "@spec:technical" in tags and not ff.path.startswith("_technical"):
                technical_outside_tech_dir.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                })

            for t in tags:
                if t in TECH_STACK_TAGS:
                    tech_stack_tag_usages.append({
                        "file": ff.path, "scenario": s.name, "line": s.line, "tag": t,
                    })

            for t in tags:
                if t in LEGACY_TAGS:
                    legacy_tag_usages.append({
                        "file": ff.path, "scenario": s.name, "line": s.line,
                        "legacy_tag": t, "migrate_to": LEGACY_TAGS[t],
                    })
                else:
                    for old_prefix, new_prefix in LEGACY_PREFIX_MIGRATION.items():
                        if t.startswith(old_prefix):
                            legacy_tag_usages.append({
                                "file": ff.path, "scenario": s.name, "line": s.line,
                                "legacy_tag": t,
                                "migrate_to": t.replace(old_prefix, new_prefix, 1),
                            })
                            break

            for ex in s.examples_tables:
                if ex["row_count"] > 15:
                    long_examples.append({
                        "file": ff.path, "scenario": s.name, "line": s.line,
                        "examples_name": ex["name"], "row_count": ex["row_count"],
                        "col_count": ex["col_count"],
                    })

            if s.when_count >= 2:
                many_when.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "when_count": s.when_count,
                })

            if s.step_count > 10:
                long_steps.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "step_count": s.step_count,
                })

    # 目录层面
    top_level_dirs = set()
    bad_toplevel = []
    story_id_files = []
    shared_files = []
    technical_files = []
    max_depth = 0
    deepest_path = ""
    dir_file_counts: dict[str, int] = {}

    for ff in files:
        parts = Path(ff.path).parts
        depth = len(parts)
        if depth > max_depth:
            max_depth = depth
            deepest_path = ff.path
        if len(parts) >= 1:
            top_level_dirs.add(parts[0])
        if len(parts) >= 2:
            dir_key = str(Path(*parts[:-1]))
            dir_file_counts[dir_key] = dir_file_counts.get(dir_key, 0) + 1

        if len(parts) >= 2:
            top = parts[0].lower()
            if not top.startswith("_") and top in BAD_TOPLEVEL_DIRS:
                bad_toplevel.append({"path": ff.path, "top_dir": parts[0]})

        filename = Path(ff.path).stem
        if STORY_ID_PATTERN.match(filename):
            story_id_files.append(ff.path)

        if ff.path.startswith("_shared"):
            shared_files.append(ff.path)
        if ff.path.startswith("_technical"):
            technical_files.append(ff.path)

    boundaries_without_outline = []
    boundaries_without_boundary_tag = []
    ui_files_without_ui_tag = []

    for ff in files:
        stem = Path(ff.path).stem
        if stem.endswith("_boundaries"):
            if not any(s.is_outline for s in ff.scenarios):
                boundaries_without_outline.append(ff.path)
            feature_has_boundary = "@boundary" in ff.feature_tags
            scenarios_have_boundary = all(
                "@boundary" in s.effective_tags for s in ff.scenarios
            ) if ff.scenarios else False
            if not (feature_has_boundary or scenarios_have_boundary):
                boundaries_without_boundary_tag.append(ff.path)
        if stem.endswith("_ui"):
            missing = [
                s.name for s in ff.scenarios
                if "@test-layer:ui" not in s.effective_tags
            ]
            if missing:
                ui_files_without_ui_tag.append({
                    "file": ff.path, "scenarios_missing": missing,
                })

    large_features = [
        {"file": ff.path, "scenario_count": len(ff.scenarios)}
        for ff in files if len(ff.scenarios) > 15
    ]

    missing_description = [
        ff.path for ff in files
        if ff.feature_name and not ff.feature_description
    ]

    # 标签近似聚类：去除所有分隔符后重合则提示
    tag_aliases: dict[str, list[str]] = {}
    for t in all_tags:
        norm = (
            t.lower()
            .replace("_", "")
            .replace("-", "")
            .replace(":", "")
        )
        tag_aliases.setdefault(norm, [])
        if t not in tag_aliases[norm]:
            tag_aliases[norm].append(t)
    inconsistent_tags = {
        norm: variants for norm, variants in tag_aliases.items()
        if len(variants) > 1
    }

    similar_scenario_groups: list[dict] = []
    for ff in files:
        signature_map: dict[tuple, list[str]] = {}
        for s in ff.scenarios:
            if s.is_outline:
                continue
            sig = (s.step_count, s.when_count, s.then_and_count)
            signature_map.setdefault(sig, []).append(s.name)
        for sig, names in signature_map.items():
            if len(names) >= 3:
                similar_scenario_groups.append({
                    "file": ff.path,
                    "signature": {
                        "step_count": sig[0],
                        "when_count": sig[1],
                        "then_and_count": sig[2],
                    },
                    "scenarios": names,
                })

    def pct(n: int, total: int) -> float:
        return round(100.0 * n / total, 2) if total else 0.0

    api_n = layer_counts.get("@test-layer:api", 0)
    ui_n = layer_counts.get("@test-layer:ui", 0)
    e2e_n = layer_counts.get("@test-layer:e2e", 0)
    flaky_n = exec_counts.get("@exec:flaky", 0)

    return {
        "summary": {
            "features_root": str(root),
            "file_count": len(files),
            "total_scenarios": total_scenarios,
            "total_outlines": total_outlines,
            "top_level_dirs": sorted(top_level_dirs),
            "max_depth": max_depth,
            "deepest_path": deepest_path,
            "shared_file_count": len(shared_files),
            "technical_file_count": len(technical_files),
            "technical_pct": pct(len(technical_files), len(files)),
            "flaky_scenario_count": flaky_n,
            "flaky_pct": pct(flaky_n, total_scenarios),
        },
        "layer_distribution": {
            **{
                t: {
                    "count": layer_counts.get(t, 0),
                    "pct": pct(layer_counts.get(t, 0), total_scenarios),
                }
                for t in LAYER_TAGS + ["unlabeled", "conflict"]
            },
            "ui_to_api_ratio_pct": pct(ui_n, api_n) if api_n else None,
            "e2e_to_total_pct": pct(e2e_n, total_scenarios),
        },
        "spec_distribution": {
            t: {
                "count": spec_counts.get(t, 0),
                "pct": pct(spec_counts.get(t, 0), total_scenarios),
            }
            for t in SPEC_TAGS + ["unlabeled", "conflict"]
        },
        "status_distribution": {
            k: {"count": v, "pct": pct(v, total_scenarios)}
            for k, v in status_counts.items()
        },
        "by_distribution": {
            t: {
                "count": by_counts.get(t, 0),
                "pct": pct(by_counts.get(t, 0), total_scenarios),
            }
            for t in BY_TAGS + ["unlabeled", "conflict"]
        },
        "exec_distribution": {
            t: {
                "count": exec_counts.get(t, 0),
                "pct": pct(exec_counts.get(t, 0), total_scenarios),
            }
            for t in EXEC_TAGS
        },
        "nfr_distribution": {
            t: {"count": c, "pct": pct(c, total_scenarios)}
            for t, c in sorted(nfr_counts.items(), key=lambda kv: -kv[1])
        },
        "traceability_summary": {
            "story_tag_count": story_count,
            "epic_tag_count": epic_count,
            "owner_tag_count": owner_count,
            "risk_tag_count": risk_count,
            "story_coverage_pct": pct(story_count, total_scenarios),
        },
        "tag_usage": dict(sorted(all_tags.items(), key=lambda kv: -kv[1])),
        "findings": {
            "bad_toplevel_dirs": bad_toplevel,
            "story_id_filenames": story_id_files,
            "scenarios_missing_layer_tag": scenarios_missing_layer,
            "scenarios_missing_spec_tag": scenarios_missing_spec,
            "layer_tag_conflicts": layer_conflicts,
            "spec_tag_conflicts": spec_conflicts,
            "status_tag_conflicts": status_conflicts,
            "by_tag_conflicts": by_conflicts,
            "technical_tag_outside_technical_dir": technical_outside_tech_dir,
            "tech_stack_tag_usages": tech_stack_tag_usages,
            "legacy_tag_usages": legacy_tag_usages,
            "long_examples_tables": long_examples,
            "scenarios_with_multiple_when": many_when,
            "scenarios_with_long_step_chain": long_steps,
            "nfr_scenarios_without_exec_tag": nfr_without_exec,
            "flaky_scenarios": flaky_scenarios,
            "boundaries_files_without_scenario_outline": boundaries_without_outline,
            "boundaries_files_missing_boundary_tag": boundaries_without_boundary_tag,
            "ui_files_with_scenarios_missing_ui_tag": ui_files_without_ui_tag,
            "features_with_too_many_scenarios": large_features,
            "features_missing_description": missing_description,
            "inconsistent_tag_spellings": inconsistent_tags,
            "similar_scenario_groups_suggesting_outline": similar_scenario_groups,
            "dir_file_counts": dict(sorted(
                dir_file_counts.items(), key=lambda kv: -kv[1]
            )),
        },
        "files": [asdict_file(ff) for ff in files],
    }


def asdict_file(ff: FeatureFile) -> dict:
    d = asdict(ff)
    d["scenarios"] = [asdict(s) for s in ff.scenarios]
    for s_dict, s in zip(d["scenarios"], ff.scenarios):
        s_dict["effective_tags"] = s.effective_tags
    return d


# ============================================================================
# 入口
# ============================================================================

def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("features_dir", help="features/ 目录的路径")
    ap.add_argument("--output", "-o", default=None, help="输出 JSON 路径；默认 stdout")
    args = ap.parse_args()

    root = Path(args.features_dir).resolve()
    if not root.exists() or not root.is_dir():
        print(f"错误：目录不存在或不是目录：{root}", file=sys.stderr)
        sys.exit(2)

    feature_paths = sorted(root.rglob("*.feature"))
    if not feature_paths:
        print(f"警告：在 {root} 下没有找到 .feature 文件", file=sys.stderr)

    files = [parse_feature_file(p, root) for p in feature_paths]
    report = aggregate(files, root)

    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(output, encoding="utf-8")
        print(f"已写入 {args.output}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
