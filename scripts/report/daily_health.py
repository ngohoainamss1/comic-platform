import os
import time
from datetime import datetime, timezone, timedelta
import httpx
import libsql_client
from dotenv import load_dotenv

load_dotenv()

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").replace("libsql://", "https://")
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "")
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN", "")
TG_ADMIN_ID = os.getenv("TG_ADMIN_CHAT_ID", "")
MIRROR_GIST_URL = os.getenv("VITE_MIRROR_GIST_URL", "")


def run_daily_report():
    db = libsql_client.create_client_sync(url=TURSO_URL, auth_token=TURSO_TOKEN)
    try:
        stats = db.execute(
            "SELECT COUNT(*), COALESCE(SUM(views_day), 0), COALESCE(SUM(views_total), 0) FROM comics"
        ).rows[0]
        total_comics, views_day, views_total = int(stats[0]), int(stats[1]), int(stats[2])
        chaps_today = db.execute("SELECT COUNT(*) FROM chapters WHERE created_at >= datetime('now', '-1 day')").rows[0][0]

        mirror_lines = []
        if MIRROR_GIST_URL:
            try:
                with httpx.Client(timeout=10.0) as client:
                    gist_data = client.get(MIRROR_GIST_URL).json()
                    for m_url in gist_data.get("mirrors", []):
                        t0 = time.perf_counter()
                        try:
                            r = client.get(m_url, timeout=5.0)
                            ms = int((time.perf_counter() - t0) * 1000)
                            mirror_lines.append(f"{'✅' if r.status_code < 400 else '⚠️'} {m_url} ({ms}ms)")
                        except Exception:
                            mirror_lines.append(f"❌ {m_url} (Bị chặn / Timeout)")
            except Exception as e:
                mirror_lines.append(f"⚠️ Không đọc được Gist: {e}")

        now_vn = datetime.now(timezone(timedelta(hours=7)))
        tomorrow_vn = now_vn + timedelta(days=1)
        reset_notes = ["ngày"]
        db.execute("UPDATE comics SET views_day = 0")
        if tomorrow_vn.weekday() == 0:
            db.execute("UPDATE comics SET views_week = 0")
            reset_notes.append("tuần")
        if tomorrow_vn.day == 1:
            db.execute("UPDATE comics SET views_month = 0")
            reset_notes.append("tháng")

        report = (
            f"<b>📊 BÁO CÁO HỆ THỐNG VINAREADER (23:00)</b>\n"
            f"• Tổng số bộ truyện: <b>{total_comics}</b>\n"
            f"• Chương đăng 24h qua: <b>+{chaps_today}</b>\n"
            f"• Lượt đọc hôm nay: <b>{views_day:,}</b> (Tổng: {views_total:,})\n"
            f"• Đã reset BXH: <b>{', '.join(reset_notes)}</b>\n\n"
            f"<b>🌐 Trạng thái Tên miền Chống chặn:</b>\n"
            + ("\n".join(mirror_lines) if mirror_lines else "Chưa cấu hình mirror.")
        )

        if TG_BOT_TOKEN and TG_ADMIN_ID:
            with httpx.Client(timeout=15.0) as client:
                client.post(
                    f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage",
                    json={"chat_id": TG_ADMIN_ID, "text": report, "parse_mode": "HTML"},
                )
    finally:
        db.close()


if __name__ == "__main__":
    run_daily_report()
