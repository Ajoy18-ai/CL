import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, X, Info, Sparkles, Film, Tv, Star, Eye } from 'lucide-react';
import { BacklogCandidate, Rating } from '../types';
import { RATING_CONFIG } from '../constants';

const RATINGS_LIST = [
  { id: Rating.BAD, label: 'BAD' },
  { id: Rating.MID, label: 'MID' },
  { id: Rating.GOOD, label: 'GOOD' },
  { id: Rating.PEAK, label: 'PEAK' }
];

export interface AlbumRailProps {
  items?: BacklogCandidate[];
  activeIndex?: number;
  onActiveIndexChange?: (index: number) => void;
  onSelect?: (item: BacklogCandidate) => void;
  onSwipeLeft?: (item: BacklogCandidate) => void; // Skip
  onSwipeRight?: (item: BacklogCandidate) => void; // Mark as watched
  onRateWatched?: (item: BacklogCandidate, rating: Rating | null) => void; // Quick rate & mark watched
  className?: string;
  showDetailsButton?: boolean;
}

// Default fallback items if AlbumRail is used without props: <AlbumRail />
const DEFAULT_ALBUM_ITEMS: BacklogCandidate[] = [
  {
    id: 'movie_278',
    tmdbId: 278,
    type: 'movie',
    title: 'The Shawshank Redemption',
    posterUrl: 'https://image.tmdb.org/t/p/w500/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg',
    releaseYear: '1994',
    overview: 'Two imprisoned men bond over a number of years, finding solace and eventual redemption through acts of common decency.',
    originalLanguage: 'en',
    genres: ['Drama', 'Crime'],
    voteAverage: 8.7,
    voteCount: 26000,
    popularity: 140,
    historicalScore: 99,
    category: 'classic'
  },
  {
    id: 'movie_238',
    tmdbId: 238,
    type: 'movie',
    title: 'The Godfather',
    posterUrl: 'https://image.tmdb.org/t/p/w500/3bhkrj58Vtu7enYsRolD1fZdja1.jpg',
    releaseYear: '1972',
    overview: 'Spanning the years 1945 to 1955, a chronicle of the fictional Italian-American Corleone crime family.',
    originalLanguage: 'en',
    genres: ['Drama', 'Crime'],
    voteAverage: 8.7,
    voteCount: 20000,
    popularity: 130,
    historicalScore: 98,
    category: 'classic'
  },
  {
    id: 'movie_155',
    tmdbId: 155,
    type: 'movie',
    title: 'The Dark Knight',
    posterUrl: 'https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg',
    releaseYear: '2008',
    overview: 'Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and DA Harvey Dent.',
    originalLanguage: 'en',
    genres: ['Action', 'Crime', 'Drama'],
    voteAverage: 8.5,
    voteCount: 32000,
    popularity: 125,
    historicalScore: 97,
    category: 'hollywood'
  },
  {
    id: 'movie_20453',
    tmdbId: 20453,
    type: 'movie',
    title: '3 Idiots',
    posterUrl: 'https://image.tmdb.org/t/p/w500/66A9MqX3ZIIUnASVa2vs0Swz6FA.jpg',
    releaseYear: '2009',
    overview: 'Two friends search for their long lost companion while reminiscing over their college days and a friend who inspired them to think differently.',
    originalLanguage: 'hi',
    genres: ['Comedy', 'Drama'],
    voteAverage: 8.0,
    voteCount: 2200,
    popularity: 45,
    historicalScore: 95,
    category: 'bollywood'
  },
  {
    id: 'tv_1396_s1',
    tmdbId: 1396,
    type: 'tv',
    title: 'Breaking Bad — Season 1',
    posterUrl: 'https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg',
    releaseYear: '2008',
    overview: 'A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine.',
    originalLanguage: 'en',
    genres: ['Crime', 'Drama'],
    voteAverage: 8.9,
    voteCount: 14000,
    popularity: 160,
    historicalScore: 98,
    seasonNumber: 1,
    seasonName: 'Season 1',
    category: 'english_tv'
  }
];

