import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.core.internal_auth import require_internal_token


class InternalAuthTests(unittest.TestCase):
    def test_missing_configuration_is_unavailable(self):
        with patch("app.core.internal_auth.settings") as settings:
            settings.EKYC_INTERNAL_TOKEN = ""
            with self.assertRaises(HTTPException) as caught:
                require_internal_token("anything")
            self.assertEqual(caught.exception.status_code, 503)

    def test_wrong_token_is_rejected(self):
        with patch("app.core.internal_auth.settings") as settings:
            settings.EKYC_INTERNAL_TOKEN = "expected-token"
            with self.assertRaises(HTTPException) as caught:
                require_internal_token("other-token")
            self.assertEqual(caught.exception.status_code, 401)

    def test_matching_token_passes(self):
        with patch("app.core.internal_auth.settings") as settings:
            settings.EKYC_INTERNAL_TOKEN = "expected-token"
            self.assertIsNone(require_internal_token("expected-token"))


if __name__ == "__main__":
    unittest.main()
