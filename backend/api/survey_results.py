"""Pulse survey scoring: engagement, eNPS, per-question distributions and department comparisons.

Anonymity: aggregates are only reported for groups of MIN_GROUP or more responses.
"""

from __future__ import annotations

from typing import Any

MIN_GROUP = 5


def _emoji_values(answers: dict[str, Any], emoji_ids: list[str]) -> list[int]:
    out = []
    for qid in emoji_ids:
        v = answers.get(qid)
        if isinstance(v, (int, float)) and 1 <= v <= 5:
            out.append(int(v))
    return out


def engagement_of(responses: list[dict[str, Any]], emoji_ids: list[str]) -> int:
    """Mean favourability of all emoji answers on a 0–100 scale (1 → 0, 5 → 100)."""
    vals = [v for r in responses for v in _emoji_values(r, emoji_ids)]
    return round(sum((v - 1) / 4 * 100 for v in vals) / len(vals)) if vals else 0


def nps_split(responses: list[dict[str, Any]], nps_id: str | None) -> dict[str, int]:
    scores = [int(r[nps_id]) for r in responses if nps_id and isinstance(r.get(nps_id), (int, float))]
    n = len(scores)
    if not n:
        return {"promoters": 0, "passives": 0, "detractors": 0, "enps": 0, "n": 0}
    p = round(100 * sum(1 for s in scores if s >= 9) / n)
    d = round(100 * sum(1 for s in scores if s <= 6) / n)
    return {"promoters": p, "passives": max(0, 100 - p - d), "detractors": d, "enps": p - d, "n": n}


def headline(questions: list[dict[str, Any]], answers: list[dict[str, Any]]) -> tuple[int, int]:
    emoji_ids = [q["id"] for q in questions if q.get("type") == "emoji"]
    nps_id = next((q["id"] for q in questions if q.get("type") == "nps"), None)
    return engagement_of(answers, emoji_ids), nps_split(answers, nps_id)["enps"]


def _sentiment(answers: dict[str, Any], emoji_ids: list[str], nps_id: str | None) -> str:
    vals = _emoji_values(answers, emoji_ids)
    if vals:
        mean = sum(vals) / len(vals)
        return "Positive" if mean >= 3.8 else "Constructive" if mean <= 2.8 else "Neutral"
    nps = answers.get(nps_id) if nps_id else None
    if isinstance(nps, (int, float)):
        return "Positive" if nps >= 9 else "Constructive" if nps <= 6 else "Neutral"
    return "Neutral"


def compute(survey: dict[str, Any], rows: list[dict[str, Any]], departments: dict[str, str]) -> dict[str, Any]:
    """rows: [{answers, department_id}] — never who answered."""
    questions: list[dict[str, Any]] = survey.get("questions") or []
    answers = [r["answers"] or {} for r in rows]
    n = len(rows)
    emoji_ids = [q["id"] for q in questions if q.get("type") == "emoji"]
    nps_id = next((q["id"] for q in questions if q.get("type") == "nps"), None)
    suppressed = survey.get("anonymous", True) and n < MIN_GROUP

    base = {
        "surveyId": survey["id"],
        "responses": n,
        "audience": survey.get("audience", 0),
        "anonymous": survey.get("anonymous", True),
        "minGroup": MIN_GROUP,
        "suppressed": suppressed,
    }
    if suppressed:
        return {**base, "engagement": None, "enps": None, "nps": None, "questions": [], "departments": [], "hiddenDepartments": 0, "comments": []}

    per_question = []
    for q in questions:
        vals = [a.get(q["id"]) for a in answers if a.get(q["id"]) not in (None, "")]
        item: dict[str, Any] = {"id": q["id"], "type": q["type"], "text": q.get("text") or q.get("prompt") or "", "answered": len(vals)}
        if q["type"] == "emoji":
            counts = [sum(1 for v in vals if v == i) for i in range(1, 6)]
            item["counts"] = counts
            item["pct"] = [round(100 * c / len(vals)) if vals else 0 for c in counts]
            item["favourable"] = round(100 * (counts[3] + counts[4]) / len(vals)) if vals else 0
        elif q["type"] == "nps":
            counts = [sum(1 for v in vals if v == i) for i in range(0, 11)]
            item["counts"] = counts
            item.update({k: v for k, v in nps_split(answers, q["id"]).items() if k != "n"})
        elif q["type"] == "choice":
            opts = q.get("options") or []
            item["options"] = [{"label": o, "count": sum(1 for v in vals if v == o), "pct": round(100 * sum(1 for v in vals if v == o) / len(vals)) if vals else 0} for o in opts]
        per_question.append(item)

    # Department comparison: only departments with MIN_GROUP+ responses are shown.
    by_dept: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_dept.setdefault(r.get("department_id") or "", []).append(r["answers"] or {})
    shown_depts = []
    hidden = 0
    for dept_id, group in by_dept.items():
        if len(group) < MIN_GROUP or not dept_id:
            hidden += 1
            continue
        shown_depts.append({"departmentId": dept_id, "name": departments.get(dept_id, "Unknown"), "responses": len(group), "engagement": engagement_of(group, emoji_ids), "enps": nps_split(group, nps_id)["enps"]})
    shown_depts.sort(key=lambda d: -d["engagement"])
    visible = {d["departmentId"] for d in shown_depts}

    comments = []
    text_ids = [q["id"] for q in questions if q.get("type") == "text"]
    for r in rows:
        a = r["answers"] or {}
        for qid in text_ids:
            t = a.get(qid)
            if isinstance(t, str) and t.strip():
                dept = r.get("department_id")
                comments.append({"text": t.strip(), "sentiment": _sentiment(a, emoji_ids, nps_id), "department": departments.get(dept) if dept in visible else None})
    # Stable, non-chronological order so comments can't be matched to submission times.
    comments.sort(key=lambda c: (hash_str(c["text"]),))

    return {
        **base,
        "engagement": engagement_of(answers, emoji_ids),
        "enps": nps_split(answers, nps_id)["enps"],
        "nps": nps_split(answers, nps_id) if nps_id else None,
        "questions": per_question,
        "departments": shown_depts,
        "hiddenDepartments": hidden,
        "comments": comments,
    }


def hash_str(s: str) -> int:
    h = 2166136261
    for ch in s:
        h = ((h ^ ord(ch)) * 16777619) & 0xFFFFFFFF
    return h
