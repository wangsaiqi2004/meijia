import unittest

from services.nail_prompt import MAX_PROMPT_LENGTH, build_nail_prompt


class NailPromptTests(unittest.TestCase):
    def test_preserves_constraints_and_filters_extra_text(self):
        prompt, filtered = build_nail_prompt(
            mode="preview", style_name="奶茶猫眼", extra_prompt="美颜 瘦手，秋冬奶茶棕",
        )
        self.assertTrue(filtered)
        self.assertIn("禁止磨皮", prompt)
        self.assertIn("秋冬奶茶棕", prompt)
        self.assertNotIn("美颜", prompt)
        self.assertLessEqual(len(prompt), MAX_PROMPT_LENGTH)

    def test_invalid_parameters_rejected(self):
        for kwargs in ({"mode": "other", "style_name": "猫眼"},
                       {"mode": "preview", "style_name": " "},
                       {"mode": "preview", "style_name": "猫眼", "size": "2k"}):
            with self.assertRaises(ValueError):
                build_nail_prompt(**kwargs)

    def test_long_input_is_bounded(self):
        prompt, filtered = build_nail_prompt(
            mode="promo", style_name="猫" * 500, extra_prompt="秋" * 500,
            collage_selection="1" * 500, size="4k",
        )
        self.assertFalse(filtered)
        self.assertLessEqual(len(prompt), MAX_PROMPT_LENGTH)
        self.assertIn("输出尺寸：4K", prompt)


if __name__ == "__main__":
    unittest.main()
