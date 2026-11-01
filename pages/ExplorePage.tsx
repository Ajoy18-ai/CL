
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search, Users, Film, Tv, ChevronLeft, ChevronRight, Loader2, Sparkles,
  ArrowRight, Video, Building2, Flame, Camera, ListFilter,
  X, UserCheck, Briefcase, Info, Eye, Layers, Star, TrendingUp,
  Award, Grid3x3, List, RefreshCw, AlertCircle, Calendar, MapPin,
  Globe, ExternalLink, ArrowUpRight, Check, ChevronDown, Languages,
  Pin, PinOff, Copy
} from 'lucide-react';
import {
  searchPeople,
  searchCompanies,
  getPersonCredits,
  getCompanyMedia,
  getPopularPeople,
  getPersonDetails,
  getCompanyDetails,
  discoverByYear,
  purgeUnnecessaryLocalStorage
} from '../services/api';
import { TMDB_IMAGE_BASE, BLOCKED_TMDB_IDS } from '../constants';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import { saveSearchHistoryItem } from '../services/searchHistory';
import { PinnedTalent } from '../types';

export type { PinnedTalent };

// ==================== TYPES ====================
interface EntityResult {
  id: number;
  name: string;
  image?: string;
  type: 'person' | 'company';
  subtitle?: string;
}

interface MediaItem {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: 'movie' | 'tv';
  popularity?: number;
  job?: string;
  character?: string;
  department?: string;
  credit_category?: 'cast' | 'crew';
  credit_id?: string;
}

type FilmoRole = 'all' | 'acting' | 'directed' | 'appearance' | 'produce' | 'creative';
type FilmoType = 'movie' | 'tv' | 'all';
type FilmoSort = 'all' | 'popularity' | 'rating' | 'newest' | 'oldest';
type ViewMode = 'grid' | 'list';

interface Studio {
  id: number;
  name: string;
  logo: string;
}

// ==================== CONSTANTS ====================
const FEATURED_STUDIOS: Studio[] = [
  { id: 41077, name: 'A24', logo: 'https://image.tmdb.org/t/p/h100/1Xj7edqY5i8aU1Vv3f8Y1v6X8X.png' },
  { id: 83510, name: 'Neon', logo: 'https://image.tmdb.org/t/p/h100/v098Y6KxS9V8KjD1T2vW9T9H9L4.png' },
  { id: 127928, name: 'Searchlight', logo: 'https://image.tmdb.org/t/p/h100/f0b1a1O1Xj7edqY5i8aU1Vv3f8.png' },
  { id: 3172, name: 'Blumhouse', logo: 'https://image.tmdb.org/t/p/h100/888k9A83p869qC8S0qEdfh76j8v.png' },
  { id: 54244, name: 'Annapurna', logo: 'https://image.tmdb.org/t/p/h100/8yYAbvS5g5Iov5P7vW9T9H9L4.png' },
  { id: 33, name: 'Universal', logo: 'https://image.tmdb.org/t/p/h100/8lvHyM7IsSmaU9vW9T9H9L4.png' },
  { id: 174, name: 'Warner Bros', logo: 'https://image.tmdb.org/t/p/h100/878k9A83p869qC8S0qEdfh76j8v.png' }
];

const VISIONARY_DIRECTORS_IDS = [525, 1032, 138, 92130, 21684, 5655, 7467, 2127, 578];
const SEARCH_DEBOUNCE_MS = 500;

// ==================== CUSTOM HOOKS ====================
const useInfiniteScroll = (callback: () => void, loading: boolean) => {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loading) {
          callback();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    if (sentinelRef.current) {
      observerRef.current.observe(sentinelRef.current);
    }

    return () => observerRef.current?.disconnect();
  }, [callback, loading]);

  return sentinelRef;
};

const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

// ==================== UTILITY FUNCTIONS ====================
const getMediaYear = (item: MediaItem): string => {
  const date = item.release_date || item.first_air_date || '';
  return date.split('-')[0] || 'N/A';
};

const getMediaTitle = (item: MediaItem): string => {
  return item.title || item.name || 'Untitled';
};

const getCreditRole = (item: MediaItem): string => {
  if (item.job) return item.job;
  if (item.character) {
    const char = item.character.toLowerCase();
    if (char.includes('self') || char.includes('himself') || char.includes('herself')) return 'Appearance';
    if (char.includes('cameo')) return 'Cameo';
    return item.character;
  }
  return 'Acting';
};

// ==================== SKELETON LOADERS ====================
const CardSkeleton: React.FC = () => (
  <div className="flex flex-col gap-3 animate-pulse">
    <div className="aspect-square rounded-2xl bg-zinc-900/50 border border-white/5" />
    <div className="px-1 space-y-2">
      <div className="h-3 bg-zinc-900/50 rounded w-3/4" />
      <div className="h-2 bg-zinc-900/50 rounded w-1/2" />
    </div>
  </div>
);

const MediaCardSkeleton: React.FC = () => (
  <div className="flex flex-col gap-2 animate-pulse">
    <div className="aspect-[2/3] rounded-2xl bg-zinc-900/50 border border-white/5" />
    <div className="px-1 space-y-2">
      <div className="h-2 bg-zinc-900/50 rounded w-4/5" />
      <div className="h-2 bg-zinc-900/50 rounded w-2/5" />
    </div>
  </div>
);

const ListItemSkeleton: React.FC = () => (
  <div className="w-full flex items-center justify-between gap-3 md:gap-4 p-3 md:p-3.5 bg-[#0f0f13] rounded-2xl border border-white/5 animate-pulse shadow-md">
    <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
      <div className="w-12 sm:w-14 aspect-[2/3] rounded-xl bg-zinc-900/80 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="h-3.5 bg-zinc-900/90 rounded-md w-3/5" />
        <div className="flex items-center gap-2">
          <div className="h-2.5 bg-zinc-900/60 rounded w-12" />
          <div className="h-2.5 bg-zinc-900/60 rounded w-16" />
          <div className="h-2.5 bg-zinc-900/60 rounded w-20" />
        </div>
      </div>
    </div>
    <div className="w-8 h-8 rounded-xl bg-zinc-900/60 flex-shrink-0" />
  </div>
);

// ==================== COMPONENTS ====================

const ErrorAlert: React.FC<{
  message: string;
  onRetry?: () => void;
  onDismiss: () => void;
}> = ({ message, onRetry, onDismiss }) => (
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 md:p-4 backdrop-blur-xl"
  >
    <div className="flex items-start gap-3">
      <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[9px] md:text-[10px] font-black text-red-400 uppercase tracking-wider">
          {message}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-red-400 hover:text-red-300 transition-colors"
            aria-label="Retry"
          >
            <RefreshCw size={14} />
          </button>
        )}
        <button
          onClick={onDismiss}
          className="text-red-400 hover:text-red-300 transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  </motion.div>
);