export const AlbumRail: React.FC<AlbumRailProps> = ({
  items = DEFAULT_ALBUM_ITEMS,
  activeIndex: controlledIndex,
  onActiveIndexChange,
  onSelect,
  onSwipeLeft,
  onSwipeRight,
  onRateWatched,
  className = '',
  showDetailsButton = true
}) => {
  const [internalIndex, setInternalIndex] = useState(0);
  const activeIndex = controlledIndex !== undefined ? controlledIndex : internalIndex;

  const setActiveIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(items.length - 1, idx));
    if (controlledIndex === undefined) {
      setInternalIndex(clamped);
    }
    if (onActiveIndexChange) {
      onActiveIndexChange(clamped);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);

  // Active rating state for tactile feedback
  const [activeRating, setActiveRating] = useState<Rating | null>(null);

  useEffect(() => {
    setActiveRating(null);
  }, [activeIndex]);

  // Swipe gesture tracking state
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;
  const isSmallMobile = windowWidth < 420;

  // Handle touch events on mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = null;
    setIsDragging(true);
    setDragOffset(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touchStartXRef.current;
    const deltaY = currentY - touchStartYRef.current;

    // Detect if the user is swiping horizontally or vertically
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        isHorizontalSwipeRef.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalSwipeRef.current) {
      // Prevent default page scroll during horizontal swipe
      if (e.cancelable) e.preventDefault();
      setDragOffset(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    // Dynamic swipe threshold (50px on mobile for effortless flicking, 75px on desktop)
    const SWIPE_THRESHOLD = isMobile ? 50 : 75;
    if (dragOffset < -SWIPE_THRESHOLD && onSwipeLeft && currentItem) {
      // Swiped Left -> Skip
      onSwipeLeft(currentItem);
    } else if (dragOffset > SWIPE_THRESHOLD && currentItem) {
      // Swiped Right -> Watched with selected activeRating
      if (onRateWatched) {
        onRateWatched(currentItem, activeRating);
      } else if (onSwipeRight) {
        onSwipeRight(currentItem);
      }
      setActiveRating(null);
    } else if (Math.abs(dragOffset) > 35) {
      // Minor drag navigation if no action triggered
      if (dragOffset < 0 && activeIndex < items.length - 1) {
        setActiveIndex(activeIndex + 1);
      } else if (dragOffset > 0 && activeIndex > 0) {
        setActiveIndex(activeIndex - 1);
      }
    }

    setDragOffset(0);
    isHorizontalSwipeRef.current = null;
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Do not trigger if typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveIndex(activeIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveIndex(activeIndex + 1);
      } else if (e.key === 'Enter' || e.key === ' ') {
        const current = items[activeIndex];
        if (current && onSelect) {
          e.preventDefault();
          onSelect(current);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, items, onSelect]);

  // Desktop mouse wheel horizontal navigation
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      if (e.deltaX > 25 && activeIndex < items.length - 1) {
        setActiveIndex(activeIndex + 1);
      } else if (e.deltaX < -25 && activeIndex > 0) {
        setActiveIndex(activeIndex - 1);
      }
    }
  }, [activeIndex, items.length]);

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Sparkles size={40} className="text-purple-400 mb-4 animate-pulse" />
        <h3 className="text-xl font-black text-white italic uppercase tracking-wider">All Caught Up!</h3>
        <p className="text-sm text-zinc-400 max-w-sm mt-2">
          You have reviewed all available candidates in this session. Revisit skipped titles or refresh your discovery pool.
        </p>
      </div>
    );
  }

  const currentItem = items[activeIndex];

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      className={`relative select-none w-full max-w-5xl mx-auto flex flex-col items-center justify-center py-6 overflow-hidden ${className}`}
    >
      {/* 3D Rail Fan Stage */}
      <div
        className="relative w-full h-[450px] xs:h-[490px] md:h-[550px] flex items-center justify-center cursor-grab active:cursor-grabbing touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ perspective: isSmallMobile ? 1000 : 1200 }}
      >
        {items.map((item, idx) => {
          const offset = idx - activeIndex;
          const isCurrent = idx === activeIndex;
          const isVisible = Math.abs(offset) <= 3; // Keep viewport lean

          if (!isVisible) return null;

          // Compute 3D translation & rotation around active item
          const stepOffset = isSmallMobile ? 100 : isMobile ? 135 : 190;
          const translateX = offset * stepOffset + (isCurrent ? dragOffset : 0);
          const rotateY = offset * -18;
          const scale = isCurrent ? 1 : Math.max(0.72, 1 - Math.abs(offset) * 0.12);
          const zIndex = 30 - Math.abs(offset) * 5;
          const opacity = isCurrent ? 1 : Math.max(0.3, 1 - Math.abs(offset) * 0.28);

          return (
            <motion.div
              key={item.id}
              onClick={() => {
                if (isCurrent && onSelect) {
                  onSelect(item);
                } else {
                  setActiveIndex(idx);
                }
              }}
              style={{
                position: 'absolute',
                transformStyle: 'preserve-3d',
                zIndex,
                filter: isCurrent ? 'drop-shadow(0 20px 40px rgba(0,0,0,0.8))' : 'drop-shadow(0 10px 25px rgba(0,0,0,0.6))'
              }}
              animate={{
                x: translateX,
                scale,
                rotateY,
                opacity,
              }}
              transition={{
                type: 'spring',
                stiffness: 280,
                damping: 28
              }}
              className="group cursor-pointer"
            >
              {/* ALBUM SLEEVE CONTAINER */}
              <div className="relative w-[270px] xs:w-[295px] sm:w-[325px] md:w-[350px] aspect-[2/3] rounded-2xl p-1 bg-gradient-to-br from-white/15 via-white/5 to-black/40 border border-white/15 shadow-2xl backdrop-blur-md overflow-hidden transition-transform duration-300">

                {/* POSTER CARD (Front of the Sleeve Jacket) */}
                <div className="relative w-full h-full rounded-xl overflow-hidden bg-[#121215] border border-white/10">
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    loading={Math.abs(offset) <= 1 ? 'eager' : 'lazy'}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Sleeve Card Spine & Sheen Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />
                  <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-white/15 to-transparent pointer-events-none" />

                  {/* Media Type & Season Badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                    <span className="px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md border border-white/15 text-[10px] font-black uppercase tracking-wider text-white flex items-center gap-1">
                      {item.type === 'tv' ? <Tv size={11} className="text-[#b88aff]" /> : <Film size={11} className="text-[#b88aff]" />}
                      {item.seasonNumber ? `S${item.seasonNumber}` : (item.type === 'tv' ? 'TV' : 'Film')}
                    </span>
                    {item.originalLanguage === 'hi' && (
                      <span className="px-2 py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-[9px] font-black uppercase text-amber-300">
                        Bollywood
                      </span>
                    )}
                  </div>

                  {/* Card Title & Info Bar */}
                  <div className="absolute bottom-0 inset-x-0 p-3.5 z-10">
                    <h4 className="text-base md:text-lg font-black text-white italic uppercase tracking-tight line-clamp-2 drop-shadow-md">
                      {item.title}
                    </h4>
                    <div className="flex items-center text-[11px] font-bold text-zinc-300 mt-1">
                      <span>{item.releaseYear || 'Classic'}</span>
                    </div>
                  </div>

                  {/* SWIPE OVERLAYS FOR ACTIVE CARD */}
                  {isCurrent && dragOffset !== 0 && (
                    <AnimatePresence>
                      {dragOffset < -25 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: Math.min(0.9, Math.abs(dragOffset) / 80) }}
                          className="absolute inset-0 bg-red-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20"
                        >
                          <div className="w-12 h-12 rounded-full bg-red-600/30 border border-red-500 flex items-center justify-center text-red-300 shadow-xl">
                            <X size={26} strokeWidth={3} />
                          </div>
                          <span className="text-xs font-black uppercase tracking-widest text-red-200">Swipe to Skip</span>
                        </motion.div>
                      )}
                      {dragOffset > 25 && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: Math.min(0.9, Math.abs(dragOffset) / 80) }}
                          className="absolute inset-0 bg-purple-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 z-20"
                        >
                          <div className="w-12 h-12 rounded-full bg-[#9b5cff]/30 border border-[#b88aff] flex items-center justify-center text-white shadow-xl">
                            <Check size={26} strokeWidth={3} />
                          </div>
                          <span className="text-xs font-black uppercase tracking-widest text-purple-200">Swipe to Mark Watched</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Rail Navigation & Action Controls */}
      {currentItem && (
        <div className="w-full max-w-lg px-2 sm:px-4 mt-10 sm:mt-8 md:mt-6 flex flex-col items-center gap-3.5 z-30">

          {/* Main Action Bar: Skip, Rating Bar (Solid Colors from Add Entry), Eye (Watched) */}
          <div className="flex items-center justify-center gap-2 sm:gap-3 w-full">

            {/* Skip Button */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => onSwipeLeft && onSwipeLeft(currentItem)}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-zinc-900/90 hover:bg-red-950/40 active:scale-95 border border-white/10 hover:border-red-500/40 text-zinc-400 hover:text-red-400 flex items-center justify-center transition-all shadow-lg shrink-0"
              title="Skip this title"
              aria-label="Skip"
            >
              <X size={19} strokeWidth={2.5} />
            </motion.button>

            {/* Rating Bar - Resized Pill Segmented Control copied from Add Entry / RatingButtons */}
            <div className="flex-1 bg-[#0c0c0e] p-1.5 sm:p-2 rounded-[2.5rem] border border-white/5 flex items-center relative overflow-hidden shadow-inner">
              {RATINGS_LIST.map((r) => {
                const cfg = RATING_CONFIG[r.id];
                const isActive = activeRating === r.id;

                return (
                  <motion.button
                    key={r.id}
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={() => {
                      // Click to select/toggle rating first, then user clicks Watched button to confirm
                      setActiveRating(prev => prev === r.id ? null : r.id);
                    }}
                    className={`
                      flex-1 py-3 sm:py-3.5 rounded-[2rem] font-black text-[9px] sm:text-[10px] uppercase tracking-[0.25em] sm:tracking-[0.3em] italic
                      transition-all duration-300 ease-out relative z-10 outline-none
                      ${isActive
                        ? 'text-black'
                        : 'text-zinc-400 hover:text-white'}
                    `}
                    title={`Select ${r.label} (Click Watched to confirm)`}
                  >
                    <motion.span
                      animate={{
                        scale: isActive ? 1.05 : 1,
                        opacity: isActive ? 1 : 0.75
                      }}
                      className="relative z-20"
                    >
                      {r.label}
                    </motion.span>
                    {isActive && (
                      <motion.div
                        layoutId="activeBacklogRatingOverlay"
                        className={`absolute inset-0 ${cfg.color} shadow-[0_0_30px_rgba(0,0,0,0.4)] z-0 rounded-[2rem]`}
                        initial={false}
                        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* Eye Button for Watched (Beside Rating Bar - Confirms selection) */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => {
                if (onRateWatched) {
                  onRateWatched(currentItem, activeRating);
                } else if (onSwipeRight) {
                  onSwipeRight(currentItem);
                }
                setActiveRating(null);
              }}
              className={`h-11 sm:h-12 px-3.5 sm:px-4.5 rounded-[1.5rem] ${
                activeRating
                  ? 'bg-gradient-to-r from-[#7012ea] to-[#b88aff] shadow-[0_0_30px_rgba(184,138,255,0.5)] border-white/40 ring-2 ring-purple-400/40 text-white'
                  : 'bg-gradient-to-r from-[#600dca] to-[#9b5cff] shadow-[0_0_25px_rgba(155,92,255,0.4)] border-white/20 text-white'
              } hover:brightness-110 active:scale-95 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shrink-0 border`}
              title={activeRating ? `Confirm "${currentItem.title}" as ${activeRating}` : 'Mark as Watched'}
              aria-label={activeRating ? 'Confirm Watched' : 'Mark as Watched'}
            >
              <Eye size={18} strokeWidth={2.5} />
              <span className="hidden xs:inline">{activeRating ? 'Confirm' : 'Watched'}</span>
            </motion.button>
          </div>

          {/* Quick Step Indicators */}
          <div className="flex items-center gap-1.5 mt-1">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === activeIndex
                    ? 'w-6 bg-[#b88aff]'
                    : 'w-1.5 bg-zinc-700 hover:bg-zinc-500'
                }`}
                aria-label={`Go to item ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AlbumRail;
