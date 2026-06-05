"""Smoke test for the file-validation auto-repair path.

Exercises validate_subtask_files() + repair_subtask_files() end-to-end against
a temp project + spec directory, without needing the Electron app running.

Run from apps/backend/ with the venv active:
    .venv/Scripts/python -m test_repair_smoke
"""

import json
import shutil
import sys
import tempfile
from pathlib import Path

# Make backend importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from agents.coder import repair_subtask_files, validate_subtask_files  # noqa: E402


def _green(s: str) -> str:
    return f"\033[32m{s}\033[0m"


def _red(s: str) -> str:
    return f"\033[31m{s}\033[0m"


def _expect(cond: bool, label: str) -> bool:
    if cond:
        print(f"  {_green('PASS')}  {label}")
        return True
    print(f"  {_red('FAIL')}  {label}")
    return False


def main() -> int:
    tmp = Path(tempfile.mkdtemp(prefix="ac-repair-smoke-"))
    try:
        project_dir = tmp / "project"
        spec_dir = tmp / "spec"
        project_dir.mkdir()
        spec_dir.mkdir()

        # An existing source file the planner correctly references for modification
        existing = project_dir / "src" / "models.py"
        existing.parent.mkdir(parents=True)
        existing.write_text("# real existing module\n", encoding="utf-8")

        # The subtask the way the planner would emit it when it mis-categorizes
        # a not-yet-existing knowledge-base markdown as files_to_modify.
        subtask = {
            "id": "subtask-1-1",
            "description": "Add fund-terms documentation alongside model changes",
            "service": "docs",
            "status": "pending",
            "files_to_modify": [
                "src/models.py",
                "docs/fund_terms_fees.md",
                "docs/tax_considerations.md",
            ],
            "files_to_create": [],
        }

        plan = {
            "feature": "smoke",
            "workflow_type": "feature",
            "phases": [
                {
                    "id": "phase-1",
                    "phase": 1,
                    "name": "Phase 1",
                    "subtasks": [subtask],
                }
            ],
        }
        plan_file = spec_dir / "implementation_plan.json"
        plan_file.write_text(json.dumps(plan, indent=2), encoding="utf-8")

        all_ok = True

        print("\n[1] validate_subtask_files() should fail with the two missing docs")
        result = validate_subtask_files(subtask, project_dir)
        all_ok &= _expect(result["success"] is False, "validation reports failure")
        all_ok &= _expect(
            sorted(result["missing_files"])
            == ["docs/fund_terms_fees.md", "docs/tax_considerations.md"],
            "missing_files lists exactly the two non-existent docs",
        )
        all_ok &= _expect(
            result.get("invalid_paths") == [],
            "no invalid_paths (paths stay inside project)",
        )

        print("\n[2] repair_subtask_files() should reclassify and persist")
        repair = repair_subtask_files(subtask, result["missing_files"], spec_dir)
        all_ok &= _expect(repair["repaired"] is True, "repair flag set")
        all_ok &= _expect(repair["persisted"] is True, "plan persisted to disk")
        all_ok &= _expect(repair["error"] is None, "no persistence error")
        all_ok &= _expect(
            sorted(repair["moved"])
            == ["docs/fund_terms_fees.md", "docs/tax_considerations.md"],
            "moved list reports both docs",
        )

        print("\n[3] In-memory subtask should reflect the move")
        all_ok &= _expect(
            subtask["files_to_modify"] == ["src/models.py"],
            "files_to_modify only retains the actually-existing path",
        )
        all_ok &= _expect(
            sorted(subtask["files_to_create"])
            == ["docs/fund_terms_fees.md", "docs/tax_considerations.md"],
            "files_to_create gained both docs",
        )

        print("\n[4] On-disk plan should reflect the move (atomic write succeeded)")
        with open(plan_file, encoding="utf-8") as f:
            persisted = json.load(f)
        persisted_subtask = persisted["phases"][0]["subtasks"][0]
        all_ok &= _expect(
            persisted_subtask["files_to_modify"] == ["src/models.py"],
            "persisted files_to_modify matches in-memory state",
        )
        all_ok &= _expect(
            sorted(persisted_subtask["files_to_create"])
            == ["docs/fund_terms_fees.md", "docs/tax_considerations.md"],
            "persisted files_to_create matches in-memory state",
        )

        print("\n[5] Re-validation after repair should succeed")
        result2 = validate_subtask_files(subtask, project_dir)
        all_ok &= _expect(result2["success"] is True, "validation passes")
        all_ok &= _expect(
            result2["missing_files"] == [],
            "missing_files now empty",
        )

        print("\n[6] No-op repair (no missing files) should be a clean no-op")
        clean_subtask = {
            "id": "subtask-2-1",
            "files_to_modify": ["src/models.py"],
            "files_to_create": [],
        }
        noop = repair_subtask_files(clean_subtask, [], spec_dir)
        all_ok &= _expect(noop["repaired"] is False, "repaired flag false on no-op")
        all_ok &= _expect(noop["moved"] == [], "moved list empty on no-op")

        print()
        if all_ok:
            print(_green("ALL SMOKE TESTS PASSED"))
            return 0
        print(_red("ONE OR MORE SMOKE TESTS FAILED"))
        return 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
