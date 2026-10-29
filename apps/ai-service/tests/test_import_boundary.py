"""Enforce D15 mechanically: the provider SDK exists in exactly one module.

A convention that only lives in a document rots. This test makes the boundary a
build failure instead.
"""

import ast
from pathlib import Path

SRC = Path(__file__).resolve().parents[1] / "src" / "ai_service"
PROVIDER_SDK = "openai"


def _imported_roots(path: Path) -> set[str]:
    """Top-level module names imported by a file (absolute imports only)."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    roots: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            roots.add(node.module.split(".")[0])
    return roots


def test_only_llm_module_imports_the_provider_sdk() -> None:
    offenders = sorted(
        str(path.relative_to(SRC))
        for path in SRC.rglob("*.py")
        if path.name != "llm.py" and PROVIDER_SDK in _imported_roots(path)
    )

    assert offenders == [], f"{PROVIDER_SDK} must stay inside llm.py, found: {offenders}"


def test_boundary_module_really_wraps_the_sdk() -> None:
    # Guards against a vacuous pass if llm.py is ever split or renamed.
    assert PROVIDER_SDK in _imported_roots(SRC / "llm.py")
