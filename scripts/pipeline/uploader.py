import os
import base64
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


class RateLimitError(Exception):
    pass


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    retry=retry_if_exception_type((RateLimitError, httpx.RequestError)),
)
def upload_to_telegram(file_path: str, bot_token: str, channel_id: str, caption: str = "") -> str:
    url = f"https://api.telegram.org/bot{bot_token}/sendDocument"
    filename = os.path.basename(file_path)

    with open(file_path, "rb") as f:
        files = {"document": (filename, f, "image/avif")}
        data = {"chat_id": channel_id, "caption": caption[:1000]}
        with httpx.Client(timeout=45.0) as client:
            res = client.post(url, data=data, files=files)

    if res.status_code == 429:
        raise RateLimitError("Telegram API giới hạn tốc độ, đang chờ thử lại...")

    res.raise_for_status()
    payload = res.json()
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram lỗi: {payload}")

    doc = payload["result"].get("document") or payload["result"].get("sticker")
    if not doc or "file_id" not in doc:
        raise RuntimeError(f"Không nhận được file_id từ Telegram: {payload}")

    return doc["file_id"]


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(httpx.RequestError),
)
def upload_to_github_backup(
    file_path: str,
    repo_path: str,
    gh_repo: str,
    gh_token: str,
) -> str:
    if not gh_repo or not gh_token:
        return ""

    clean_path = repo_path.lstrip("/")
    api_url = f"https://api.github.com/repos/{gh_repo}/contents/{clean_path}"
    headers = {
        "Authorization": f"Bearer {gh_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    with open(file_path, "rb") as f:
        b64_content = base64.b64encode(f.read()).decode("utf-8")

    with httpx.Client(timeout=30.0) as client:
        existing = client.get(api_url, headers=headers)
        sha = existing.json().get("sha") if existing.status_code == 200 else None

        body = {
            "message": f"backup: {clean_path}",
            "content": b64_content,
            "branch": "main",
        }
        if sha:
            body["sha"] = sha

        put_res = client.put(api_url, headers=headers, json=body)
        if put_res.status_code in (200, 201):
            return clean_path

    return ""
