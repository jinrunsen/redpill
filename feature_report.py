#!/usr/bin/env python3
"""
Feature Status Report Generator (static, read-only)
核心: behave --dry-run -f json → 零执行，秒级解析全部 feature 元数据
绝不执行场景，绝不修改文件。不决定"下一步做什么"。
"""
import json
import re
import subprocess
import sys
from collections import defaultdict

STATUS_TAGS = ["status-todo", "status-active", "status-done", "status-blocked"]


def run_behave_dry_run():
    """behave --dry-run -f json，零执行只解析。"""
    cmd = ["behave", "--dry-run", "-f", "json", "--no-summary", "--no-color"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        m = re.search(r"(\[.*\])", result.stdout, re.DOTALL)
        return json.loads(m.group(1)) if m else []


def get_scenario_status(tags):
    """从标签集合中提取状态标签。"""
    for t in STATUS_TAGS:
        if t in tags:
            return t
    return "no-status"


def build_file_stats(data):
    """按文件统计各状态标签的场景数。"""
    file_stats = defaultdict(lambda: defaultdict(int))
    for feat in data:
        feat_file = feat["location"].split(":")[0]
        for elem in feat.get("elements", []):
            if elem.get("type") != "scenario":
                continue
            st = get_scenario_status(set(elem.get("tags", [])))
            file_stats[feat_file][st] += 1
    return file_stats


def determine_exit_condition(totals):
    """判断退出条件。"""
    total = sum(totals[c] for c in STATUS_TAGS)
    if total == 0:
        return "NO_FEATURES"
    if totals["status-done"] == total:
        return "ALL_DONE"
    if totals["status-todo"] == 0 and totals["status-active"] == 0:
        return "ALL_BLOCKED"
    return "HAS_WORK"


def main():
    sys.stderr.write("Scanning features (dry-run)...\n")
    all_data = run_behave_dry_run()

    if not all_data:
        print("## Feature Status Report\n")
        print("No .feature files found or behave returned no data.")
        print()
        print("<FEATURE_SCAN_RESULT>")
        print("exit_condition: NO_FEATURES")
        print("</FEATURE_SCAN_RESULT>")
        return

    file_stats = build_file_stats(all_data)

    # 收集 active 场景
    active_scenarios = []
    for feat in all_data:
        feat_file = feat["location"].split(":")[0]
        for elem in feat.get("elements", []):
            if elem.get("type") != "scenario":
                continue
            if "status-active" in set(elem.get("tags", [])):
                active_scenarios.append({
                    "location": elem["location"],
                    "name": elem["name"],
                })

    # Markdown 报告
    print("## Feature Status Report\n")
    print("| Feature File | @todo | @active | @done | @blocked | Total |")
    print("|---|:---:|:---:|:---:|:---:|:---:|")

    totals = defaultdict(int)
    for f in sorted(file_stats):
        s = file_stats[f]
        t = sum(s.get(c, 0) for c in STATUS_TAGS)
        cells = " | ".join(str(s.get(c, 0)) for c in STATUS_TAGS)
        print(f"| `{f}` | {cells} | {t} |")
        for c in STATUS_TAGS:
            totals[c] += s.get(c, 0)
        totals["total"] += t

    tc = " | ".join(f"**{totals[c]}**" for c in STATUS_TAGS)
    print(f"| **TOTAL** | {tc} | **{totals['total']}** |")
    print()

    done = totals["status-done"]
    total = totals["total"]
    pct = (done / total * 100) if total else 0
    print(f"Progress: {done}/{total} scenarios done ({pct:.0f}%)")

    if active_scenarios:
        print()
        print("### Active -- in progress")
        for sc in active_scenarios:
            print(f"- `{sc['location']}` **{sc['name']}**")

    # 结构化输出
    exit_cond = determine_exit_condition(totals)

    print()
    print("<FEATURE_SCAN_RESULT>")
    print(f"total_scenarios: {total}")
    print("status:")
    print(f"  todo: {totals['status-todo']}")
    print(f"  active: {totals['status-active']}")
    print(f"  done: {done}")
    print(f"  blocked: {totals['status-blocked']}")
    print(f'progress: "{done}/{total} ({pct:.0f}%)"')
    if active_scenarios:
        items = ", ".join(f'"{s["location"]} {s["name"]}"' for s in active_scenarios)
        print(f"active_scenarios: [{items}]")
    print(f"exit_condition: {exit_cond}")
    print("</FEATURE_SCAN_RESULT>")


if __name__ == "__main__":
    main()
