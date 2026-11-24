import React, { useMemo, useState } from 'react';
import { ExternalLink, Sparkles, X } from 'lucide-react';
import {
  getSpotlightGoUrl,
  type SpotlightCampaign,
  type SpotlightPlacement,
} from '../lib/api';
import {
  dismissStickyBar,
  isStickyBarHidden,
  pickWeightedCampaign,
} from '../lib/spotlight';

interface PartnerSlotProps {
  campaigns: SpotlightCampaign[];
  placement: SpotlightPlacement;
  refSlug?: string;
}

export const PartnerSlot: React.FC<PartnerSlotProps> = ({
  campaigns,
  placement,
  refSlug = 'home',
}) => {
  const [hidden, setHidden] = useState(false);

  const item = useMemo(
    () => pickWeightedCampaign(campaigns, placement),
    [campaigns, placement]
  );

  if (!item || hidden) return null;
  if (placement === 'sticky_bar' && isStickyBarHidden(item.cooldown_hours)) {
    return null;
  }

  const href = getSpotlightGoUrl(item.code, refSlug);
  const isShopee = item.platform === 'shopee';
  const platformLabel = isShopee ? 'Shopee Deal' : item.platform === 'tiktok' ? 'TikTok Shop' : 'Ưu đãi';
  const badgeColor = isShopee
    ? 'bg-[#ee4d2d] text-white'
    : 'bg-gradient-to-r from-[#ff0050] to-[#00f2ea] text-white';

  if (placement === 'home_native') {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group cursor-pointer rounded-lg bg-bgc-layer1 border border-bd-default hover:border-lav-500/70 overflow-hidden transition flex flex-col"
      >
        <div className="relative aspect-[2/3] overflow-hidden bg-bgc-layer2">
          <img
            src={item.image_url}
            alt={item.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 to-transparent" />
          <span className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold shadow ${badgeColor}`}>
            {item.badge_text || platformLabel}
          </span>
          <div className="absolute bottom-1.5 inset-x-2 flex items-center justify-between text-[11px] text-amber-300 font-semibold">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> {platformLabel}
            </span>
            <ExternalLink className="w-3 h-3" />
          </div>
        </div>
        <div className="p-2.5 flex-1 flex flex-col justify-between gap-1.5">
          <h3 className="text-xs sm:text-sm font-semibold text-txt-primary line-clamp-2 group-hover:text-lav-400 transition">
            {item.title}
          </h3>
          <div className="flex items-center justify-between text-[11px] text-txt-secondary">
            <span className="truncate text-amber-400 font-medium">{item.subtitle || item.cta_text}</span>
          </div>
        </div>
      </a>
    );
  }

  if (placement === 'sticky_bar') {
    return (
      <div className="fixed bottom-0 inset-x-0 z-40 px-3 pb-[calc(0.5rem+var(--sab))] pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto rounded-2xl bg-[#17181f]/95 backdrop-blur-xl border border-lav-500/40 p-2.5 shadow-2xl flex items-center gap-3">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 flex-1 min-w-0"
          >
            <img
              src={item.image_url}
              alt={item.title}
              className="w-11 h-11 rounded-xl object-cover shrink-0 border border-white/10"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${badgeColor}`}>
                  {item.badge_text || platformLabel}
                </span>
                <p className="text-xs font-bold text-white truncate">{item.title}</p>
              </div>
              {item.subtitle && (
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">{item.subtitle}</p>
              )}
            </div>
            <span className="shrink-0 px-3 py-1.5 rounded-xl bg-gradient-to-r from-lav-500 to-mag-500 text-white text-xs font-bold">
              {item.cta_text || 'Săn ngay'}
            </span>
          </a>
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => {
              dismissStickyBar();
              setHidden(true);
            }}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 my-3">
      <div className="relative rounded-2xl bg-bgc-layer1 border border-bd-default hover:border-lav-500/60 p-3 transition shadow-lg">
        {placement === 'reader_mid' && (
          <button
            type="button"
            onClick={() => setHidden(true)}
            className="absolute top-2 right-2 px-2 py-0.5 rounded bg-white/5 hover:bg-white/15 text-[10px] text-zinc-400"
          >
            Ẩn
          </button>
        )}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3.5"
        >
          <img
            src={item.image_url}
            alt={item.title}
            loading="lazy"
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0 bg-bgc-layer2 border border-white/10"
          />
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeColor}`}>
                {item.badge_text || platformLabel}
              </span>
              <span className="text-[11px] text-txt-secondary">{platformLabel}</span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-txt-primary line-clamp-2">
              {item.title}
            </p>
            {item.subtitle && (
              <p className="text-[11px] text-amber-400 font-medium line-clamp-1">
                {item.subtitle}
              </p>
            )}
          </div>
          <span className="shrink-0 px-3.5 py-2 rounded-xl bg-gradient-to-r from-lav-500 to-mag-500 text-white text-xs font-bold flex items-center gap-1 shadow">
            {item.cta_text || 'Mở App'} <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </a>
      </div>
    </div>
  );
};
