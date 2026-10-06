"""Map a cosine distance to a technical face-match decision.

The result supports admin review. It is not a legal identity conclusion.
"""

from __future__ import annotations


def decide_face_match(
    distance: float,
    match_threshold: float,
    review_threshold: float,
) -> dict[str, float | bool | str]:
    distance_value = round(float(distance), 6)
    match_value = float(match_threshold)
    review_value = float(review_threshold)
    if review_value < match_value:
        review_value = match_value

    if distance_value <= match_value:
        decision = "MATCH"
        matched = True
    elif distance_value <= review_value:
        decision = "REVIEW_REQUIRED"
        matched = False
    else:
        decision = "NOT_MATCH"
        matched = False

    return {
        "matched": matched,
        "distance": distance_value,
        "threshold": match_value,
        "decision": decision,
    }
