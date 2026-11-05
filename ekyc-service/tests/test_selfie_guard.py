import unittest
from unittest.mock import patch

import numpy as np

from app.services.face_service import assert_not_large_selfie


class SelfieGuardTests(unittest.TestCase):
    def test_allows_image_when_no_face_is_found(self):
        image = np.zeros((120, 180, 3), dtype=np.uint8)
        with patch("app.services.face_service.analyze_face_frame", side_effect=ValueError("no face")):
            assert_not_large_selfie(image, "ảnh mặt sau CCCD")

    def test_rejects_a_close_up_face_used_as_id_card(self):
        image = np.zeros((100, 100, 3), dtype=np.uint8)
        with patch(
            "app.services.face_service.analyze_face_frame",
            return_value={"facial_area": [0, 0, 80, 80]},
        ):
            with self.assertRaises(ValueError) as caught:
                assert_not_large_selfie(image, "ảnh mặt sau CCCD")
        self.assertIn("khuôn mặt", str(caught.exception).lower())

    def test_allows_a_small_portrait_inside_a_card(self):
        image = np.zeros((400, 640, 3), dtype=np.uint8)
        with patch(
            "app.services.face_service.analyze_face_frame",
            return_value={"facial_area": [20, 20, 80, 90]},
        ):
            assert_not_large_selfie(image, "ảnh mặt trước CCCD")


if __name__ == "__main__":
    unittest.main()
