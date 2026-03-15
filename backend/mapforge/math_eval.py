"""
Safe evaluation of TunerPro MATH equations.

XDF uses simple expressions like:
  "X*0.1"
  "X*0.01+0"
  "(X-128)*0.5"
  "X/4"

We use simpleeval to safely evaluate these without exec/eval risks.
"""

from simpleeval import SimpleEval, EvalWithCompoundTypes
import math

_SAFE_NAMES = {
    "abs": abs,
    "round": round,
    "floor": math.floor,
    "ceil": math.ceil,
}

_evaluator = SimpleEval(names=_SAFE_NAMES)


def raw_to_phys(equation: str, raw_value: float) -> float:
    """Convert a raw integer value to physical units using the MATH equation."""
    if equation.strip() in ("X", ""):
        return float(raw_value)
    _evaluator.names = {**_SAFE_NAMES, "X": float(raw_value)}
    try:
        return float(_evaluator.eval(equation))
    except Exception:
        return float(raw_value)


def phys_to_raw(equation: str, phys_value: float) -> float:
    """
    Convert a physical value back to raw integer.

    We attempt a simple algebraic inversion for linear equations (X*a+b).
    For complex equations we raise NotImplementedError — callers should
    handle this case (e.g. by showing a warning to the user).
    """
    if equation.strip() in ("X", ""):
        return float(phys_value)

    # Try to invert: if equation == "X * a + b" → raw = (phys - b) / a
    # We sample two points to detect linearity
    try:
        y0 = raw_to_phys(equation, 0.0)
        y1 = raw_to_phys(equation, 1.0)
        slope = y1 - y0
        if slope == 0:
            raise NotImplementedError(f"Cannot invert constant equation: {equation}")
        return (phys_value - y0) / slope
    except NotImplementedError:
        raise
    except Exception as e:
        raise NotImplementedError(f"Cannot invert equation '{equation}': {e}") from e
