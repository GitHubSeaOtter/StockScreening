"""自然言語のスクリーニング条件を JSON 条件リストに変換する(任意機能)。

model-routing 方針:
  スクリーニング本体は決定論的計算のため LLM を使わない(コストゼロ)。
  自然言語→構造化 JSON の変換のみ、品質要件を満たす最安モデル
  claude-haiku-4-5 を構造化出力(json_schema)付きで使用する。

API キーはローカルの config/settings.json に保存し、Git にはコミットしない。
キー未設定でもアプリ本体(手動での条件指定)は全機能動作する。
"""
from __future__ import annotations

import json
from pathlib import Path

CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "settings.json"

MODEL = "claude-haiku-4-5"

CONDITIONS_SCHEMA = {
    "type": "object",
    "properties": {
        "conditions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "consecutive_monthly_gain",
                            "rise_from_recent_low",
                            "period_return",
                            "price_range",
                            "min_avg_volume",
                        ],
                    },
                    "months": {"type": ["integer", "null"]},
                    "min_pct": {"type": ["number", "null"]},
                    "lookback_months": {"type": ["integer", "null"]},
                    "period": {
                        "type": ["string", "null"],
                        "enum": ["3m", "1m", "1w", None],
                    },
                    "op": {"type": ["string", "null"], "enum": [">=", "<=", None]},
                    "pct": {"type": ["number", "null"]},
                    "min": {"type": ["number", "null"]},
                    "max": {"type": ["number", "null"]},
                    "days": {"type": ["integer", "null"]},
                    "min_volume": {"type": ["number", "null"]},
                },
                "required": ["type"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["conditions"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """あなたは株式スクリーニング条件のパーサーです。
日本語の条件文を、指定スキーマの JSON 条件リストに変換してください。

条件タイプの意味:
- consecutive_monthly_gain: N ヶ月連続で毎月 min_pct% 以上上昇(months, min_pct)
- rise_from_recent_low: 直近 lookback_months ヶ月以内の安値から min_pct% 以上上昇
- period_return: 期間 period(3m/1m/1w)の騰落率が op(>= / <=)pct %
- price_range: 株価が min〜max 円のレンジ内
- min_avg_volume: 直近 days 日の平均出来高が min_volume 以上

各条件で使わないフィールドは含めないか null にしてください。
解釈できない要素は無視し、確実に読み取れた条件のみ出力してください。"""


def load_settings() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
    return {}


def save_api_key(api_key: str) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    settings = load_settings()
    settings["anthropic_api_key"] = api_key
    CONFIG_PATH.write_text(
        json.dumps(settings, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def has_api_key() -> bool:
    return bool(load_settings().get("anthropic_api_key"))


def parse_natural_language(text: str) -> list[dict]:
    """自然言語の条件文を条件 JSON リストへ変換する。API キー必須。"""
    settings = load_settings()
    api_key = settings.get("anthropic_api_key")
    if not api_key:
        raise RuntimeError("APIキーが設定されていません(設定画面から保存してください)")

    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        output_config={"format": {"type": "json_schema", "schema": CONDITIONS_SCHEMA}},
        messages=[{"role": "user", "content": text}],
    )
    raw = next(b.text for b in response.content if b.type == "text")
    data = json.loads(raw)
    conditions = data.get("conditions", [])
    # null のフィールドを取り除く
    return [{k: v for k, v in c.items() if v is not None} for c in conditions]
