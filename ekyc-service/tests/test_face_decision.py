import unittest

from app.services.face_decision import decide_face_match


class FaceDecisionTests(unittest.TestCase):
    def test_match_at_threshold(self):
        result = decide_face_match(0.30, 0.30, 0.42)
        self.assertEqual(result["decision"], "MATCH")
        self.assertTrue(result["matched"])
        self.assertNotIn("embedding", result)

    def test_review_between_thresholds(self):
        result = decide_face_match(0.36, 0.30, 0.42)
        self.assertEqual(result["decision"], "REVIEW_REQUIRED")
        self.assertFalse(result["matched"])

    def test_not_match_above_review_band(self):
        result = decide_face_match(0.50, 0.30, 0.42)
        self.assertEqual(result["decision"], "NOT_MATCH")
        self.assertFalse(result["matched"])
        self.assertEqual(result["threshold"], 0.30)

    def test_review_band_cannot_sit_below_match_threshold(self):
        result = decide_face_match(0.20, 0.30, 0.10)
        self.assertEqual(result["decision"], "MATCH")


if __name__ == "__main__":
    unittest.main()
