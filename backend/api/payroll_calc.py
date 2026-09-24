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
