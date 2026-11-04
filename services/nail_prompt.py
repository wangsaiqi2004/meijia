"""Build the server-side prompt for nail image edits."""

from pathlib import Path

PROMPT_PATH = Path(__file__).resolve().parent.parent / "prompts" / "system-prompt.md"
MAX_PROMPT_LENGTH = 1000
FILTERED_WORDS = ("好看", "精致", "高级感", "网红", "美颜", "瘦")


def build_nail_prompt(*, mode: str, style_name: str, extra_prompt: str = "",
                      size: str = "1k", collage_selection: str = "") -> tuple[str, bool]:
    if mode not in {"preview", "promo"} or size not in {"1k", "4k"}:
        raise ValueError("生成参数无效")
    style_name = " ".join(style_name.split())[:60]
    extra_prompt = " ".join(extra_prompt.split())[:200]
    collage_selection = " ".join(collage_selection.split())[:20]
    if not style_name:
        raise ValueError("请选择款式")
    filtered = False
    for word in FILTERED_WORDS:
        if word in extra_prompt:
            extra_prompt = extra_prompt.replace(word, "")
            filtered = True
    base = PROMPT_PATH.read_text(encoding="utf-8").strip()
    user = (
        f"\n\n模式：{mode}\n顾客要求：{style_name}。{extra_prompt}\n"
        f"参考图款式序号：{collage_selection or '未指定'}\n"
        f"甲型保持：按图1原甲型\n输出尺寸：{size.upper()}"
    )
    if len(base) + len(user) > MAX_PROMPT_LENGTH:
        raise ValueError("美甲提示词超过接口长度限制")
    return base + user, filtered
