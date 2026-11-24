import { getSpotlightGoUrl, type PublicSettings, type SpotlightCampaign } from './api';

const GUARD_KEY = 'vr_aff_guard_v2';
const SESSION_KEY = 'vr_aff_session_actions';
const STICKY_DISMISS_KEY = 'vr_aff_sticky_dismissed_at';
const SPOTLIGHT_CACHE_KEY = 'vr_cached_spotlights';

interface GuardState {
  lastPopAt: number;
  dayKey: string;
  dayCount: number;
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readGuard(): GuardState {
  const today = getTodayKey();
  try {
    const raw = localStorage.getItem(GUARD_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as GuardState;
      if (parsed.dayKey !== today) {
        return { lastPopAt: parsed.lastPopAt || 0, dayKey: today, dayCount: 0 };
      }
      return parsed;
    }
  } catch {}
  return { lastPopAt: 0, dayKey: today, dayCount: 0 };
}

function writeGuard(state: GuardState): void {
  try {
    localStorage.setItem(GUARD_KEY, JSON.stringify(state));
  } catch {}
}

function getSessionActions(): number {
  try {
    const val = sessionStorage.getItem(SESSION_KEY);
    return val ? Number(val) : 0;
  } catch {
    return 0;
  }
}

function setSessionActions(n: number): void {
  try {
    sessionStorage.setItem(SESSION_KEY, String(n));
  } catch {}
}

export function pickRandomAffiliate(campaigns: SpotlightCampaign[]): SpotlightCampaign | null {
  if (!campaigns || campaigns.length === 0) return null;
  if (campaigns.length === 1) return campaigns[0];

  const totalWeight = campaigns.reduce((acc, item) => acc + Math.max(1, Number(item.priority || 1)), 0);
  let rand = Math.random() * totalWeight;
  for (const item of campaigns) {
    rand -= Math.max(1, Number(item.priority || 1));
    if (rand <= 0) return item;
  }
  return campaigns[0];
}

export function pickWeightedCampaign(campaigns: SpotlightCampaign[], placement: string): SpotlightCampaign | null {
  if (!campaigns || campaigns.length === 0) return null;
  const matched = campaigns.filter((c) => c.placement === placement && true);
  if (matched.length > 0) return pickRandomAffiliate(matched);

  const fallback = campaigns.filter((c) => (c.placement === 'gesture_pop') && true);
  if (fallback.length > 0) return pickRandomAffiliate(fallback);

  return pickRandomAffiliate(campaigns);
}

export function triggerSmartRedirect(
  campaigns: SpotlightCampaign[],
  settings: PublicSettings,
  refSlug = 'browse'
): boolean {
  if (settings.aff_smart_redirect_enabled === '0') return false;

  let activeCampaigns = campaigns;
  if (!activeCampaigns || activeCampaigns.length === 0) {
    try {
      const cached = localStorage.getItem(SPOTLIGHT_CACHE_KEY);
      if (cached) activeCampaigns = JSON.parse(cached);
    } catch {}
  } else {
    try {
      localStorage.setItem(SPOTLIGHT_CACHE_KEY, JSON.stringify(campaigns));
    } catch {}
  }

  if (!activeCampaigns || activeCampaigns.length === 0) return false;

  const cooldownHours = Math.max(0, Number(settings.aff_cooldown_hours ?? 4));
  const dailyCap = Math.max(1, Number(settings.aff_daily_cap ?? 3));
  const triggerChance = Math.min(100, Math.max(1, Number((settings as unknown as Record<string, string>).aff_trigger_chance ?? 40)));

  const sessionActs = getSessionActions() + 1;
  setSessionActions(sessionActs);

  if (cooldownHours > 0) {
    if (sessionActs <= 1) return false;

    const guard = readGuard();
    if (guard.dayCount >= dailyCap) return false;

    const now = Date.now();
    if (guard.lastPopAt > 0 && now - guard.lastPopAt < cooldownHours * 3600 * 1000) return false;

    if (Math.random() * 100 > triggerChance) return false;

    guard.lastPopAt = now;
    guard.dayCount += 1;
    writeGuard(guard);
  } else {
    if (Math.random() * 100 > triggerChance) return false;
  }

  const picked = pickWeightedCampaign(activeCampaigns, 'gesture_pop');
  if (!picked) return false;

  const goUrl = getSpotlightGoUrl(picked.code, refSlug);
  const a = document.createElement('a');
  a.href = goUrl;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

export function isStickyBarHidden(hours = 12): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(STICKY_DISMISS_KEY) || '0');
    if (!dismissedAt) return false;
    return Date.now() - dismissedAt < hours * 3600 * 1000;
  } catch {
    return false;
  }
}

export function dismissStickyBar(): void {
  try {
    localStorage.setItem(STICKY_DISMISS_KEY, String(Date.now()));
  } catch {}
}
