# VinaReader - Nền Tảng Đọc Truyện Tranh Zero-Cost (Mobile-First)

Kiến trúc Edge-First Serverless tối ưu hiệu suất cao, lưu trữ ảnh AVIF siêu nén và tự động cào/đăng chương mới 24/7 với chi phí 0đ.

## Cấu trúc thư mục
- `apps/worker`: Backend REST API (Hono) + Edge Image Proxy (Cloudflare Workers, Cache 1 năm, bảo mật HMAC-SHA256).
- `apps/web`: Giao diện Mobile-First Adaptive (React + Vite + Tailwind) + PWA Service Worker tự động đổi tên miền dự phòng khi bị nhà mạng chặn.
- `scripts/pipeline`: Bộ cắt trang Webtoon thông minh, siêu nén AVIF (`Q=68`, `4:4:4`) và đẩy lưu trữ song song lên Telegram + GitHub.
- `scripts/crawler`: Hệ thống tự động cào bộ mới, chap mới và xuất bản 24/7.
- `.github/workflows`: Tự động hóa Deploy và Cronjob chạy ngầm mỗi 30 phút.

## Chạy thử trên PC
1. Cài đặt thư viện:
   ```bash
   pnpm install
   ```
2. Chạy Backend API & Image Proxy:
   ```bash
   pnpm dev:worker
   ```
3. Mở thêm 1 cửa sổ Terminal khác, chạy giao diện Mobile Web:
   ```bash
   pnpm dev:web
   ```

## Triển khai tự động lên GitHub & Cloudflare
1. Đẩy toàn bộ thư mục này lên kho `ngohoainamss1/comic-platform`.
2. Thêm các biến trong `.env` vào **Settings > Secrets and variables > Actions** trên GitHub.
3. Vào tab **Actions** để chạy `Deploy Frontend & Worker` và `Automated Chapter Sync`.
