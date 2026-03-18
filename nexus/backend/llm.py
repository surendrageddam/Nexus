import os
from openai import OpenAI
import json
import re
from dotenv import load_dotenv, dotenv_values

load_dotenv()

def make_client() -> OpenAI:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY not set")
    return OpenAI(
        api_key=api_key,
        base_url="https://api.deepseek.com",
        timeout=30,
    )


def chat(client: OpenAI, system: str, user: str, temperature: float = 0.3) -> str:
    resp = client.chat.completions.create(
        model="deepseek-chat",
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=temperature,
        max_tokens=1024,
    )
    return resp.choices[0].message.content.strip()


def chat_json(client: OpenAI, system: str, user: str, temperature: float = 0.2) -> dict:
    """Call DeepSeek and parse JSON response reliably."""
    system_with_json = system + "\n\nYou MUST respond with valid JSON only. No markdown, no explanation, no code fences. Raw JSON object."
    raw = chat(client, system_with_json, user, temperature)
    # Strip any accidental markdown fences
    raw = re.sub(r"```json|```", "", raw).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Best-effort: find first { ... } block
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise ValueError(f"Could not parse JSON from LLM response: {raw[:300]}")
