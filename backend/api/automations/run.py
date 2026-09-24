"""Run automations from the command line.

    python -m api.automations.run --once [--workspace ID|SLUG] [--rule KEY] [--dry-run] [--force]

--once     one scheduler pass (rules that are due now), then exit
--force    ignore the schedule and run every enabled rule now
--dry-run  show who would be notified without sending or recording anything
"""

from __future__ import annotations

import argparse
import json
import logging
import sys

from ..db import pool
from .engine import run_pass
from .rules import RULES


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m api.automations.run", description="Run Annex HR automations once.")
    ap.add_argument("--once", action="store_true", help="run a single pass and exit (required)")
    ap.add_argument("--workspace", help="workspace id or slug (default: all)")
    ap.add_argument("--rule", choices=sorted(RULES), help="only this rule")
    ap.add_argument("--dry-run", action="store_true", help="preview only — nothing is sent or recorded")
    ap.add_argument("--force", action="store_true", help="ignore schedules; run every enabled rule now")
    ap.add_argument("--json", action="store_true", help="print results as JSON")
    args = ap.parse_args(argv)
    if not args.once:
        ap.error("pass --once (the continuous scheduler runs inside the API)")
    logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
    pool.open()
    try:
        results = run_pass(workspace=args.workspace, rule=args.rule, dry_run=args.dry_run, force=args.force, trigger="cli")
    finally:
        pool.close()
    if args.json:
        print(json.dumps(results, indent=2, default=str))
        return 0
    for r in results:
        head = f"{'[dry run] ' if r['dryRun'] else ''}{r['workspace']}/{r['rule']}: {len(r['reminders'])} new reminder(s), {r['alreadySent']} already sent"
        print(head)
        for x in r["reminders"]:
            print(f"   - {x['summary']} → {', '.join(x['recipients']) or 'nobody'}")
        if r["emails"]:
            verb = "would email" if r["dryRun"] else "emailed"
            skipped = f"  (not sent: {r['emailSkipped']})" if r["emailSkipped"] else ""
            print(f"   {verb} {len(r['emails'])}: {', '.join(e['to'] for e in r['emails'][:8])}{' …' if len(r['emails']) > 8 else ''}{skipped}")
    if not results:
        print("Nothing due.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