const StudioCard: React.FC<{
  studio: Studio;
  onSelect: (e: EntityResult) => void;
}> = ({ studio, onSelect }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      onClick={() => onSelect({ id: studio.id, name: studio.name, type: 'company' })}
      className="group relative h-20 md:h-28 rounded-xl md:rounded-2xl overflow-hidden bg-[#0c0c0e] border border-white/5 shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] touch-manipulation"
      aria-label={`Explore ${studio.name}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-black/20 to-transparent z-10" />
      <div className="absolute inset-0 flex items-center justify-center p-3 md:p-6">
        {!imgError ? (
          <img
            src={studio.logo}
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain brightness-0 invert opacity-30 group-hover:opacity-90 transition-all duration-500"
            alt={studio.name}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <span className="font-black text-white italic text-[10px] md:text-lg tracking-tighter uppercase opacity-20 group-hover:opacity-80 transition-opacity text-center">
            {studio.name}
          </span>
        )}
      </div>
    </button>
  );
};

const EntityCard: React.FC<{
  entity: EntityResult;
  onClick: () => void;
  index?: number;
  isPinned?: boolean;
  onTogglePin?: (e: React.MouseEvent) => void;
}> = ({ entity, onClick, index = 0, isPinned = false, onTogglePin }) => {
  return (
    <div
      className="content-auto group relative flex flex-col gap-2 md:gap-3 text-left touch-manipulation w-full"
      style={{ transform: 'translateZ(0)' }}
    >
      <div
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        className="relative aspect-square rounded-xl md:rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-lg cursor-pointer w-full group/card select-none transition-transform duration-150 active:scale-[0.97]"
      >
        {entity.image ? (
          <img
            src={entity.image}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-transform duration-200 group-hover:scale-105"
            alt={entity.name}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5">
            {entity.type === 'person' ? (
              <Users size={28} className="text-zinc-800" />
            ) : (
              <Building2 size={28} className="text-zinc-800" />
            )}
          </div>
        )}

        {/* Pin button for talent / people */}
        {entity.type === 'person' && onTogglePin && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onTogglePin(e);
            }}
            className={`absolute top-2 right-2 p-2 sm:p-1.5 rounded-xl backdrop-blur-md transition-all z-30 active:scale-90 touch-manipulation ${
              isPinned
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/50 border border-purple-400/40 opacity-100'
                : 'bg-black/75 text-zinc-300 border border-white/15 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 hover:text-white hover:bg-black hover:border-purple-500/50'
            }`}
            aria-label={isPinned ? `Unpin ${entity.name}` : `Pin ${entity.name} to top`}
            title={isPinned ? "Pinned to top (click to unpin)" : "Pin to top"}
          >
            {isPinned ? <Pin size={12} className="fill-white" /> : <Pin size={12} />}
          </button>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-0 right-0 p-2 md:p-3 z-20 flex items-end justify-between gap-1.5 pointer-events-auto">
          <div className="min-w-0 flex-1">
            <h3
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(entity.name);
                useToastStore.getState().success(`Copied: "${entity.name}"`);
              }}
              title="Click to copy name"
              className="font-black text-[9px] md:text-[11px] text-white uppercase italic truncate leading-tight cursor-pointer hover:text-purple-300 transition-colors flex items-center gap-1 group/name select-text"
            >
              <span className="truncate">{entity.name}</span>
              <Copy size={10} className="opacity-0 group-hover/name:opacity-100 text-purple-400 transition-opacity shrink-0 hidden sm:inline" />
            </h3>
            {entity.subtitle && (
              <p className="text-[7px] md:text-[8px] font-black text-purple-400 uppercase tracking-[0.15em] mt-0.5 truncate pointer-events-none">
                {entity.subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(entity.name);
              useToastStore.getState().success(`Copied: "${entity.name}"`);
            }}
            className="p-1 rounded-md bg-black/60 hover:bg-purple-600 text-zinc-400 hover:text-white border border-white/10 opacity-70 sm:opacity-0 sm:group-hover/card:opacity-100 transition-all active:scale-90 shrink-0 touch-manipulation"
            title={`Copy ${entity.name}`}
            aria-label={`Copy ${entity.name}`}
          >
            <Copy size={9} />
          </button>
        </div>
      </div>
    </div>
  );
};

const PinnedTalentCard: React.FC<{
  talent: PinnedTalent;
  onSelect: (e: EntityResult) => void;
  onUnpin: (id: number, e: React.MouseEvent) => void;
  index: number;
}> = ({ talent, onSelect, onUnpin, index }) => {
  return (
    <div
      className="group relative flex-shrink-0 w-28 sm:w-32 md:w-36 flex flex-col gap-1.5"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect({ id: talent.id, name: talent.name, image: talent.image, type: 'person', subtitle: talent.subtitle })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect({ id: talent.id, name: talent.name, image: talent.image, type: 'person', subtitle: talent.subtitle });
          }
        }}
        className="w-full relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#0e0e11] border border-purple-500/20 shadow-lg shadow-purple-950/20 group-hover:border-purple-500/50 group-hover:shadow-purple-500/20 transition-transform duration-150 text-left cursor-pointer active:scale-95 select-none"
      >
        {talent.image ? (
          <img
            src={talent.image}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover grayscale brightness-90 group-hover:grayscale-0 group-hover:brightness-100 group-hover:scale-105 transition-transform duration-200"
            alt={talent.name}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900 text-zinc-700">
            <Users size={24} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent pointer-events-none" />

        {/* Pinned active glowing badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 bg-purple-600/90 backdrop-blur-md rounded-md border border-purple-400/30 shadow-md pointer-events-none">
          <Pin size={8} className="text-white fill-white" />
          <span className="text-[6px] font-black text-white uppercase tracking-wider">PINNED</span>
        </div>

        {/* Unpin quick button on card */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onUnpin(talent.id, e);
          }}
          className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/75 hover:bg-red-600 text-zinc-300 hover:text-white border border-white/15 transition-all z-30 active:scale-90 touch-manipulation"
          title={`Unpin ${talent.name}`}
          aria-label={`Unpin ${talent.name}`}
        >
          <PinOff size={11} />
        </button>

        {/* Talent info at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5 z-20 flex items-end justify-between gap-1 pointer-events-auto">
          <div className="min-w-0 flex-1">
            <h4
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(talent.name);
                useToastStore.getState().success(`Copied: "${talent.name}"`);
              }}
              title="Click to copy name"
              className="font-black text-[10px] md:text-[11px] text-white uppercase italic truncate leading-tight group-hover:text-purple-300 transition-colors cursor-pointer flex items-center gap-1 select-text group/pinnedname"
            >
              <span className="truncate">{talent.name}</span>
              <Copy size={10} className="opacity-0 group-hover/pinnedname:opacity-100 text-purple-400 transition-opacity shrink-0 hidden sm:inline" />
            </h4>
            {talent.subtitle && (
              <p className="text-[7px] font-black text-purple-400 uppercase tracking-widest truncate pointer-events-none">
                {talent.subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(talent.name);
              useToastStore.getState().success(`Copied: "${talent.name}"`);
            }}
            className="p-1 rounded-md bg-black/70 hover:bg-purple-600 text-zinc-400 hover:text-white border border-white/15 opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-all active:scale-90 shrink-0 touch-manipulation"
            title={`Copy ${talent.name}`}
            aria-label={`Copy ${talent.name}`}
          >
            <Copy size={9} />
          </button>
        </div>
      </div>
    </div>
  );
};

const MediaCard: React.FC<{
  item: MediaItem;
  onClick: () => void;
  index: number;
  viewMode: ViewMode;
}> = ({ item, onClick, index, viewMode }) => {
  const { blurPosters } = useStore();

  if (viewMode === 'list') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="content-auto w-full group flex items-center justify-between gap-3 md:gap-4 p-2.5 sm:p-3 md:p-3.5 bg-[#0e0e12]/90 hover:bg-[#15151c] rounded-2xl border border-white/5 hover:border-purple-500/30 transition-transform duration-150 text-left touch-manipulation active:scale-[0.99] shadow-lg shadow-black/20"
        style={{ transform: 'translateZ(0)' }}
      >
        <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
          <div className="relative w-11 sm:w-13 md:w-14 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-900 border border-white/5 flex-shrink-0 shadow-md">
            {item.poster_path ? (
              <img
                src={`${TMDB_IMAGE_BASE}${item.poster_path}`}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transition-transform duration-200 ${blurPosters ? 'blur-2xl scale-110' : 'blur-0 scale-100'}`}
                alt=""
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900/80">
                {item.media_type === 'tv' ?
                  <Tv size={14} className="text-zinc-700" /> :
                  <Film size={14} className="text-zinc-700" />
                }
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <h4 className="font-black text-xs sm:text-[13px] md:text-sm text-white group-hover:text-purple-300 transition-colors uppercase italic truncate leading-tight">
              {getMediaTitle(item)}
            </h4>

            <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
              <span className="text-[8px] md:text-[9px] font-black text-zinc-500 uppercase tracking-wider">
                {getMediaYear(item)}
              </span>

              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-zinc-800/80 border border-white/5 text-zinc-400 text-[7px] md:text-[8px] font-black uppercase">
                {item.media_type === 'tv' ? <Tv size={8} className="text-zinc-400" /> : <Film size={8} className="text-zinc-400" />}
                <span>{item.media_type === 'tv' ? 'TV' : 'Film'}</span>
              </span>

              {item.vote_average && item.vote_average > 0 ? (
                <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-[7px] md:text-[8px] font-black">
                  <Star size={8} className="fill-yellow-500" />
                  <span>{item.vote_average.toFixed(1)}</span>
                </div>
              ) : null}

              <span className="inline-block px-1.5 py-0.5 bg-purple-600/15 border border-purple-500/25 rounded text-[7px] md:text-[8px] font-black text-purple-300 uppercase tracking-wider truncate max-w-[130px] sm:max-w-[200px]">
                {getCreditRole(item)}
              </span>
            </div>
          </div>
        </div>

        <div className="p-2 sm:p-2.5 rounded-xl bg-white/[0.03] group-hover:bg-purple-600 border border-white/5 group-hover:border-purple-500/40 text-zinc-500 group-hover:text-white transition-colors flex-shrink-0">
          <ArrowRight size={13} />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="content-auto group flex flex-col gap-1.5 md:gap-2 text-left touch-manipulation transition-transform duration-150 active:scale-[0.97]"
      style={{ transform: 'translateZ(0)' }}
    >
      <div className="relative aspect-[2/3] rounded-xl md:rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-lg">
        {item.poster_path ? (
          <img
            src={`${TMDB_IMAGE_BASE}${item.poster_path}`}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover transition-transform duration-200 ${blurPosters ? 'blur-2xl scale-110' : 'blur-0 scale-100'}`}
            loading="lazy"
            decoding="async"
            alt=""
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center gap-2">
            {item.media_type === 'tv' ?
              <Tv size={20} className="text-zinc-800" /> :
              <Film size={20} className="text-zinc-800" />
            }
            <span className="text-zinc-800 text-[7px] font-black uppercase italic">No Poster</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-1.5 md:top-2 left-1.5 md:left-2 right-1.5 md:right-2 flex items-start justify-between z-10">
          <div className="px-1.5 md:px-2 py-0.5 md:py-1 bg-black/70 backdrop-blur-sm rounded-md border border-white/10">
            <span className="text-[6px] md:text-[7px] font-black text-white uppercase tracking-wider leading-none">
              {getCreditRole(item).length > 12 ? getCreditRole(item).substring(0, 12) + '...' : getCreditRole(item)}
            </span>
          </div>
          <div className="p-1 md:p-1.5 bg-black/60 backdrop-blur-sm rounded-md border border-white/10">
            {item.media_type === 'tv' ?
              <Tv size={9} className="text-white" /> :
              <Film size={9} className="text-white" />
            }
          </div>
        </div>
      </div>

      <div className="px-0.5 md:px-1 space-y-0.5">
        <h4 className="font-bold text-[9px] md:text-[10px] text-white uppercase italic truncate leading-tight">
          {getMediaTitle(item)}
        </h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[7px] md:text-[8px] font-black text-zinc-600 uppercase tracking-wider">
            {getMediaYear(item)}
          </span>
          {item.vote_average && item.vote_average > 0 && (
            <div className="flex items-center gap-0.5">
              <Star size={7} className="text-yellow-500 fill-yellow-500" />
              <span className="text-[7px] md:text-[8px] font-black text-yellow-500">
                {item.vote_average.toFixed(1)}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

const GENRE_MAP: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics'
};

const YearMediaCard: React.FC<{
  item: any;
  onClick: () => void;
  index: number;
}> = ({ item, onClick, index }) => {
  const { blurPosters } = useStore();
  const title = item.title || item.name || 'Untitled';
  const releaseDate = item.release_date || item.first_air_date || '';
  const releaseYear = releaseDate.split('-')[0] || 'N/A';
  const rating = item.vote_average;

  const genreNames = useMemo(() => {
    if (!item.genre_ids) return [];
    return item.genre_ids
      .map((id: number) => GENRE_MAP[id])
      .filter((name: string | undefined): name is string => typeof name === 'string')
      .slice(0, 2);
  }, [item.genre_ids]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="content-auto group flex flex-col gap-1.5 md:gap-2 text-left touch-manipulation w-full transition-transform duration-150 active:scale-[0.97]"
      style={{ transform: 'translateZ(0)' }}
    >
      <div className="relative aspect-[2/3] rounded-xl md:rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-lg w-full">
        {item.poster_path ? (
          <img
            src={`${TMDB_IMAGE_BASE}${item.poster_path}`}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 ${blurPosters ? 'blur-2xl scale-110' : 'blur-0'}`}
            loading="lazy"
            decoding="async"
            alt={title}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center gap-2 bg-zinc-900/40">
            {item.media_type === 'tv' ?
              <Tv size={24} className="text-zinc-700" /> :
              <Film size={24} className="text-zinc-700" />
            }
            <span className="text-zinc-500 text-[8px] font-black uppercase italic line-clamp-3">
              {title}
            </span>
          </div>
        )}

        {/* Rating and Type Badge */}
        <div className="absolute top-1.5 md:top-2 left-1.5 md:left-2 right-1.5 md:right-2 flex items-start justify-between z-10 pointer-events-none">
          {rating && rating > 0 ? (
            <div className="flex items-center gap-1 px-1.5 md:px-2 py-0.5 md:py-1 bg-black/75 backdrop-blur-sm rounded-md border border-white/10">
              <Star size={8} className="text-yellow-500 fill-yellow-500" />
              <span className="text-[7px] md:text-[8px] font-black text-yellow-500 leading-none">
                {rating.toFixed(1)}
              </span>
            </div>
          ) : <div />}
          <div className="p-1 md:p-1.5 bg-black/75 backdrop-blur-sm rounded-md border border-white/10">
            {item.media_type === 'tv' ?
              <Tv size={9} className="text-white" /> :
              <Film size={9} className="text-white" />
            }
          </div>
        </div>
      </div>

      <div className="px-0.5 md:px-1 space-y-0.5 w-full">
        <h4 className="font-bold text-[9px] md:text-[10px] text-white uppercase italic truncate leading-tight group-hover:text-purple-400 transition-colors">
          {title}
        </h4>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[7px] md:text-[8px] font-black text-zinc-600 uppercase tracking-wider">
            {releaseYear}
          </span>
          {genreNames.length > 0 && (
            <span className="text-[7px] md:text-[8px] font-black text-purple-400 uppercase tracking-wider truncate">
              {genreNames.join(' • ')}
            </span>
          )}
        </div>
      </div>
    </button>
  );
};

