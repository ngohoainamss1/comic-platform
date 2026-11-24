import { getSpotlightGoUrl, type PublicSettings, type SpotlightCampaign, type SpotlightPlacement } from './api';

const GUARD_KEY = 'vr_aff_guard_v1';
const STICKY_DISMISS_KEY = 'vr_sb_dismissed_at';

interface GuardState {
  sessionActions: number;
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
        return { sessionActions: parsed.sessionActions || 0, lastPopAt: parsed.lastPopAt || 0, dayKey: today, dayCount: 0 };
      }
      return parsed;
    }
  } catch {}
  return { sessionActions: 0, lastPopAt: 0, dayKey: today, dayCount: 0 };
}

function writeGuard(state: GuardState): void {
  try {
    localStorage.setItem(GUARD_KEY, JSON.stringify(state));
  } catch {}
}

export function pickWeightedCampaign(
  campaigns: SpotlightCampaign[],
  placement: SpotlightPlacement
): SpotlightCampaign | null {
  const pool = campaigns.filter((c) => c.placement === placement);
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0];

  const totalWeight = pool.reduce((acc, item) => acc + Math.max(1, Number(item.priority || 1)), 0);
  let rand = Math.random() * totalWeight;
  for (const item of pool) {
    rand -= Math.max(1, Number(item.priority || 1));
    if (rand <= 0) return item;
  }
  return pool[0];
}

export function triggerSmartRedirect(
  campaigns: SpotlightCampaign[],
  settings: PublicSettings,
  refSlug = 'reader'
): boolean {
  if (settings.aff_smart_redirect_enabled === '0') return false;

  const campaign = pickWeightedCampaign(campaigns, 'gesture_pop');
  if (!campaign) return false;

  const cooldownHours = Math.max(1, Number(settings.aff_cooldown_hours || campaign.cooldown_hours || 6));
  const dailyCap = Math.max(1, Number(settings.aff_daily_cap || 2));

  const guard = readGuard();
  guard.sessionActions += 1;

  if (guard.sessionActions <= 1) {
    writeGuard(guard);
    return false;
  }

  if (guard.dayCount >= dailyCap) {
    writeGuard(guard);
    return false;
  }

  const now = Date.now();
  if (guard.lastPopAt > 0 && now - guard.lastPopAt < cooldownHours * 3600 * 1000) {
    writeGuard(guard);
    return false;
  }

  guard.lastPopAt = now;
  guard.dayCount += 1;
  writeGuard(guard);

  const goUrl = getSpotlightGoUrl(campaign.code, refSlug);
  window.open(goUrl, '_blank', 'noopener,noreferrer');
  return true;
}

export function isStickyBarHidden(cooldownHours = 12): boolean {
  try {
    const dismissedAt = Number(localStorage.getItem(STICKY_DISMISS_KEY) || '0');
    if (!dismissedAt) return false;
    return Date.now() - dismissedAt < cooldownHours * 3600 * 1000;
  } catch {
    return false;
  }
}

export function dismissStickyBar(): void {
  try {
    localStorage.setItem(STICKY_DISMISS_KEY, String(Date.now()));
  } catch {}
}
