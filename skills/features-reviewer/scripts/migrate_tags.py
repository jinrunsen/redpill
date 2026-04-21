#!/usr/bin/env python3
"""
migrate_tags.py — 旧格式 → v2 冒号格式的标签批量迁移

把 features/ 目录下所有 .feature 文件中的旧格式标签替换为新格式。

迁移映射：
  @main              → @spec:main
  @normal            → @spec:normal
  @exception         → @spec:exception
  @constraint        → @spec:constraint
  @testability       → @spec:testability
  @contract          → @spec:contract
  @related           → @spec:related
  @technical         → @spec:technical
  @layer-api         → @test-layer:api
  @layer-ui          → @test-layer:ui
  @layer-config      → @test-layer:config
  @layer-e2e         → @test-layer:e2e
  @nfr-*             → @nfr:*
  @status-*          → @status:*
  @by-*              → @by:*
  @exec-*            → @exec:*
  @story-*           → @story:*
  @epic-*            → @epic:*
  @owner-*           → @owner:*
  @risk-*            → @risk:*

@boundary 保留不变（marker 标签）。

用法：
    python migrate_tags.py <features-dir>             # 实际执行替换
    python migrate_tags.py <features-dir> --dry-run   # 仅预览将发生的变更
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# 完整词替换（使用单词边界避免误伤）
# 注意：\b 在 Python regex 中对 @ 符号前可以匹配——因为 @ 前一般是行首或空白
EXACT_REPLACEMENTS = [
    (r'@main\b', '@spec:main'),
    (r'@normal\b', '@spec:normal'),
    (r'@exception\b', '@spec:exception'),
    (r'@constraint\b', '@spec:constraint'),
    (r'@testability\b', '@spec:testability'),
    (r'@contract\b', '@spec:contract'),
    (r'@related\b', '@spec:related'),
    (r'@technical\b', '@spec:technical'),
    (r'@layer-api\b', '@test-layer:api'),
    (r'@layer-ui\b', '@test-layer:ui'),
    (r'@layer-config\b', '@test-layer:config'),
    (r'@layer-e2e\b', '@test-layer:e2e'),
]

# 前缀替换（只把开头的 `前缀-` 替换为 `前缀:`，后面的值保持原样）
PREFIX_REPLACEMENTS = [
    (r'@nfr-', '@nfr:'),
    (r'@status-', '@status:'),
    (r'@by-', '@by:'),
    (r'@exec-', '@exec:'),
    (r'@story-', '@story:'),
    (r'@epic-', '@epic:'),
    (r'@owner-', '@owner:'),
    (r'@risk-', '@risk:'),
]


def migrate_text(text: str) -> tuple[str, int]:
    """对文本内容做迁移，返回 (新内容, 替换次数)"""
    total = 0
    new = text
    for pat, repl in EXACT_REPLACEMENTS:
        new, n = re.subn(pat, repl, new)
        total += n
    for pat, repl in PREFIX_REPLACEMENTS:
        new, n = re.subn(pat, repl, new)
        total += n
    return new, total


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("features_dir", help="features/ 目录")
    ap.add_argument("--dry-run", action="store_true",
                    help="仅预览将要进行的替换，不实际修改文件")
    args = ap.parse_args()

    root = Path(args.features_dir).resolve()
    if not root.exists() or not root.is_dir():
        print(f"错误：目录不存在或不是目录：{root}", file=sys.stderr)
        sys.exit(2)

    files = sorted(root.rglob("*.feature"))
    if not files:
        print(f"警告：{root} 下没有 .feature 文件", file=sys.stderr)
        return

    total_files_changed = 0
    total_replacements = 0

    for p in files:
        try:
            original = p.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            print(f"跳过（非 UTF-8）：{p}", file=sys.stderr)
            continue

        new_text, n = migrate_text(original)
        if n > 0:
            total_replacements += n
            total_files_changed += 1
            if args.dry_run:
                print(f"[DRY-RUN] 将替换 {n} 处: {p.relative_to(root)}")
                # 展示具体变更前几处
                for orig_line, new_line in zip(
                    original.splitlines()[:200], new_text.splitlines()[:200]
                ):
                    if orig_line != new_line:
                        print(f"    - {orig_line}")
                        print(f"    + {new_line}")
            else:
                p.write_text(new_text, encoding="utf-8")
                print(f"已更新 {n} 处: {p.relative_to(root)}")

    print("", file=sys.stderr)
    mode = "[DRY-RUN] 预计" if args.dry_run else "实际"
    print(f"{mode} 更新 {total_files_changed} 个文件，共 {total_replacements} 处替换。",
          file=sys.stderr)


if __name__ == "__main__":
    main()
