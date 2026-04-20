#!/usr/bin/env python3
"""
scan.py — Features 目录扫描器

遍历一个 BDD features/ 目录，解析每个 .feature 文件的标签、scenario、
Scenario Outline 及其 Examples，产出 JSON 形式的客观度量数据。

评审时由 LLM 读取这份 JSON，基于 references/rules.md 的规则给出定性判断。
脚本本身不做严重度判定，只做"可机械测量的事实采集"。

用法：
    python scan.py <features-dir> [--output <path>]

输出结构见文件末尾的 schema 注释。
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
# Gherkin 解析（轻量级，不依赖 gherkin 包；仅识别评审所需的结构）
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
    tags: list[str] = field(default_factory=list)          # scenario 自己的标签
    inherited_tags: list[str] = field(default_factory=list)  # 从 feature 级继承来的标签
    step_count: int = 0
    when_count: int = 0
    then_and_count: int = 0
    examples_tables: list[dict] = field(default_factory=list)  # [{name, row_count, col_count}]

    @property
    def effective_tags(self) -> list[str]:
        return sorted(set(self.tags + self.inherited_tags))


@dataclass
class FeatureFile:
    path: str                      # 相对于 features-root 的路径
    absolute_path: str
    feature_name: str = ""
    feature_description: str = ""  # feature 行之后、第一个 Scenario/Background 之前的文本
    feature_tags: list[str] = field(default_factory=list)
    has_background: bool = False
    scenarios: list[Scenario] = field(default_factory=list)
    parse_errors: list[str] = field(default_factory=list)


def parse_feature_file(path: Path, root: Path) -> FeatureFile:
    """
    解析单个 .feature 文件。
    策略：行扫描，维护"待挂载的标签缓冲区"——下一个 Feature/Scenario/Examples 消费它们。
    """
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

        # Tag 行
        if TAG_LINE.match(line.strip()):
            if in_examples_table:
                flush_examples()
            tags = [t for t in line.strip().split() if t.startswith("@")]
            pending_tags.extend(tags)
            continue

        # Feature 行
        m = FEATURE_LINE.match(line)
        if m:
            ff.feature_name = m.group(1).strip()
            ff.feature_tags = pending_tags[:]
            pending_tags = []
            in_description = True
            continue

        # Background 行
        if BACKGROUND_LINE.match(line):
            if in_examples_table:
                flush_examples()
            ff.has_background = True
            in_description = False
            pending_tags = []  # background 前的 tag 不归属任何 scenario
            current_scenario = None
            continue

        # Scenario Outline
        m = SCENARIO_OUTLINE_LINE.match(line)
        if m:
            if in_examples_table:
                flush_examples()
            in_description = False
            s = Scenario(
                name=m.group(1).strip(),
                line=i,
                is_outline=True,
                tags=pending_tags[:],
                inherited_tags=ff.feature_tags[:],
            )
            pending_tags = []
            ff.scenarios.append(s)
            current_scenario = s
            continue

        # Scenario
        m = SCENARIO_LINE.match(line)
        if m:
            if in_examples_table:
                flush_examples()
            in_description = False
            s = Scenario(
                name=m.group(1).strip(),
                line=i,
                is_outline=False,
                tags=pending_tags[:],
                inherited_tags=ff.feature_tags[:],
            )
            pending_tags = []
            ff.scenarios.append(s)
            current_scenario = s
            continue

        # Examples 行
        m = EXAMPLES_LINE.match(line)
        if m:
            if in_examples_table:
                flush_examples()
            in_examples_table = True
            current_examples_name = (m.group(1) or "").strip()
            current_examples_header = None
            current_examples_rows = 0
            continue

        # 表格行（可能是 Examples 表，也可能是 step 里的 data table）
        if TABLE_ROW.match(line):
            if in_examples_table:
                if current_examples_header is None:
                    # 第一行作为表头
                    current_examples_header = [
                        c.strip() for c in line.strip().strip("|").split("|")
                    ]
                else:
                    current_examples_rows += 1
            continue

        # Step 行
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

        # Description 收集
        if in_description and not EMPTY_LINE.match(line):
            description_lines.append(line.strip())

        # 空行：如果在 Examples 区块，很多项目用空行终止表格
        if EMPTY_LINE.match(line) and in_examples_table:
            # 仅当已有表头且至少一行数据时，遇空行不视为终止，继续等表格行
            pass

    # 文件末尾的收尾
    if in_examples_table:
        flush_examples()
    ff.feature_description = " ".join(description_lines).strip()

    return ff


# ============================================================================
# 度量聚合
# ============================================================================

LAYER_TAGS = ["@layer-api", "@layer-ui", "@layer-config", "@layer-e2e"]
PERSPECTIVE_TAGS = ["@main", "@related", "@exception", "@technical"]
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


def classify_layer(tags: list[str]) -> tuple[str, int]:
    """返回 (层级标签或 'unlabeled', 层级标签个数)"""
    hits = [t for t in tags if t in LAYER_TAGS]
    if len(hits) == 0:
        return ("unlabeled", 0)
    if len(hits) == 1:
        return (hits[0], 1)
    return ("conflict", len(hits))


def classify_perspective(tags: list[str]) -> tuple[str, int]:
    hits = [t for t in tags if t in PERSPECTIVE_TAGS]
    if len(hits) == 0:
        return ("unlabeled", 0)
    if len(hits) == 1:
        return (hits[0], 1)
    return ("conflict", len(hits))


def aggregate(files: list[FeatureFile], root: Path) -> dict:
    total_scenarios = 0
    total_outlines = 0
    layer_counts = {t: 0 for t in LAYER_TAGS}
    layer_counts["unlabeled"] = 0
    layer_counts["conflict"] = 0
    perspective_counts = {t: 0 for t in PERSPECTIVE_TAGS}
    perspective_counts["unlabeled"] = 0
    perspective_counts["conflict"] = 0

    all_tags: dict[str, int] = {}
    scenarios_missing_layer: list[dict] = []
    scenarios_missing_perspective: list[dict] = []
    layer_conflicts: list[dict] = []
    perspective_conflicts: list[dict] = []
    tech_stack_tag_usages: list[dict] = []
    long_examples: list[dict] = []      # Examples 行数 > 15 的警报
    many_when: list[dict] = []          # when >= 2
    long_steps: list[dict] = []         # 步骤 > 10
    technical_outside_tech_dir: list[dict] = []

    for ff in files:
        for s in ff.scenarios:
            total_scenarios += 1
            if s.is_outline:
                total_outlines += 1
            tags = s.effective_tags

            # 累积所有 tag 的使用情况
            for t in tags:
                all_tags[t] = all_tags.get(t, 0) + 1

            # 分层分类
            layer, n = classify_layer(tags)
            layer_counts[layer] = layer_counts.get(layer, 0) + 1
            if layer == "unlabeled":
                # _technical/ 下可以豁免，但仍然记录
                scenarios_missing_layer.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                })
            elif layer == "conflict":
                layer_conflicts.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "tags": [t for t in tags if t in LAYER_TAGS],
                })

            # 视角分类
            persp, n = classify_perspective(tags)
            perspective_counts[persp] = perspective_counts.get(persp, 0) + 1
            if persp == "unlabeled":
                scenarios_missing_perspective.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                })
            elif persp == "conflict":
                perspective_conflicts.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "tags": [t for t in tags if t in PERSPECTIVE_TAGS],
                })

            # @technical 在非 _technical/ 下
            if "@technical" in tags and not ff.path.startswith("_technical"):
                technical_outside_tech_dir.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                })

            # 技术栈标签
            for t in tags:
                if t in TECH_STACK_TAGS:
                    tech_stack_tag_usages.append({
                        "file": ff.path, "scenario": s.name, "line": s.line, "tag": t,
                    })

            # Examples 表过长
            for ex in s.examples_tables:
                if ex["row_count"] > 15:
                    long_examples.append({
                        "file": ff.path, "scenario": s.name, "line": s.line,
                        "examples_name": ex["name"], "row_count": ex["row_count"],
                        "col_count": ex["col_count"],
                    })

            # 多 when
            if s.when_count >= 2:
                many_when.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "when_count": s.when_count,
                })

            # 长步骤链
            if s.step_count > 10:
                long_steps.append({
                    "file": ff.path, "scenario": s.name, "line": s.line,
                    "step_count": s.step_count,
                })

    # 目录结构检查
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
        # 目录文件数统计
        if len(parts) >= 2:
            dir_key = str(Path(*parts[:-1]))
            dir_file_counts[dir_key] = dir_file_counts.get(dir_key, 0) + 1

        # 坏顶层目录
        if len(parts) >= 2:  # 有顶层目录+文件
            top = parts[0].lower()
            if not top.startswith("_") and top in BAD_TOPLEVEL_DIRS:
                bad_toplevel.append({"path": ff.path, "top_dir": parts[0]})

        # Story ID 命名
        filename = Path(ff.path).stem
        if STORY_ID_PATTERN.match(filename):
            story_id_files.append(ff.path)

        # _shared / _technical 收集
        if ff.path.startswith("_shared"):
            shared_files.append(ff.path)
        if ff.path.startswith("_technical"):
            technical_files.append(ff.path)

    # 文件命名与内容一致性
    boundaries_without_outline = []
    boundaries_without_boundary_tag = []
    ui_files_without_ui_tag = []

    for ff in files:
        stem = Path(ff.path).stem
        # _boundaries.feature 但没有 Scenario Outline
        if stem.endswith("_boundaries"):
            if not any(s.is_outline for s in ff.scenarios):
                boundaries_without_outline.append(ff.path)
            # 且没有一个 scenario 有 @boundary
            has_boundary_tag = any(
                "@boundary" in s.effective_tags for s in ff.scenarios
            )
            if not has_boundary_tag:
                boundaries_without_boundary_tag.append(ff.path)
        # _ui.feature 但没有 @layer-ui
        if stem.endswith("_ui"):
            missing = [
                s.name for s in ff.scenarios
                if "@layer-ui" not in s.effective_tags
            ]
            if missing:
                ui_files_without_ui_tag.append({
                    "file": ff.path, "scenarios_missing": missing,
                })

    # Feature 内 scenario 过多
    large_features = [
        {"file": ff.path, "scenario_count": len(ff.scenarios)}
        for ff in files if len(ff.scenarios) > 15
    ]

    # 缺少 feature description
    missing_description = [
        ff.path for ff in files
        if ff.feature_name and not ff.feature_description
    ]

    # 标签近似聚类（检测拼写不一致）
    # 归一化策略：小写 + 去除所有 - 和 _，这样 @layer-api / @layerApi / @layer_api
    # 都归一化为 @layerapi，若归一化后原形有多种，则报警。
    tag_aliases: dict[str, list[str]] = {}
    for t in all_tags:
        norm = t.lower().replace("_", "").replace("-", "")
        tag_aliases.setdefault(norm, [])
        if t not in tag_aliases[norm]:
            tag_aliases[norm].append(t)
    inconsistent_tags = {
        norm: variants for norm, variants in tag_aliases.items()
        if len(variants) > 1
    }

    # 同一 feature 内的相似 scenario（简单检测：同步骤数同 when 数同 then_and 数）
    similar_scenario_groups: list[dict] = []
    for ff in files:
        signature_map: dict[tuple, list[str]] = {}
        for s in ff.scenarios:
            if s.is_outline:
                continue
            sig = (s.step_count, s.when_count, s.then_and_count)
            signature_map.setdefault(sig, []).append(s.name)
        for sig, names in signature_map.items():
            if len(names) >= 3:  # 3 个以上结构相同的 scenario 极可能是可合并为 Outline
                similar_scenario_groups.append({
                    "file": ff.path,
                    "signature": {"step_count": sig[0], "when_count": sig[1], "then_and_count": sig[2]},
                    "scenarios": names,
                })

    # 分层占比
    def pct(n: int, total: int) -> float:
        return round(100.0 * n / total, 2) if total else 0.0

    api_n = layer_counts.get("@layer-api", 0)
    ui_n = layer_counts.get("@layer-ui", 0)
    config_n = layer_counts.get("@layer-config", 0)
    e2e_n = layer_counts.get("@layer-e2e", 0)

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
        },
        "layer_distribution": {
            "@layer-api": {"count": api_n, "pct": pct(api_n, total_scenarios)},
            "@layer-ui": {"count": ui_n, "pct": pct(ui_n, total_scenarios)},
            "@layer-config": {"count": config_n, "pct": pct(config_n, total_scenarios)},
            "@layer-e2e": {"count": e2e_n, "pct": pct(e2e_n, total_scenarios)},
            "unlabeled": {
                "count": layer_counts.get("unlabeled", 0),
                "pct": pct(layer_counts.get("unlabeled", 0), total_scenarios),
            },
            "conflict": {
                "count": layer_counts.get("conflict", 0),
                "pct": pct(layer_counts.get("conflict", 0), total_scenarios),
            },
            "ui_to_api_ratio_pct": pct(ui_n, api_n) if api_n else None,
            "e2e_to_total_pct": pct(e2e_n, total_scenarios),
        },
        "perspective_distribution": {
            t: {
                "count": perspective_counts.get(t, 0),
                "pct": pct(perspective_counts.get(t, 0), total_scenarios),
            } for t in PERSPECTIVE_TAGS + ["unlabeled", "conflict"]
        },
        "tag_usage": dict(sorted(all_tags.items(), key=lambda kv: -kv[1])),
        "findings": {
            "bad_toplevel_dirs": bad_toplevel,
            "story_id_filenames": story_id_files,
            "scenarios_missing_layer_tag": scenarios_missing_layer,
            "scenarios_missing_perspective_tag": scenarios_missing_perspective,
            "layer_tag_conflicts": layer_conflicts,
            "perspective_tag_conflicts": perspective_conflicts,
            "technical_tag_outside_technical_dir": technical_outside_tech_dir,
            "tech_stack_tag_usages": tech_stack_tag_usages,
            "long_examples_tables": long_examples,
            "scenarios_with_multiple_when": many_when,
            "scenarios_with_long_step_chain": long_steps,
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
    # 补上 effective_tags（asdict 不会执行 property）
    for s_dict, s in zip(d["scenarios"], ff.scenarios):
        s_dict["effective_tags"] = s.effective_tags
    return d


# ============================================================================
# 入口
# ============================================================================

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
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


# ============================================================================
# 输出 Schema（评审时 LLM 据此消费）
# ============================================================================
# {
#   "summary": {
#     "features_root": str,
#     "file_count": int,
#     "total_scenarios": int,
#     "total_outlines": int,
#     "top_level_dirs": [str],
#     "max_depth": int,
#     "deepest_path": str,
#     "shared_file_count": int,
#     "technical_file_count": int,
#     "technical_pct": float
#   },
#   "layer_distribution": {
#     "@layer-api" | ... | "unlabeled" | "conflict": {"count": int, "pct": float},
#     "ui_to_api_ratio_pct": float | null,  # UI 数 / API 数
#     "e2e_to_total_pct": float
#   },
#   "perspective_distribution": { ... 同结构 },
#   "tag_usage": { "@tag": count, ... 按 count 降序 },
#   "findings": {
#     "bad_toplevel_dirs": [{path, top_dir}],
#     "story_id_filenames": [path],
#     "scenarios_missing_layer_tag": [{file, scenario, line}],
#     "scenarios_missing_perspective_tag": [...],
#     "layer_tag_conflicts": [{file, scenario, line, tags}],
#     "perspective_tag_conflicts": [...],
#     "technical_tag_outside_technical_dir": [{file, scenario, line}],
#     "tech_stack_tag_usages": [{file, scenario, line, tag}],
#     "long_examples_tables": [{file, scenario, line, examples_name, row_count, col_count}],
#     "scenarios_with_multiple_when": [{file, scenario, line, when_count}],
#     "scenarios_with_long_step_chain": [{file, scenario, line, step_count}],
#     "boundaries_files_without_scenario_outline": [path],
#     "boundaries_files_missing_boundary_tag": [path],
#     "ui_files_with_scenarios_missing_ui_tag": [{file, scenarios_missing}],
#     "features_with_too_many_scenarios": [{file, scenario_count}],
#     "features_missing_description": [path],
#     "inconsistent_tag_spellings": {normalized_form: [variant1, variant2, ...]},
#     "similar_scenario_groups_suggesting_outline": [
#       {file, signature: {step_count, when_count, then_and_count}, scenarios: [names]}
#     ],
#     "dir_file_counts": {dir_path: int}
#   },
#   "files": [
#     {
#       "path": relative_path,
#       "absolute_path": abs,
#       "feature_name": str,
#       "feature_description": str,
#       "feature_tags": [tag],
#       "has_background": bool,
#       "scenarios": [
#         {
#           "name": str, "line": int, "is_outline": bool,
#           "tags": [own_tags], "inherited_tags": [feature_tags],
#           "effective_tags": [union],
#           "step_count": int, "when_count": int, "then_and_count": int,
#           "examples_tables": [{name, row_count, col_count}]
#         }
#       ],
#       "parse_errors": [str]
#     }
#   ]
# }
