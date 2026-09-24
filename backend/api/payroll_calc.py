"""Kenyan statutory deductions (2026)."""

from __future__ import annotations

import math

PAYE_BANDS: list[tuple[float, float]] = [
    (24_000, 0.1),
    (8_333, 0.25),
    (467_667, 0.3),
    (300_000, 0.325),
    (math.inf, 0.35),
]
PERSONAL_RELIEF = 2_400


def js_round(x: float) -> int:
    """JavaScript Math.round (half up), not Python's banker's rounding."""
    return int(math.floor(x + 0.5))


def statutory(gross: float) -> dict[str, int]:
    nssf = min(gross * 0.06, 4_320)
    shif = max(gross * 0.0275, 300)
    housing_levy = gross * 0.015
    # NSSF, SHIF and the Affordable Housing Levy are deductible before PAYE.
    taxable = max(0, gross - nssf - shif - housing_levy)
    paye = 0.0
    for width, rate in PAYE_BANDS:
        slice_ = min(taxable, width)
        paye += slice_ * rate
        taxable -= slice_
        if taxable <= 0:
            break
    paye = max(0, paye - PERSONAL_RELIEF)
    return {
        "paye": js_round(paye),
        "nssf": js_round(nssf),
        "shif": js_round(shif),
        "housingLevy": js_round(housing_levy),
        "net": js_round(gross - paye - nssf - shif - housing_levy),
    }


NSSF_TIER1_LIMIT = 8_000
WHT_RATE = 0.05


def _round_to(x: float, step: int) -> int:
    return js_round(x / step) * step


def payslip(package: float, bonus: float = 0) -> dict[str, int]:
    """Splits the monthly package into basic + allowances (as the payslip shows it) and applies statutory deductions."""
    airtime = 5_000 if package >= 300_000 else 2_000
    transport = _round_to(package * 0.08, 500)
    house = _round_to(package * 0.15, 500)
    basic = js_round(package) - house - transport - airtime
    gross = js_round(package + bonus)
    s = statutory(gross)
    tier1 = js_round(min(gross, NSSF_TIER1_LIMIT) * 0.06)
    return {
        "basic": basic,
        "house": house,
        "transport": transport,
        "airtime": airtime,
        "allowances": house + transport + airtime,
        "bonus": js_round(bonus),
        "gross": gross,
        "nssfTier1": min(tier1, s["nssf"]),
        "nssfTier2": max(0, s["nssf"] - tier1),
        "nssf": s["nssf"],
        "shif": s["shif"],
        "housingLevy": s["housingLevy"],
        "taxable": max(0, gross - s["nssf"] - s["shif"] - s["housingLevy"]),
        "paye": s["paye"],
        "totalDeductions": s["paye"] + s["nssf"] + s["shif"] + s["housingLevy"],
        "net": gross - (s["paye"] + s["nssf"] + s["shif"] + s["housingLevy"]),
    }


def withholding(gross: float) -> int:
    """5% withholding tax on consultants' professional fees."""
    return js_round(gross * WHT_RATE)