const FilterChip: React.FC<{
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-[8px] md:text-[9px] font-black tracking-widest uppercase transition-all whitespace-nowrap touch-manipulation ${
      active
        ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20'
        : 'text-zinc-600 hover:text-zinc-400 active:scale-95'
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}> = ({ icon, title, description, action }) => (
  <div className="py-16 md:py-20 flex flex-col items-center justify-center text-center space-y-3 md:space-y-4 px-4">
    <div className="text-zinc-800">{icon}</div>
    <div className="space-y-1.5 md:space-y-2">
      <p className="text-[9px] md:text-[10px] font-black text-zinc-700 uppercase tracking-[0.25em]">
        {title}
      </p>
      {description && (
        <p className="text-[8px] md:text-[9px] text-zinc-600 max-w-xs mx-auto">
          {description}
        </p>
      )}
    </div>
    {action && (
      <button
        onClick={action.onClick}
        className="text-[7px] md:text-[8px] font-black text-purple-500 uppercase tracking-widest hover:text-purple-400 transition-colors mt-2 touch-manipulation active:scale-95"
      >
        {action.label}
      </button>
    )}
  </div>
);

// ==================== MAIN COMPONENT ====================
const ExplorePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToastStore();

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const YEARS = useMemo(() => {
    return Array.from({ length: currentYear - 1888 + 1 }, (_, i) => currentYear - i);
  }, [currentYear]);

  const [yearSearchQuery, setYearSearchQuery] = useState('');

  const filteredYearsList = useMemo(() => {
    if (!yearSearchQuery.trim()) return YEARS;
    return YEARS.filter(y => y.toString().includes(yearSearchQuery.trim()));
  }, [YEARS, yearSearchQuery]);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'people' | 'companies' | 'years'>(() => {
    const tab = searchParams.get('tab');
    if (tab === 'people' || tab === 'companies' || tab === 'years') return tab as 'people' | 'companies' | 'years';
    return 'people';
  });
  const [results, setResults] = useState<EntityResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Browse by Year State
  const [selectedYear, setSelectedYear] = useState<number>(() => {
    const fromParams = searchParams.get('year');
    if (fromParams) {
      const p = parseInt(fromParams);
      if (p >= 1888 && p <= new Date().getFullYear()) return p;
    }
    const cached = localStorage.getItem('cinelog_explore_year');
    if (cached) {
      const c = parseInt(cached);
      if (c >= 1888 && c <= new Date().getFullYear()) return c;
    }
    return new Date().getFullYear();
  });

  const [yearMediaType, setYearMediaType] = useState<'all' | 'movie' | 'tv'>(() => {
    const fromParams = searchParams.get('mediaType');
    if (fromParams === 'all' || fromParams === 'movie' || fromParams === 'tv') return fromParams as 'all' | 'movie' | 'tv';
    return 'all';
  });

  const [yearLanguage, setYearLanguage] = useState<string>(() => {
    const fromParams = searchParams.get('language');
    if (fromParams) return fromParams;
    return 'all';
  });

  const [yearResults, setYearResults] = useState<any[]>([]);
  const [yearPage, setYearPage] = useState(1);
  const [totalYearPages, setTotalYearPages] = useState(1);
  const [isLoadingYearResults, setIsLoadingYearResults] = useState(false);
  const [yearError, setYearError] = useState<string | null>(null);
  const [isYearDropdownOpen, setIsYearDropdownOpen] = useState(false);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);

  const debouncedYear = useDebounce(selectedYear, 400);

  // Dropdown click outside and keyboard escape listener
  useEffect(() => {
    const handleEvents = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof MouseEvent) {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setIsYearDropdownOpen(false);
        }
        if (languageDropdownRef.current && !languageDropdownRef.current.contains(e.target as Node)) {
          setIsLanguageDropdownOpen(false);
        }
      } else if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') {
          setIsYearDropdownOpen(false);
          setIsLanguageDropdownOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleEvents);
    document.addEventListener('keydown', handleEvents);
    return () => {
      document.removeEventListener('mousedown', handleEvents);
      document.removeEventListener('keydown', handleEvents);
    };
  }, []);

  // Discovery State
  const [popularPeople, setPopularPeople] = useState<EntityResult[]>([]);
  const [visionaryDirectors, setVisionaryDirectors] = useState<EntityResult[]>([]);
  const [trendingPage, setTrendingPage] = useState(1);
  const [hasMoreTrending, setHasMoreTrending] = useState(true);
  const [isLoadingMoreTrending, setIsLoadingMoreTrending] = useState(false);
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(true);

  // Entity Detail State
  const [selectedEntity, setSelectedEntity] = useState<EntityResult | null>(null);
  const lastEntityRef = useRef<EntityResult | null>(null);
  if (selectedEntity) {
    lastEntityRef.current = selectedEntity;
  }
  const currentEntity = selectedEntity || lastEntityRef.current;
  const activeEntityRef = useRef<{ id: number; type: 'person' | 'company' } | null>(null);
  const [entityDetails, setEntityDetails] = useState<any | null>(null);
  const [isBioExpanded, setIsBioExpanded] = useState(false);
  const [entityMedia, setEntityMedia] = useState<MediaItem[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Scroll Position Memory for Explore Page Main View
  const exploreScrollPosRef = useRef<number>(0);
  const pinnedTalentScrollRef = useRef<HTMLDivElement>(null);

  // Pinned Talent State synced via centralized store and Firebase Firestore
  const {
    pinnedTalents,
    togglePinTalent: storeTogglePin,
    isTalentPinned: storeIsTalentPinned,
    clearPinnedTalents: storeClearPinnedTalents
  } = useStore();

  const isTalentPinned = useCallback((id: number | string | undefined | null) => {
    return storeIsTalentPinned(id);
  }, [storeIsTalentPinned]);

  const togglePinTalent = useCallback((talent: { id: number | string; name?: string; image?: string; subtitle?: string; type?: 'person' | 'company' }, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const talentId = typeof talent.id === 'string' ? parseInt(talent.id, 10) : talent.id;
    if (!talentId || isNaN(talentId)) return;

    const isPinned = storeIsTalentPinned(talentId);

    if (isPinned) {
      const name = talent.name || pinnedTalents.find(t => t.id === talentId)?.name || 'Talent';
      storeTogglePin({ id: talentId });
      useToastStore.getState().info(`Unpinned ${name}`);
    } else {
      const name = (talent.name && talent.name !== 'Loading...')
        ? talent.name
        : (entityDetails?.name || selectedEntity?.name || 'Talent');

      const image = talent.image
        || (entityDetails?.profile_path ? `${TMDB_IMAGE_BASE}${entityDetails.profile_path}` : undefined)
        || (selectedEntity?.id === talentId ? selectedEntity.image : undefined);

      const subtitle = talent.subtitle
        || (entityDetails?.known_for_department ? entityDetails.known_for_department.toUpperCase() : undefined)
        || (selectedEntity?.id === talentId ? selectedEntity.subtitle : undefined)
        || 'CREATIVE';

      storeTogglePin({
        id: talentId,
        name,
        image,
        type: 'person',
        subtitle
      });
      useToastStore.getState().success(`Pinned ${name} to top of Explore`);
    }
  }, [storeIsTalentPinned, storeTogglePin, pinnedTalents, entityDetails, selectedEntity]);

  // Guarantee instant top scroll whenever Explore mounts, changes entity, or reverts to main view
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const root = document.getElementById('root');
    if (root) root.scrollTop = 0;
  }, [selectedEntity?.id, selectedEntity?.type]);

  // Filter State
  const [filmoSearch, setFilmoSearch] = useState('');
  const [filmoType, setFilmoType] = useState<FilmoType>('movie');
  const [filmoSort, setFilmoSort] = useState<FilmoSort>('popularity');
  const [filmoRole, setFilmoRole] = useState<FilmoRole>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);

  // Error State
  const [error, setError] = useState<string | null>(null);

  // Debounced search
  const debouncedSearch = useDebounce(searchQuery, SEARCH_DEBOUNCE_MS);

  // Infinite scroll
  const sentinelRef = useInfiniteScroll(
    () => {
      if (hasMoreTrending && !selectedEntity && debouncedSearch.length < 2) {
        loadTrending(trendingPage + 1);
      }
    },
    isLoadingMoreTrending
  );

  const loadYearResults = useCallback(async (page: number, isLoadMore: boolean = false) => {
    setIsLoadingYearResults(true);
    setYearError(null);
    try {
      let finalResults: any[] = [];
      let maxPages = 1;

      if (yearMediaType === 'all') {
        const [movieRes, tvRes] = await Promise.all([
          discoverByYear(debouncedYear, 'movie', page, yearLanguage),
          discoverByYear(debouncedYear, 'tv', page, yearLanguage)
        ]);

        const combined = [...(movieRes?.results || []), ...(tvRes?.results || [])];
        combined.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

        finalResults = combined;
        maxPages = Math.max(movieRes?.total_pages || 1, tvRes?.total_pages || 1);
      } else {
        const { results, total_pages } = await discoverByYear(debouncedYear, yearMediaType, page, yearLanguage);
        finalResults = results || [];
        maxPages = total_pages || 1;
      }

      if (isLoadMore) {
        setYearResults(prev => {
          const existingKeys = new Set(prev.map(item => `${item.id}-${item.media_type}`));
          const uniqueNew = finalResults.filter(item => !existingKeys.has(`${item.id}-${item.media_type}`));
          return [...prev, ...uniqueNew];
        });
      } else {
        setYearResults(finalResults);
      }
      setYearPage(page);
      setTotalYearPages(maxPages);
    } catch (e) {
      console.error('Discover by year error:', e);
      setYearError('Failed to load browse results. Please try again.');
    } finally {
      setIsLoadingYearResults(false);
    }
  }, [debouncedYear, yearMediaType, yearLanguage]);

  // Sync Browse by Year state to URL and localStorage
  useEffect(() => {
    if (activeTab !== 'years') return;

    const params = new URLSearchParams(searchParams);
    params.set('tab', 'years');
    params.set('year', selectedYear.toString());
    params.set('mediaType', yearMediaType);
    params.set('language', yearLanguage);
    setSearchParams(params, { replace: true });
    localStorage.setItem('cinelog_explore_year', selectedYear.toString());
  }, [selectedYear, yearMediaType, yearLanguage, activeTab]);

  // Fetch results when activeTab, debouncedYear, mediaType or language changes
  useEffect(() => {
    if (activeTab === 'years') {
      loadYearResults(1, false);
    }
  }, [debouncedYear, yearMediaType, yearLanguage, activeTab, loadYearResults]);

  const yearSentinelRef = useInfiniteScroll(() => {
    if (activeTab === 'years' && yearPage < totalYearPages && !isLoadingYearResults) {
      loadYearResults(yearPage + 1, true);
    }
  }, isLoadingYearResults);

  // Synchronize state with URL query parameters (e.g. from redirect links)
  useEffect(() => {
    const fromParamsYear = searchParams.get('year');
    if (fromParamsYear) {
      const p = parseInt(fromParamsYear);
      if (!isNaN(p) && p >= 1888 && p <= new Date().getFullYear() && p !== selectedYear) {
        setSelectedYear(p);
      }
    }

    const fromParamsMediaType = searchParams.get('mediaType');
    if (fromParamsMediaType === 'all' || fromParamsMediaType === 'movie' || fromParamsMediaType === 'tv') {
      if (fromParamsMediaType !== yearMediaType) {
        setYearMediaType(fromParamsMediaType as 'all' | 'movie' | 'tv');
      }
    }

    const fromParamsLanguage = searchParams.get('language');
    if (fromParamsLanguage && fromParamsLanguage !== yearLanguage) {
      setYearLanguage(fromParamsLanguage);
    }

    const fromParamsTab = searchParams.get('tab');
    if (fromParamsTab === 'people' || fromParamsTab === 'companies' || fromParamsTab === 'years') {
      if (fromParamsTab !== activeTab) {
        setActiveTab(fromParamsTab as 'people' | 'companies' | 'years');
      }
    }
  }, [searchParams]);

  // ==================== HANDLERS ====================

  const handleEntitySelect = useCallback(async (entity: EntityResult, updateUrl = true) => {
    // Save current scroll position of the main explore list if opening detail from main view
    if (!activeEntityRef.current) {
      exploreScrollPosRef.current = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
    }

    setSelectedEntity(entity);
    activeEntityRef.current = { id: entity.id, type: entity.type };
    setEntityDetails(null);
    setIsBioExpanded(false);
    setIsLoadingDetails(true);
    setError(null);
    setFilmoSearch('');
    setFilmoType('movie');
    setFilmoSort('popularity');
    setFilmoRole('all');
    setViewMode('grid');
    setShowFilters(false);

    if (updateUrl) {
      const nextParams = new URLSearchParams(searchParams);
      if (entity.type === 'person') {
        nextParams.set('personId', String(entity.id));
        nextParams.delete('companyId');
      } else {
        nextParams.set('companyId', String(entity.id));
        nextParams.delete('personId');
      }
      setSearchParams(nextParams);
    }

    // Instantly scroll window to top for fresh entity profile
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const root = document.getElementById('root');
    if (root) root.scrollTop = 0;

    try {
      // Always fetch full details to get biography, headquarters, birthdate, website, etc.
      const details = entity.type === 'person'
        ? await getPersonDetails(entity.id)
        : await getCompanyDetails(entity.id);

      if (activeEntityRef.current?.id !== entity.id || activeEntityRef.current?.type !== entity.type) {
        return;
      }

      setEntityDetails(details);

      const fullEntity: EntityResult = {
        ...entity,
        name: details.name || entity.name,
        image: (details.profile_path || details.logo_path)
          ? `${TMDB_IMAGE_BASE}${details.profile_path || details.logo_path}`
          : entity.image,
        subtitle: entity.type === 'person'
          ? (details.known_for_department ? details.known_for_department.toUpperCase() : 'CREATIVE')
          : (details.origin_country || 'STUDIO')
      };
      setSelectedEntity(fullEntity);

      // Record visited talent or studio in search history with picture and role
      try {
        saveSearchHistoryItem({
          query: fullEntity.name,
          title: fullEntity.name,
          type: fullEntity.type === 'person' ? 'person' : 'company',
          image: fullEntity.image,
          subtitle: fullEntity.subtitle,
          entityId: fullEntity.id
        });
      } catch (err) {
        console.warn('Failed to record talent visit history:', err);
      }

      const media = fullEntity.type === 'person'
        ? await getPersonCredits(fullEntity.id)
        : await getCompanyMedia(fullEntity.id);

      if (activeEntityRef.current?.id !== entity.id || activeEntityRef.current?.type !== entity.type) {
        return;
      }

      setEntityMedia(media.filter(m => !BLOCKED_TMDB_IDS.includes(m.id)));
    } catch (e) {
      console.error('Details error:', e);
      if (activeEntityRef.current?.id === entity.id && activeEntityRef.current?.type === entity.type) {
        setError('Failed to load profile');
        setEntityMedia([]);
      }
    } finally {
      if (activeEntityRef.current?.id === entity.id && activeEntityRef.current?.type === entity.type) {
        setIsLoadingDetails(false);
      }
    }
  }, [searchParams, setSearchParams]);

  // Listen for deep links
  useEffect(() => {
    const personId = searchParams.get('personId');
    const companyId = searchParams.get('companyId');

    if (personId) {
      const parsedId = parseInt(personId, 10);
      if (!isNaN(parsedId) && (!activeEntityRef.current || activeEntityRef.current.id !== parsedId || activeEntityRef.current.type !== 'person')) {
        handleEntitySelect({ id: parsedId, name: 'Loading...', type: 'person' }, false);
      }
    } else if (companyId) {
      const parsedId = parseInt(companyId, 10);
      if (!isNaN(parsedId) && (!activeEntityRef.current || activeEntityRef.current.id !== parsedId || activeEntityRef.current.type !== 'company')) {
        handleEntitySelect({ id: parsedId, name: 'Loading...', type: 'company' }, false);
      }
    } else {
      // Revert to main explore view if no detail URL params are present
      if (activeEntityRef.current !== null || selectedEntity !== null) {
        activeEntityRef.current = null;
        lastEntityRef.current = null;
        setSelectedEntity(null);
        setEntityDetails(null);
        setIsBioExpanded(false);
        setEntityMedia([]);
        setError(null);
        setShowFilters(false);
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        const root = document.getElementById('root');
        if (root) root.scrollTop = 0;
      }
    }
  }, [searchParams, handleEntitySelect, selectedEntity]);

  useEffect(() => {
    const fetchDiscovery = async () => {
      setIsLoadingDiscovery(true);
      setError(null);

      try {
        const [directorsRes, trendingRes] = await Promise.all([
          Promise.all(
            VISIONARY_DIRECTORS_IDS.map(id =>
              getPersonDetails(id).catch(() => null)
            )
          ),
          getPopularPeople(1).catch(() => [])
        ]);

        const validDirectors = directorsRes.filter((p): p is NonNullable<typeof p> => p !== null);
        setVisionaryDirectors(validDirectors.map(p => ({
          id: p.id,
          name: p.name,
          image: p.profile_path ? `${TMDB_IMAGE_BASE}${p.profile_path}` : undefined,
          type: 'person',
          subtitle: 'VISIONARY'
        })));

        setPopularPeople(trendingRes.map(p => ({
          id: p.id,
          name: p.name,
          image: p.profile_path ? `${TMDB_IMAGE_BASE}${p.profile_path}` : undefined,
          type: 'person' as const,
          subtitle: p.known_for_department?.toUpperCase() || 'TALENT'
        })));

        setHasMoreTrending(trendingRes.length === 20);
      } catch (e) {
        console.error('Discovery error:', e);
        setError('Failed to load content');
      } finally {
        setIsLoadingDiscovery(false);
      }
    };

    fetchDiscovery();
  }, []);

  useEffect(() => {
    if (debouncedSearch.trim().length < 2) {
      setResults([]);
      return;
    }

    const performSearch = async () => {
      setIsSearching(true);
      setError(null);

      try {
        if (activeTab === 'people') {
          const res = await searchPeople(debouncedSearch);
          const mapped = res.map(p => ({
            id: p.id,
            name: p.name,
            image: p.profile_path ? `${TMDB_IMAGE_BASE}${p.profile_path}` : undefined,
            type: 'person' as const,
            subtitle: p.known_for_department?.toUpperCase() || 'TALENT'
          }));
          setResults(mapped);
        } else {
          const res = await searchCompanies(debouncedSearch);
          const mapped = res.map(c => ({
            id: c.id,
            name: c.name,
            image: c.logo_path ? `${TMDB_IMAGE_BASE}${c.logo_path}` : undefined,
            type: 'company' as const,
            subtitle: c.origin_country || 'STUDIO'
          }));
          setResults(mapped);
        }
      } catch (e) {
        console.error('Search error:', e);
        setError('Search failed');
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedSearch, activeTab]);

  const loadTrending = useCallback(async (page: number) => {
    if (isLoadingMoreTrending) return;

    setIsLoadingMoreTrending(true);
    try {
      const res = await getPopularPeople(page);
      const mapped = res.map(p => ({
        id: p.id,
        name: p.name,
        image: p.profile_path ? `${TMDB_IMAGE_BASE}${p.profile_path}` : undefined,
        type: 'person' as const,
        subtitle: p.known_for_department?.toUpperCase() || 'TALENT'
      }));

      setPopularPeople(prev => [...prev, ...mapped]);
      setTrendingPage(page);
      setHasMoreTrending(res.length === 20);
    } catch (e) {
      console.error('Trending error:', e);
      setError('Failed to load more');
    } finally {
      setIsLoadingMoreTrending(false);
    }
  }, [isLoadingMoreTrending]);

  const handleCloseEntity = useCallback(() => {
    // Cleanly delete entity params without blowing away tab or year params
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('personId');
    nextParams.delete('companyId');
    setSearchParams(nextParams, { replace: true });

    setSelectedEntity(null);
    lastEntityRef.current = null;
    activeEntityRef.current = null;
    setEntityDetails(null);
    setEntityMedia([]);
    setError(null);
    setIsLoadingDetails(false);

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const root = document.getElementById('root');
    if (root) root.scrollTop = 0;
  }, [searchParams, setSearchParams]);

  const handleResetFilters = useCallback(() => {
    setFilmoSearch('');
    setFilmoRole('all');
    setFilmoType('movie');
    setFilmoSort('popularity');
  }, []);

  const retryDiscovery = useCallback(() => {
    window.location.reload();
  }, []);

  const filteredMedia = useMemo(() => {
    let list = [...entityMedia];

    if (filmoType !== 'all') {
      list = list.filter(m => m.media_type === filmoType);
    }

    if (selectedEntity?.type === 'person' && filmoRole !== 'all') {
      list = list.filter(m => {
        const job = (m.job || '').toLowerCase();
        const character = (m.character || '').toLowerCase();
        const dept = (m.department || '').toLowerCase();

        switch (filmoRole) {
          case 'acting':
            return m.credit_category === 'cast' && !character.includes('self');
          case 'directed':
            return job === 'director';
          case 'produce':
            return dept === 'production';
          case 'creative':
            return dept === 'writing' || job.includes('consultant');
          case 'appearance':
            return character.includes('self') || character.includes('cameo');
          default:
            return true;
        }
      });
    }

    if (filmoSearch.trim()) {
      const q = filmoSearch.toLowerCase();
      list = list.filter(m => getMediaTitle(m).toLowerCase().includes(q));
    }

    const uniqueItems = new Map<number, MediaItem>();
    list.forEach(item => {
      if (!uniqueItems.has(item.id)) {
        uniqueItems.set(item.id, item);
      }
    });
    list = Array.from(uniqueItems.values());

    list.sort((a, b) => {
      if (filmoSort === 'rating') return (b.vote_average || 0) - (a.vote_average || 0);
      if (filmoSort === 'newest') {
        const dateA = a.release_date || a.first_air_date ? new Date(a.release_date || a.first_air_date).getTime() : 0;
        const dateB = b.release_date || b.first_air_date ? new Date(b.release_date || b.first_air_date).getTime() : 0;
        return dateB - dateA;
      }
      if (filmoSort === 'oldest') {
        const dateA = a.release_date || a.first_air_date ? new Date(a.release_date || a.first_air_date).getTime() : Infinity;
        const dateB = b.release_date || b.first_air_date ? new Date(b.release_date || b.first_air_date).getTime() : Infinity;
        return dateA - dateB;
      }
      if (filmoSort === 'all') {
        return 0; // Natural API / combined credits order
      }
      return (b.popularity || 0) - (a.popularity || 0);
    });

    return list;
  }, [entityMedia, filmoType, filmoSearch, filmoSort, filmoRole, selectedEntity]);

  const roleFilters: { id: FilmoRole; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All', icon: <Layers size={10} /> },
    { id: 'acting', label: 'Acting', icon: <UserCheck size={10} /> },
    { id: 'directed', label: 'Directed', icon: <Video size={10} /> },
    { id: 'produce', label: 'Produced', icon: <Briefcase size={10} /> },
    { id: 'appearance', label: 'Cameo', icon: <Eye size={10} /> },
    { id: 'creative', label: 'Creative', icon: <Info size={10} /> }
  ];

  return (
    <div className="pb-32 md:pb-40">
      <AnimatePresence>
        {error && (
          <div className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50">
            <ErrorAlert
              message={error}
              onRetry={selectedEntity ? undefined : retryDiscovery}
              onDismiss={() => setError(null)}
            />
          </div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-6 md:space-y-8">
        {!selectedEntity ? (
          <div
            key="explore-main"
            className="space-y-6 md:space-y-8 animate-in fade-in duration-150"
          >
              <header className="pt-2 md:pt-4 space-y-1">
                <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tighter italic text-white uppercase leading-none">
                  Explore
                </h1>
                <p className="text-zinc-600 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-[8px] md:text-[10px]">
                  Cinematic DNA & Origins
                </p>
              </header>

              {/* Pinned Favorite Talent Section */}
              {pinnedTalents.length > 0 && (
                <section className="space-y-3 md:space-y-4 bg-[#0d0d10]/90 border border-purple-500/30 rounded-2xl md:rounded-3xl p-4 md:p-6 backdrop-blur-xl relative overflow-hidden shadow-2xl shadow-purple-950/20">
                  <div className="absolute top-0 right-0 w-72 h-36 bg-purple-600/15 blur-3xl pointer-events-none" />
                  <div className="flex items-center justify-between relative z-10">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-purple-600/20 rounded-xl border border-purple-500/30 text-purple-400">
                        <Pin size={14} className="fill-purple-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="text-[10px] md:text-xs font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-white">
                            Pinned Talent
                          </h2>
                          <span className="text-[8px] md:text-[9px] font-black px-2 py-0.5 rounded-full bg-purple-600 text-white leading-none shadow-sm">
                            {pinnedTalents.length}
                          </span>
                        </div>
                        <p className="text-[7px] md:text-[8px] font-black text-zinc-500 uppercase tracking-widest mt-0.5">
                          Quick access to your starred actors, directors & creatives
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Scroll Navigation Arrows */}
                      <div className="hidden sm:flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5">
                        <button
                          type="button"
                          onClick={() => pinnedTalentScrollRef.current?.scrollBy({ left: -280, behavior: 'smooth' })}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                          title="Scroll left"
                          aria-label="Scroll left"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => pinnedTalentScrollRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 active:scale-95 transition-all"
                          title="Scroll right"
                          aria-label="Scroll right"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>

                      {pinnedTalents.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Unpin all favorite talent from explore?")) {
                              storeClearPinnedTalents();
                              useToastStore.getState().info("Cleared all pinned talent");
                            }
                          }}
                          className="text-[8px] font-black text-zinc-500 hover:text-red-400 uppercase tracking-widest transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                        >
                          Clear All
                        </button>
                      )}
                    </div>
                  </div>

                  <div
                    ref={pinnedTalentScrollRef}
                    className="flex gap-3 md:gap-4 overflow-x-auto no-scrollbar pb-1 pt-1 scroll-smooth"
                  >
                    <AnimatePresence mode="popLayout">
                      {pinnedTalents.filter(t => t && t.id).map((talent, idx) => (
                        <PinnedTalentCard
                          key={talent.id}
                          talent={talent}
                          onSelect={handleEntitySelect}
                          onUnpin={(id, e) => togglePinTalent({ id, name: talent.name }, e)}
                          index={idx}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </section>
              )}

              <section className="space-y-3 md:space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles size={11} className="text-purple-500" />
                  <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-zinc-600">
                    Master Studios
                  </h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 md:gap-3">
                  {FEATURED_STUDIOS.map(studio => (
                    <StudioCard key={studio.id} studio={studio} onSelect={handleEntitySelect} />
                  ))}
                </div>
              </section>

              <div className="space-y-3 md:space-y-4">
                {activeTab !== 'years' ? (
                  <div className="relative">
                    <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 text-zinc-700" size={16} />
                    <input
                      type="text"
                      placeholder="Search talent or studios..."
                      className="w-full h-12 md:h-16 bg-[#111]/60 backdrop-blur-xl border border-white/5 rounded-xl md:rounded-2xl pl-11 md:pl-14 pr-10 md:pr-12 text-sm md:text-lg font-bold focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all placeholder:text-zinc-800 italic"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-4 md:right-5 top-1/2 -translate-y-1/2 text-zinc-700 hover:text-zinc-500 transition-colors touch-manipulation"
                        aria-label="Clear search"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative z-40 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#111]/40 p-4 md:p-5 rounded-2xl border border-white/5 backdrop-blur-xl">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex flex-col gap-1.5">
                        <h2 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-zinc-500">
                          Select Release Year
                        </h2>

                        {/* Searchable Custom Year Dropdown */}
                        <div ref={dropdownRef} className={`relative w-40 transition-all duration-200 ${isYearDropdownOpen ? 'z-50' : 'z-30'}`}>
                          <button
                            type="button"
                            onClick={() => setIsYearDropdownOpen(!isYearDropdownOpen)}
                            className="w-full h-10 bg-zinc-900 border border-white/10 hover:border-purple-500/40 rounded-xl px-4 flex items-center justify-between text-xs font-bold text-white transition-all active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                          >
                            <span>{selectedYear}</span>
                            <ChevronDown size={14} className={`text-zinc-500 transition-transform ${isYearDropdownOpen ? 'rotate-180' : 'rotate-0'}`} />
                          </button>

                          {isYearDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-72 z-50 backdrop-blur-2xl">
                              <div className="p-2 border-b border-white/5 shrink-0 relative flex items-center">
                                <Search className="absolute left-4 text-zinc-500" size={12} />
                                <input
                                  type="text"
                                  placeholder="Search year..."
                                  value={yearSearchQuery}
                                  onChange={(e) => setYearSearchQuery(e.target.value)}
                                  className="w-full h-8 bg-zinc-900 border border-white/5 rounded-lg pl-8 pr-7 text-xs font-medium text-white focus:outline-none focus:border-purple-500/30"
                                />
                                {yearSearchQuery && (
                                  <button
                                    type="button"
                                    onClick={() => setYearSearchQuery('')}
                                    className="absolute right-4 text-zinc-500 hover:text-white transition-colors"
                                    aria-label="Clear search query"
                                  >
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                              <div className="overflow-y-auto flex-1 py-1 no-scrollbar">
                                {filteredYearsList.length > 0 ? (
                                  filteredYearsList.map((y) => (
                                    <button
                                      key={y}
                                      type="button"
                                      onClick={() => {
                                        setSelectedYear(y);
                                        setIsYearDropdownOpen(false);
                                        setYearSearchQuery('');
                                      }}
                                      className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors flex items-center justify-between outline-none focus:bg-purple-500/10 focus:text-white hover:bg-purple-500/10 hover:text-white ${
                                        selectedYear === y ? 'text-purple-400 bg-purple-500/5' : 'text-zinc-400'
                                      }`}
                                    >
                                      <span>{y}</span>
                                      {selectedYear === y && <Check size={10} className="text-purple-400" />}
                                    </button>
                                  ))
                                ) : (
                                  <div className="p-3 text-center text-[10px] font-black uppercase text-zinc-600">
                                    No Years Found
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Language Filter */}
                      <div className="flex flex-col gap-1.5">
                        <h2 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-zinc-500">
                          Origin / Language
                        </h2>

                        <div ref={languageDropdownRef} className={`relative w-44 transition-all duration-200 ${isLanguageDropdownOpen ? 'z-50' : 'z-20'}`}>
                          <button
                            type="button"
                            onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
                            className="w-full h-10 bg-zinc-900 border border-white/10 hover:border-purple-500/40 rounded-xl px-4 flex items-center justify-between text-xs font-bold text-white transition-all active:scale-[0.98] focus:outline-none focus:ring-1 focus:ring-purple-500/40"
                          >
                            <span className="flex items-center gap-1.5">
                              <Globe size={11} className="text-zinc-500" />
                              {
                                [
                                  { id: 'all', label: 'GLOBAL' },
                                  { id: 'en', label: 'HOLLYWOOD' },
                                  { id: 'hi', label: 'BOLLYWOOD' },
                                  { id: 'bn', label: 'BANGLA' },
                                  { id: 'fr', label: 'FRANCE' },
                                  { id: 'it', label: 'ITALIAN' },
                                  { id: 'ru', label: 'RUSSIAN' }
                                ].find(l => l.id === yearLanguage)?.label || 'GLOBAL'
                              }
                            </span>
                            <ChevronDown size={14} className={`text-zinc-500 transition-transform ${isLanguageDropdownOpen ? 'rotate-180' : 'rotate-0'}`} />
                          </button>

                          {isLanguageDropdownOpen && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-zinc-950 border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-50 backdrop-blur-2xl">
                              <div className="overflow-y-auto max-h-72 py-1 no-scrollbar">
                                {[
                                  { id: 'all', label: 'GLOBAL' },
                                  { id: 'en', label: 'HOLLYWOOD' },
                                  { id: 'hi', label: 'BOLLYWOOD' },
                                  { id: 'bn', label: 'BANGLA' },
                                  { id: 'fr', label: 'FRANCE' },
                                  { id: 'it', label: 'ITALIAN' },
                                  { id: 'ru', label: 'RUSSIAN' }
                                ].map((lang) => (
                                  <button
                                    key={lang.id}
                                    type="button"
                                    onClick={() => {
                                      setYearLanguage(lang.id);
                                      setIsLanguageDropdownOpen(false);
                                    }}
                                    className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors flex items-center justify-between outline-none focus:bg-purple-500/10 focus:text-white hover:bg-purple-500/10 hover:text-white ${
                                      yearLanguage === lang.id ? 'text-purple-400 bg-purple-500/5' : 'text-zinc-400'
                                    }`}
                                  >
                                    <span>{lang.label}</span>
                                    {yearLanguage === lang.id && <Check size={10} className="text-purple-400" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      <h2 className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-zinc-500">
                        Media Format
                      </h2>
                      <div className="flex bg-zinc-950 p-1 rounded-xl border border-white/5 w-64 md:w-72">
                        <button
                          onClick={() => setYearMediaType('all')}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation ${
                            yearMediaType === 'all' ? 'bg-purple-500 text-white' : 'text-zinc-600 hover:text-zinc-400'
                          }`}
                        >
                          <Layers size={11} /> <span>All</span>
                        </button>
                        <button
                          onClick={() => setYearMediaType('movie')}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation ${
                            yearMediaType === 'movie' ? 'bg-purple-500 text-white' : 'text-zinc-600 hover:text-zinc-400'
                          }`}
                        >
                          <Film size={11} /> <span>Movies</span>
                        </button>
                        <button
                          onClick={() => setYearMediaType('tv')}
                          className={`flex-1 flex items-center justify-center gap-1 py-2 px-2 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation ${
                            yearMediaType === 'tv' ? 'bg-purple-500 text-white' : 'text-zinc-600 hover:text-zinc-400'
                          }`}
                        >
                          <Tv size={11} /> <span>TV Series</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex bg-[#111]/40 p-1 rounded-lg border border-white/5 max-w-sm">
                  <button
                    onClick={() => {
                      setActiveTab('people');
                      const params = new URLSearchParams(searchParams);
                      params.set('tab', 'people');
                      setSearchParams(params, { replace: true });
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation ${
                      activeTab === 'people' ? 'bg-white/10 text-white' : 'text-zinc-600'
                    }`}
                  >
                    <Users size={11} /> <span>Talent</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('companies');
                      const params = new URLSearchParams(searchParams);
                      params.set('tab', 'companies');
                      setSearchParams(params, { replace: true });
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation ${
                      activeTab === 'companies' ? 'bg-white/10 text-white' : 'text-zinc-600'
                    }`}
                  >
                    <Building2 size={11} /> <span>Studios</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveTab('years');
                      const params = new URLSearchParams(searchParams);
                      params.set('tab', 'years');
                      params.set('year', selectedYear.toString());
                      params.set('mediaType', yearMediaType);
                      setSearchParams(params, { replace: true });
                    }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-[8px] md:text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation ${
                      activeTab === 'years' ? 'bg-white/10 text-white' : 'text-zinc-600'
                    }`}
                  >
                    <Calendar size={11} /> <span>By Year</span>
                  </button>
                </div>
              </div>

              {activeTab === 'years' ? (
                <div className="space-y-6">
                  {yearError ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                      <AlertCircle className="text-red-500" size={32} />
                      <p className="text-xs font-medium text-zinc-400">{yearError}</p>
                      <button
                        onClick={() => loadYearResults(yearPage, false)}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-black uppercase tracking-widest text-white transition-all active:scale-95"
                      >
                        Retry
                      </button>
                    </div>
                  ) : isLoadingYearResults && yearPage === 1 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 animate-pulse">
                      {[...Array(12)].map((_, i) => (
                        <div key={i} className="space-y-3">
                          <div className="aspect-[2/3] bg-zinc-900 rounded-2xl border border-white/5" />
                          <div className="h-3 bg-zinc-900 rounded w-3/4" />
                          <div className="h-2 bg-zinc-900 rounded w-1/2" />
                        </div>
                      ))}
                    </div>
                  ) : yearResults.length > 0 ? (
                    <>
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[8px] md:text-[9px] font-black text-zinc-600 uppercase tracking-[0.25em]">
                          Released in {selectedYear} • {yearMediaType === 'all' ? 'All Media' : yearMediaType === 'movie' ? 'Movies' : 'TV Shows'}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {yearResults.map((item, idx) => (
                          <YearMediaCard
                            key={`${item.id}-${idx}`}
                            item={item}
                            onClick={() => navigate(`/add-entry?id=${item.id}&type=${item.media_type || 'movie'}`, { state: { from: location.pathname + location.search } })}
                            index={idx}
                          />
                        ))}
                      </div>

                      {yearPage < totalYearPages && (
                        <div ref={yearSentinelRef} className="py-8 flex justify-center w-full">
                          {isLoadingYearResults && (
                            <Loader2 className="animate-spin text-purple-500" size={24} />
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <EmptyState
                      icon={<Search size={28} strokeWidth={1.5} />}
                      title="No Results Found"
                      description={`No ${yearMediaType === 'all' ? 'media titles' : yearMediaType === 'movie' ? 'movies' : 'TV shows'} released in ${selectedYear} could be retrieved.`}
                    />
                  )}
                </div>
              ) : debouncedSearch.trim().length >= 2 ? (
                <div className="space-y-4">
                  {isSearching ? (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                      {[...Array(10)].map((_, i) => <CardSkeleton key={i} />)}
                    </div>
                  ) : results.length > 0 ? (
                    <>
                      <p className="text-[8px] md:text-[9px] font-black text-zinc-600 uppercase tracking-[0.25em] px-1">
                        {results.length} Result{results.length !== 1 ? 's' : ''}
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                        {results.map((entity, idx) => (
                          <EntityCard
                            key={entity.id}
                            entity={entity}
                            onClick={() => handleEntitySelect(entity)}
                            index={idx}
                            isPinned={isTalentPinned(entity.id)}
                            onTogglePin={(e) => togglePinTalent(entity, e)}
                          />
                        ))}
                      </div>
                    </>
                  ) : (
                    <EmptyState
                      icon={<Search size={28} strokeWidth={1.5} />}
                      title="No Results"
                      description={`No ${activeTab} found for "${debouncedSearch}"`}
                      action={{ label: 'Clear Search', onClick: () => setSearchQuery('') }}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-8 md:space-y-12">
                  {isLoadingDiscovery ? (
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-4">
                      {[...Array(6)].map((_, i) => <CardSkeleton key={i} />)}
                    </div>
                  ) : visionaryDirectors.length > 0 && (
                    <section className="space-y-3 md:space-y-4">
                      <div className="flex items-center gap-2">
                        <Camera size={11} className="text-purple-400" />
                        <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-zinc-600">
                          Visionaries
                        </h2>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
                        {visionaryDirectors.map((director, idx) => (
                          <EntityCard
                            key={director.id}
                            entity={director}
                            onClick={() => handleEntitySelect(director)}
                            index={idx}
                            isPinned={isTalentPinned(director.id)}
                            onTogglePin={(e) => togglePinTalent(director, e)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="space-y-3 md:space-y-4">
                    <div className="flex items-center gap-2">
                      <Flame size={11} className="text-orange-500" />
                      <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-zinc-600">
                        Trending Now
                      </h2>
                    </div>

                    {isLoadingDiscovery ? (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                        {[...Array(10)].map((_, i) => <CardSkeleton key={i} />)}
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                          {popularPeople.map((person, idx) => (
                            <EntityCard
                              key={`${person.id}-${idx}`}
                              entity={person}
                              onClick={() => handleEntitySelect(person)}
                              index={idx}
                              isPinned={isTalentPinned(person.id)}
                              onTogglePin={(e) => togglePinTalent(person, e)}
                            />
                          ))}
                        </div>

                        {hasMoreTrending && (
                          <div ref={sentinelRef} className="py-4">
                            {isLoadingMoreTrending && (
                              <div className="flex justify-center">
                                <Loader2 className="animate-spin text-purple-500" size={20} />
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </section>
                </div>
              )}
            </div>
          ) : currentEntity ? (
            <div
              key="entity-detail"
              className="relative space-y-6 md:space-y-8 animate-in fade-in duration-150"
            >
              {/* Ambient Cinematic Backdrop */}
              {(() => {
                const firstPoster = entityMedia.find(m => m.poster_path)?.poster_path;
                const backdropUrl = firstPoster ? `${TMDB_IMAGE_BASE}${firstPoster}` : currentEntity.image;
                return (
                  <div className="absolute top-0 left-0 right-0 h-[450px] overflow-hidden pointer-events-none select-none z-0">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#09090b]/10 via-[#09090b]/60 to-[#09090b] z-10" />
                    {backdropUrl && (
                      <img
                        src={backdropUrl}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover blur-3xl opacity-[0.15] scale-110"
                        alt=""
                      />
                    )}
                  </div>
                );
              })()}

              {/* Floating Glass Header */}
              <div className="relative z-10 flex items-center justify-between py-2 border-b border-white/[0.04] pb-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleCloseEntity}
                    className="flex items-center gap-2 px-3 py-2.5 bg-zinc-900/90 hover:bg-zinc-800 backdrop-blur rounded-xl border border-white/10 hover:border-purple-500/40 active:scale-95 transition-all text-zinc-300 hover:text-white touch-manipulation group"
                    aria-label="Back to Explore"
                  >
                    <ChevronLeft size={16} className="text-purple-400 group-hover:-translate-x-0.5 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Back</span>
                  </button>
                  <div className="min-w-0">
                    <p className="text-purple-500 font-black uppercase tracking-[0.3em] text-[7px] md:text-[8px] mb-0.5">
                      {currentEntity.type === 'person' ? 'Filmography Archive' : 'Studio Slate & Portfolio'}
                    </p>
                    <div className="flex items-center gap-2">
                      <h2
                        onClick={() => {
                          navigator.clipboard.writeText(currentEntity.name);
                          toast.success(`Copied: "${currentEntity.name}"`);
                        }}
                        className="text-xl md:text-4xl font-black tracking-tighter italic text-white uppercase leading-tight truncate cursor-pointer hover:text-purple-300 transition-colors select-text"
                        title="Click to copy name"
                      >
                        {currentEntity.name}
                      </h2>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(currentEntity.name);
                          toast.success(`Copied: "${currentEntity.name}"`);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-900/80 hover:bg-purple-600 text-zinc-400 hover:text-white border border-white/10 transition-colors active:scale-95 shrink-0"
                        title={`Copy ${currentEntity.name}`}
                        aria-label={`Copy ${currentEntity.name}`}
                      >
                        <Copy size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {currentEntity.type === 'person' && (
                    <button
                      onClick={(e) => togglePinTalent(currentEntity, e)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all active:scale-95 touch-manipulation ${
                        isTalentPinned(currentEntity.id)
                          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/40 border border-purple-400/40'
                          : 'bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/5'
                      }`}
                      title={isTalentPinned(currentEntity.id) ? "Unpin talent from top" : "Pin talent to top"}
                    >
                      <Pin size={12} className={isTalentPinned(currentEntity.id) ? "fill-white" : ""} />
                      <span className="hidden sm:inline">{isTalentPinned(currentEntity.id) ? 'Pinned to Top' : 'Pin to Top'}</span>
                    </button>
                  )}
                  {/* Close Button / Shortcut indicator */}
                  <button
                    onClick={handleCloseEntity}
                    className="hidden md:flex items-center gap-1.5 px-3 py-2 bg-zinc-900/60 hover:bg-zinc-900 rounded-xl text-[9px] font-black uppercase tracking-wider text-zinc-500 hover:text-white border border-white/5 transition-colors"
                  >
                    Close Profile <X size={10} />
                  </button>
                </div>
              </div>

              {/* Main Content Area: Split 2 columns on desktop */}
              <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

                {/* Left Column: Profile Card, Bio and Stats Bento (span 4) */}
                <div className="lg:col-span-4 space-y-6">

                  {/* Portrait / Logo main showcase */}
                  <div className="bg-[#0c0c0e] border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl relative group">
                    <div className="aspect-[4/5] relative overflow-hidden bg-zinc-900">
                      {currentEntity.image ? (
                        <img
                          src={currentEntity.image}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover grayscale brightness-90 group-hover:grayscale-0 group-hover:brightness-100 transition-all duration-700 ease-out group-hover:scale-[1.03]"
                          alt={currentEntity.name}
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-zinc-700 bg-white/[0.02]">
                          {currentEntity.type === 'person' ? <Users size={48} /> : <Building2 size={48} />}
                          <span className="text-[10px] font-black uppercase tracking-widest mt-2">No Portrait</span>
                        </div>
                      )}

                      {/* Gradient overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none" />

                      {/* Subtitle / Department tag */}
                      <div className="absolute top-4 right-4 px-3 py-1 bg-purple-600/90 backdrop-blur-md border border-purple-500/30 rounded-full">
                        <span className="text-[7px] md:text-[8px] font-black text-white uppercase tracking-widest">
                          {currentEntity.type === 'person' ? 'TALENT' : 'STUDIO'}
                        </span>
                      </div>

                      {/* Name overlay at the bottom */}
                      <div className="absolute bottom-6 left-6 right-6 space-y-1 z-20 pointer-events-auto">
                        <h3
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(currentEntity.name);
                            toast.success(`Copied: "${currentEntity.name}"`);
                          }}
                          className="text-xl font-black text-white uppercase italic tracking-tight line-clamp-2 cursor-pointer hover:text-purple-300 transition-colors select-text flex items-center gap-2 group/portraitname"
                          title="Click to copy name"
                        >
                          <span>{currentEntity.name}</span>
                          <Copy size={14} className="opacity-0 group-hover/portraitname:opacity-100 text-purple-400 transition-opacity shrink-0" />
                        </h3>
                        {currentEntity.subtitle && (
                          <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest pointer-events-none">
                            {currentEntity.subtitle}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pin / Unpin Action for Talent */}
                  {currentEntity.type === 'person' && (
                    <button
                      onClick={(e) => togglePinTalent(currentEntity, e)}
                      className={`w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-[0.98] shadow-xl ${
                        isTalentPinned(currentEntity.id)
                          ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/30 border border-purple-400/40'
                          : 'bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-white/10 hover:border-purple-500/40'
                      }`}
                    >
                      <Pin size={14} className={isTalentPinned(currentEntity.id) ? 'fill-white' : ''} />
                      {isTalentPinned(currentEntity.id) ? 'Pinned to Top of Explore' : 'Pin Talent to Top of Explore'}
                    </button>
                  )}

                  {/* Biography Bento Card */}
                  {(() => {
                    const bio = entityDetails?.biography || entityDetails?.description;
                    if (!bio) return null;
                    const isLong = bio.length > 250;
                    const displayBio = isBioExpanded ? bio : (isLong ? bio.substring(0, 250) + "..." : bio);
                    return (
                      <div className="bg-[#0c0c0e] border border-white/5 rounded-[2rem] p-6 space-y-3 shadow-xl">
                        <div className="flex items-center justify-between border-b border-white/[0.04] pb-2">
                          <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                            {currentEntity.type === 'person' ? 'Biography' : 'About the Studio'}
                          </p>
                          <Sparkles size={11} className="text-purple-500" />
                        </div>
                        <p className="text-xs text-zinc-400 font-medium leading-relaxed whitespace-pre-line">
                          {displayBio}
                        </p>
                        {isLong && (
                          <button
                            onClick={() => setIsBioExpanded(!isBioExpanded)}
                            className="text-[9px] font-black text-purple-400 uppercase tracking-widest hover:text-purple-300 transition-colors focus:outline-none block pt-1"
                          >
                            {isBioExpanded ? 'Read Less ▲' : 'Read Full Bio ▼'}
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {/* Fact Sheet / Stats Bento Card */}
                  <div className="bg-[#0c0c0e] border border-white/5 rounded-[2rem] p-6 space-y-4 shadow-xl">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest border-b border-white/[0.04] pb-2">
                      Cinematic Profile
                    </p>

                    {(() => {
                      const list = entityMedia || [];
                      const withRating = list.filter(m => m.vote_average && m.vote_average > 0);
                      const avgRating = withRating.length > 0
                        ? withRating.reduce((sum, m) => sum + (m.vote_average || 0), 0) / withRating.length
                        : 0;

                      const movieCount = list.filter(m => m.media_type === 'movie').length;
                      const tvCount = list.filter(m => m.media_type === 'tv').length;
                      const moviePct = list.length > 0 ? Math.round((movieCount / list.length) * 100) : 0;
                      const tvPct = list.length > 0 ? Math.round((tvCount / list.length) * 100) : 0;

                      return (
                        <>
                          <div className="grid grid-cols-2 gap-4">
                            {/* Stat 1: Total Credits */}
                            <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl space-y-1">
                              <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider">Credits Count</p>
                              <p className="text-xl font-black text-white italic tracking-tighter tabular-nums">
                                {list.length}
                              </p>
                            </div>

                            {/* Stat 2: Rating */}
                            {avgRating > 0 && (
                              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl space-y-1">
                                <div className="flex items-center gap-1">
                                  <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider">Critical Score</p>
                                  <Star size={9} className="text-yellow-500 fill-yellow-500" />
                                </div>
                                <p className="text-xl font-black text-yellow-500 italic tracking-tighter tabular-nums">
                                  {avgRating.toFixed(1)}<span className="text-[10px] text-zinc-500 font-bold">/10</span>
                                </p>
                              </div>
                            )}

                            {/* Stat 3: Film Split */}
                            {list.length > 0 && (
                              <div className="p-3 bg-white/[0.02] border border-white/5 rounded-2xl space-y-1 col-span-2">
                                <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider">Production Focus</p>
                                <div className="flex items-center justify-between text-[11px] font-bold text-zinc-300">
                                  <span>Films ({moviePct}%)</span>
                                  <span>TV ({tvPct}%)</span>
                                </div>
                                <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden flex">
                                  <div className="bg-purple-500 h-full" style={{ width: `${moviePct}%` }} />
                                  <div className="bg-blue-500 h-full" style={{ width: `${tvPct}%` }} />
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}

                    {/* Metadata Items */}
                    <div className="space-y-3 pt-2 text-xs">
                      {entityDetails?.birthday && (
                        <div className="flex items-center gap-3 text-zinc-400">
                          <Calendar size={13} className="text-purple-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider">Born</p>
                            <p className="font-bold">
                              {entityDetails.birthday}
                              {entityDetails.deathday && ` — Died ${entityDetails.deathday}`}
                            </p>
                          </div>
                        </div>
                      )}

                      {entityDetails?.place_of_birth && (
                        <div className="flex items-center gap-3 text-zinc-400">
                          <MapPin size={13} className="text-purple-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider">Place of Birth</p>
                            <p className="font-bold truncate">{entityDetails.place_of_birth}</p>
                          </div>
                        </div>
                      )}

                      {entityDetails?.headquarters && (
                        <div className="flex items-center gap-3 text-zinc-400">
                          <MapPin size={13} className="text-purple-400" />
                          <div className="min-w-0 flex-1">
                            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider">Headquarters</p>
                            <p className="font-bold truncate">{entityDetails.headquarters}</p>
                          </div>
                        </div>
                      )}

                      {entityDetails?.homepage && (
                        <div className="pt-2">
                          <a
                            href={entityDetails.homepage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-zinc-900 hover:bg-zinc-850 border border-white/5 hover:border-white/10 rounded-xl font-black text-[9px] uppercase tracking-widest text-zinc-300 hover:text-white transition-all"
                          >
                            <Globe size={11} /> Visit Official Website <ArrowUpRight size={11} />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* Right Column: Dynamic Credits slate with high-end Filters (span 8) */}
                <div className="lg:col-span-8 space-y-6">

                  {/* Credits Search and Filters Bar */}
                  <div className="bg-[#0c0c0e] border border-white/5 rounded-[2rem] p-6 space-y-4 shadow-xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-black text-white uppercase italic tracking-tight">
                          Filmography Slate
                        </h3>
                        <p className="text-[8px] md:text-[9px] font-black text-zinc-500 uppercase tracking-[0.25em] mt-0.5">
                          {filteredMedia.length} Credit{filteredMedia.length !== 1 ? 's' : ''} on record
                        </p>
                      </div>

                      {/* Search Credits Bar */}
                      <div className="relative flex-1 max-w-md w-full">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                        <input
                          type="text"
                          placeholder="Search title..."
                          value={filmoSearch}
                          onChange={(e) => setFilmoSearch(e.target.value)}
                          className="w-full bg-[#111] border border-white/5 rounded-xl pl-9 pr-9 py-2 md:py-2.5 text-[9px] md:text-[10px] font-black uppercase tracking-widest outline-none focus:ring-1 focus:ring-purple-500/20 transition-all placeholder:text-zinc-700 italic"
                        />
                        {filmoSearch && (
                          <button onClick={() => setFilmoSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 touch-manipulation">
                            <X size={12} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Desktop & Mobile Filters */}
                    <div className="space-y-3 pt-2 border-t border-white/[0.04]">
                      {currentEntity.type === 'person' && (
                        <div className="space-y-1.5">
                          <p className="text-[8px] font-black text-zinc-600 uppercase tracking-wider">Role filter</p>
                          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                            <div className="flex gap-1.5 p-1 bg-[#111] rounded-lg border border-white/5">
                              {roleFilters.map(r => (
                                <FilterChip key={r.id} active={filmoRole === r.id} onClick={() => setFilmoRole(r.id)} icon={r.icon} label={r.label} />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-4 items-center justify-between">
                        {/* Type & Sort chip groups */}
                        <div className="flex flex-wrap gap-3">
                          <div className="space-y-1">
                            <p className="text-[7px] font-black text-zinc-600 uppercase tracking-wider">Medium</p>
                            <div className="flex gap-1.5 p-1 bg-[#111] rounded-lg border border-white/5">
                              <FilterChip active={filmoType === 'movie'} onClick={() => setFilmoType('movie')} icon={<Film size={9} />} label="Films" />
                              <FilterChip active={filmoType === 'tv'} onClick={() => setFilmoType('tv')} icon={<Tv size={9} />} label="TV" />
                              <FilterChip active={filmoType === 'all'} onClick={() => setFilmoType('all')} icon={<Layers size={9} />} label="All" />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-[7px] font-black text-zinc-600 uppercase tracking-wider">Sort</p>
                            <div className="flex flex-wrap gap-1.5 p-1 bg-[#111] rounded-lg border border-white/5">
                              <FilterChip active={filmoSort === 'all'} onClick={() => setFilmoSort('all')} label="All" />
                              <FilterChip active={filmoSort === 'popularity'} onClick={() => setFilmoSort('popularity')} icon={<TrendingUp size={9} />} label="Popular" />
                              <FilterChip active={filmoSort === 'rating'} onClick={() => setFilmoSort('rating')} icon={<Award size={9} />} label="Rated" />
                              <FilterChip active={filmoSort === 'newest'} onClick={() => setFilmoSort('newest')} label="Newest" />
                              <FilterChip active={filmoSort === 'oldest'} onClick={() => setFilmoSort('oldest')} label="Oldest" />
                            </div>
                          </div>
                        </div>

                        {/* Layout mode & reset button */}
                        <div className="flex items-end gap-3 self-end h-full">
                          <div className="space-y-1">
                            <p className="text-[7px] font-black text-zinc-600 uppercase tracking-wider text-right">Layout</p>
                            <div className="flex gap-1 p-1 bg-[#111] rounded-lg border border-white/5">
                              <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                                aria-label="Grid view"
                              >
                                <Grid3x3 size={11} />
                              </button>
                              <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white/10 text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                                aria-label="List view"
                              >
                                <List size={11} />
                              </button>
                            </div>
                          </div>

                          {(filmoSearch || filmoRole !== 'all' || filmoType !== 'movie' || filmoSort !== 'popularity') && (
                            <button
                              onClick={handleResetFilters}
                              className="px-3 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-[8px] font-black uppercase tracking-widest text-white hover:scale-[1.02] active:scale-[0.98] transition-all h-[27px]"
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>

                  {/* Credits Grid/List layout */}
                  {isLoadingDetails ? (
                    <div className={viewMode === 'grid'
                      ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
                      : "flex flex-col gap-2.5 w-full"
                    }>
                      {[...Array(12)].map((_, i) =>
                        viewMode === 'grid' ? <MediaCardSkeleton key={i} /> : <ListItemSkeleton key={i} />
                      )}
                    </div>
                  ) : filteredMedia.length > 0 ? (
                    <motion.div
                      layout
                      className={viewMode === 'grid'
                        ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4"
                        : "flex flex-col gap-2.5 w-full"
                      }
                    >
                      {filteredMedia.map((item, idx) => (
                        <MediaCard
                          key={`${item.id}-${item.credit_id || idx}`}
                          item={item}
                          onClick={() => navigate(`/add-entry?id=${item.id}&type=${item.media_type || 'movie'}`, { state: { from: location.pathname + location.search } })}
                          index={idx}
                          viewMode={viewMode}
                        />
                      ))}
                    </motion.div>
                  ) : (
                    <EmptyState
                      icon={<ListFilter size={28} strokeWidth={1.5} />}
                      title={filmoSearch ? 'No Matches Found' : 'No Credits Available'}
                      description={filmoSearch ? `No titles matching "${filmoSearch}" in this slate.` : 'Try adjusting the filter configurations.'}
                      action={{ label: 'Reset Active Filters', onClick: handleResetFilters }}
                    />
                  )}

                </div>

              </div>
            </div>
          ) : null}
      </div>
    </div>
  );
};

export default ExplorePage;
