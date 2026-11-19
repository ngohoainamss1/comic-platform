export interface Env {
  ENVIRONMENT: string;
  IMAGE_TOKEN_TTL_SECONDS: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  HMAC_SECRET_KEY: string;
  TG_BOT_TOKEN: string;
  GH_TOKEN: string;
  GH_BACKUP_REPO: string;
}

export interface ComicRow {
  id: number;
  slug: string;
  title: string;
  alt_titles: string;
  description: string;
  cover_file_id: string;
  cover_gh_path: string;
  status: string;
  views_day: number;
  views_week: number;
  views_month: number;
  views_total: number;
  rating_avg: number;
  rating_count: number;
  updated_at: string;
  created_at: string;
}
