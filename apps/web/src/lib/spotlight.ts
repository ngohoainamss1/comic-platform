import { getSpotlightGoUrl, type PublicSettings, type SpotlightCampaign } from './api';

const GUARD_KEY = 'vr_aff_guard_v2';

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
        return {
          sessionActions: parsed.sessionActions || 0,
          lastPopAt: parsed.lastPopAt || 0,
          dayKey: today,
          dayCount: 0,
        };
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

export function triggerSmartRedirect(
  campaigns: SpotlightCampaign[],
  settings: PublicSettings,
  refSlug = 'browse'
): boolean {
  if (settings.aff_smart_redirect_enabled === '0') return false;
  if (!campaigns || campaigns.length === 0) return false;

  const cooldownHours = Math.max(0, Number(settings.aff_cooldown_hours ?? 4));
  const dailyCap = Math.max(1, Number(settings.aff_daily_cap ?? 3));
  const triggerChance = Math.min(100, Math.max(1, Number((settings as unknown as Record<string, string>).aff_trigger_chance ?? 40)));

  const guard = readGuard();
  guard.sessionActions += 1;

  if (cooldownHours > 0) {
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
  }

  if (Math.random() * 100 > triggerChance) {
    writeGuard(guard);
    return false;
  }

  const picked = pickRandomAffiliate(campaigns);
  if (!picked) return false;

  guard.lastPopAt = Date.now();
  guard.dayCount += 1;
  writeGuard(guard);

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

export function pickWeightedCampaign(campaigns: SpotlightCampaign[], placement: string): SpotlightCampaign | null {
  return pickRandomAffiliate(campaigns);
}

export function isStickyBarHidden(_hours = 12): boolean {
  return false;
}

export function dismissStickyBar(): void {}
