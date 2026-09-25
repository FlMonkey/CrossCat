import base64
import io
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import main


class ClassificationTests(unittest.TestCase):
    def test_project_env_key_is_loaded_without_export(self):
        with tempfile.TemporaryDirectory() as temp:
            Path(temp, ".env").write_text('OPENAI_API_KEY="local-test-key"\n')
            with patch.object(main, "ROOT", Path(temp)), patch.dict(main.os.environ, {}, clear=True):
                self.assertEqual(main.get_api_key(), "local-test-key")

    def test_product_uses_image_and_description_and_keeps_sparse_scores(self):
        captured = {}

        def valid_call(instructions, content, name, choices):
            captured["content"] = content
            return {"garment_type": "bottoms.pants.jeans.straight", "scores": [
                {"attribute": "colors.blue", "score": 0.9},
                {"attribute": "pants_specific.ripped", "score": 0},
            ]}

        with patch.object(main, "call_openai", side_effect=valid_call):
            taxonomy, scores = main.classify_product("Blue jeans", "Cotton denim", "image/png", b"image")
        self.assertEqual(taxonomy, "bottoms.pants.jeans.straight")
        self.assertEqual(scores, {"colors.blue": 0.9})
        self.assertIn("Blue jeans", captured["content"][0]["text"])
        self.assertIn("Cotton denim", captured["content"][0]["text"])
        self.assertEqual(captured["content"][1]["type"], "input_image")

    def test_query_can_exclude_an_attribute(self):
        with patch.object(main, "call_openai", return_value={
            "garment_type": "bottoms.pants", "scores": [
                {"attribute": "colors.blue", "score": -1},
                {"attribute": "fit.relaxed", "score": 0.8},
            ]}):
            garment_type, scores = main.classify_query("relaxed pants, not blue")
        self.assertEqual(garment_type, "bottoms.pants")
        self.assertEqual(scores, {"colors.blue": -1.0, "fit.relaxed": 0.8})

    def test_type_gate_and_signed_ranking(self):
        products = [
            {"name": "Blue jeans", "taxonomy": "bottoms.pants.jeans.straight", "scores": {"fit.relaxed": 0.8, "colors.blue": 1}},
            {"name": "Black jeans", "taxonomy": "bottoms.pants.jeans.straight", "scores": {"fit.relaxed": 0.8}},
            {"name": "Blue shirt", "taxonomy": "tops.shirts.button_up", "scores": {"fit.relaxed": 0.8}},
        ]
        prefs = {"fit.relaxed": 0.8, "colors.blue": -1}
        ranked = [main.rank_product(item, "bottoms.pants", prefs) for item in products]
        self.assertGreater(ranked[1]["match_score"], ranked[0]["match_score"])
        self.assertIsNone(ranked[2])
        self.assertEqual(ranked[1]["match_score"], round((0.8 * 0.8 + 1) / 1.8, 4))
        self.assertEqual(ranked[0]["conflicts"][0]["attribute"], "colors.blue")

    def test_invalid_scores_and_image_are_rejected(self):
        with self.assertRaises(main.APIError):
            main.clean_scores([{"attribute": "colors.blue", "score": -0.2}])
        with self.assertRaises(main.APIError):
            main.clean_scores([{"attribute": "made_up", "score": 0.8}], negative=True)
        with self.assertRaises(main.APIError):
            main.parse_image("data:image/png;base64," + base64.b64encode(b"not a png").decode())

    def test_responses_api_request_is_structured_and_server_side(self):
        seen = {}

        def fake_urlopen(request, timeout):
            seen["url"] = request.full_url
            seen["payload"] = json.loads(request.data)
            seen["timeout"] = timeout
            return io.BytesIO(json.dumps({"status": "completed", "output": [{
                "type": "message", "content": [{"type": "output_text", "text":
                json.dumps({"garment_type": "", "scores": []})}]}]}).encode())

        with patch.dict(main.os.environ, {"OPENAI_API_KEY": "test-only-key"}), \
             patch.object(main.urllib.request, "urlopen", side_effect=fake_urlopen):
            result = main.call_openai("Parse query", [{"type": "input_text", "text": "blue coat"}],
                                      "search_query", ["", "outerwear"])
        self.assertEqual(result["scores"], [])
        self.assertEqual(seen["url"], "https://api.openai.com/v1/responses")
        self.assertEqual(seen["payload"]["text"]["format"]["type"], "json_schema")
        self.assertFalse(seen["payload"]["store"])


if __name__ == "__main__":
    unittest.main()
