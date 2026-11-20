# scripts/pipeline/uploader.py
import os
import json
import time
import base64
from concurrent.futures import ThreadPoolExecutor
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type


class RateLimitError(Exception):
    pass


_HTTP_POOL = httpx.Client(
    timeout=httpx.Timeout(90.0, connect=15.0),
    limits=httpx.Limits(max_connections=32, max_keepalive_connections=20),
)


def _handle_tg_response(res: httpx.Response):
    if res.status_code == 429:
        retry_after = 5
        try:
            retry_after = int(res.json().get("parameters", {}).get("retry_after", 5))
        except Exception:
            pass
        time.sleep(min(retry_after, 30))
        raise RateLimitError(f"Telegram 429 Too Many Requests (chờ {retry_after}s)")
    res.raise_for_status()
    payload = res.json()
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram lỗi: {payload}")
    return payload["result"]


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
        res = _HTTP_POOL.post(url, data=data, files=files)

    result = _handle_tg_response(res)
    doc = result.get("document") or result.get("sticker")
    if not doc or "file_id" not in doc:
        raise RuntimeError(f"Không nhận được file_id từ Telegram: {result}")
    return doc["file_id"]


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    retry=retry_if_exception_type((RateLimitError, httpx.RequestError)),
)
def _send_telegram_media_chunk(
    chunk: list[tuple[str, str]],
    bot_token: str,
    channel_id: str,
) -> list[str]:
    if len(chunk) == 1:
        fp, cap = chunk[0]
        return [upload_to_telegram(fp, bot_token, channel_id, caption=cap)]

    url = f"https://api.telegram.org/bot{bot_token}/sendMediaGroup"
    media_payload = []
    opened_files = []
    files_dict = {}

    try:
        for idx, (fp, cap) in enumerate(chunk):
            attach_key = f"file_{idx}"
            media_payload.append(
                {
                    "type": "document",
                    "media": f"attach://{attach_key}",
                    "caption": cap[:1000],
                }
            )
            fh = open(fp, "rb")
            opened_files.append(fh)
            files_dict[attach_key] = (os.path.basename(fp), fh, "image/avif")

        data = {
            "chat_id": channel_id,
            "media": json.dumps(media_payload, ensure_ascii=False),
        }
        res = _HTTP_POOL.post(url, data=data, files=files_dict)
    finally:
        for fh in opened_files:
            try:
                fh.close()
            except Exception:
                pass

    results = _handle_tg_response(res)
    file_ids: list[str] = []
    for msg in results:
        doc = msg.get("document") or msg.get("sticker")
        if not doc or "file_id" not in doc:
            raise RuntimeError(f"Thiếu file_id trong phản hồi sendMediaGroup: {msg}")
        file_ids.append(doc["file_id"])
    return file_ids


def upload_batch_to_telegram(
    items: list[tuple[str, str]],
    bot_token: str,
    channel_id: str,
    chunk_size: int = 10,
) -> list[str]:
    all_ids: list[str] = []
    for start in range(0, len(items), chunk_size):
        chunk = items[start : start + chunk_size]
        chunk_ids = _send_telegram_media_chunk(chunk, bot_token, channel_id)
        all_ids.extend(chunk_ids)
        if start + chunk_size < len(items):
            time.sleep(0.35)
    return all_ids


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

    existing = _HTTP_POOL.get(api_url, headers=headers)
    sha = existing.json().get("sha") if existing.status_code == 200 else None
    body = {"message": f"backup: {clean_path}", "content": b64_content, "branch": "main"}
    if sha:
        body["sha"] = sha
    put_res = _HTTP_POOL.put(api_url, headers=headers, json=body)
    if put_res.status_code in (200, 201):
        return clean_path

    return ""


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.RequestError, httpx.HTTPStatusError)),
)
def _create_github_blob(
    local_path: str,
    clean_repo_path: str,
    gh_repo: str,
    headers: dict,
) -> tuple[str, str]:
    with open(local_path, "rb") as f:
        b64_content = base64.b64encode(f.read()).decode("utf-8")
    blob_url = f"https://api.github.com/repos/{gh_repo}/git/blobs"
    res = _HTTP_POOL.post(blob_url, headers=headers, json={"content": b64_content, "encoding": "base64"})
    res.raise_for_status()
    return clean_repo_path, res.json()["sha"]


def upload_batch_to_github_backup(
    files: list[tuple[str, str]],
    gh_repo: str,
    gh_token: str,
    commit_message: str = "backup: batch chapter pages",
) -> dict[str, str]:
    if not files or not gh_repo or not gh_token:
        return {}

    headers = {
        "Authorization": f"Bearer {gh_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    base_api = f"https://api.github.com/repos/{gh_repo}"

    try:
        ref_res = _HTTP_POOL.get(f"{base_api}/git/ref/heads/main", headers=headers)
        ref_res.raise_for_status()
        latest_commit_sha = ref_res.json()["object"]["sha"]

        commit_res = _HTTP_POOL.get(f"{base_api}/git/commits/{latest_commit_sha}", headers=headers)
        commit_res.raise_for_status()
        base_tree_sha = commit_res.json()["tree"]["sha"]

        clean_items = [(lp, rp.lstrip("/")) for lp, rp in files]
        tree_entries = []
        uploaded_map: dict[str, str] = {}

        with ThreadPoolExecutor(max_workers=12) as pool:
            futures = [
                pool.submit(_create_github_blob, lp, rp, gh_repo, headers)
                for lp, rp in clean_items
            ]
            for fut in futures:
                clean_rp, blob_sha = fut.result()
                tree_entries.append(
                    {"path": clean_rp, "mode": "100644", "type": "blob", "sha": blob_sha}
                )
                uploaded_map[clean_rp] = clean_rp

        tree_res = _HTTP_POOL.post(
            f"{base_api}/git/trees",
            headers=headers,
            json={"base_tree": base_tree_sha, "tree": tree_entries},
        )
        tree_res.raise_for_status()
        new_tree_sha = tree_res.json()["sha"]

        new_commit_res = _HTTP_POOL.post(
            f"{base_api}/git/commits",
            headers=headers,
            json={
                "message": commit_message,
                "tree": new_tree_sha,
                "parents": [latest_commit_sha],
            },
        )
        new_commit_res.raise_for_status()
        new_commit_sha = new_commit_res.json()["sha"]

        patch_res = _HTTP_POOL.patch(
            f"{base_api}/git/refs/heads/main",
            headers=headers,
            json={"sha": new_commit_sha},
        )
        patch_res.raise_for_status()

        return uploaded_map
    except Exception as e:
        print(f"[Cảnh báo GitHub Backup Batch] {e}")
        return {}
