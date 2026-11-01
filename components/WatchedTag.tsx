import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Calendar, Star, MessageSquare, Repeat2 } from 'lucide-react';
import { WatchEntry, Rating } from '../types';

interface WatchedTagProps {
  entries: WatchEntry[];
  className?: string;
  popoverPosition?: 'top' | 'bottom';
}

export const WatchedTag: React.FC<WatchedTagProps> = ({
  entries,
  className = '',
  popoverPosition = 'bottom'
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isClicked, setIsClicked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popup when clicking outside
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsClicked(false);
      }
    };
    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('touchstart', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('touchstart', handleDocumentClick);
    };
  }, []);

  // Sort logs by watchDate descending (latest log first)
  const sortedLogs = useMemo(() => {
    return [...(entries || [])].sort((a, b) => {
      const dateA = a.watchDate ? new Date(a.watchDate).getTime() : 0;
      const dateB = b.watchDate ? new Date(b.watchDate).getTime() : 0;
      return dateB - dateA;
    });
  }, [entries]);

  const latestLog = sortedLogs[0];
  if (!latestLog) return null;

  // Format watch date nicely (e.g., "23 Oct 2026", "~2018 (Approx)", or "Date Unknown")
  const formatWatchedDate = (target: WatchEntry | string | undefined) => {
    if (!target) return 'Logged';
    const entry = typeof target === 'object' ? target : null;
    const dateStr = typeof target === 'string' ? target : entry?.watchDate;

    if (entry?.datePrecision === 'unknown' || dateStr === '0000-00-00') {
      return 'Date Unknown';
    }
    if (entry?.datePrecision === 'year' || entry?.approximateYear) {
      return `~${entry.approximateYear || (dateStr ? dateStr.split('-')[0] : '')} (Approx)`;
    }
    if (!dateStr) return 'Logged';
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        if (y === 0) return 'Date Unknown';
        const d = new Date(y, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        }).format(d);
      }
      const d = new Date(dateStr);
      return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      }).format(d);
    } catch {
      return dateStr;
    }
  };

  const hasValidDate = Boolean(
    latestLog.watchDate &&
    latestLog.watchDate !== '0000-00-00' &&
    latestLog.datePrecision !== 'unknown'
  );
  const hasReview = Boolean(latestLog.review && latestLog.review.trim().length > 0);

  const formattedDate = hasValidDate ? formatWatchedDate(latestLog) : '';

  // Compute theme strictly matching the review/rating color given by the user
  const theme = useMemo(() => {
    const rating = latestLog.rating;
    const isAbsolute = latestLog.isAbsoluteCinema;
    const isVague = latestLog.isVague || rating === Rating.VAGUE;

    if (isAbsolute || rating === Rating.PEAK) {
      return {
        colorHex: '#9b5cff',
        label: isAbsolute ? 'ABSOLUTE CINEMA' : 'PEAK'
      };
    }

    if (isVague) {
      return {
        colorHex: '#a1a1aa',
        label: 'VAGUE'
      };
    }

    switch (rating) {
      case Rating.GOOD:
        return {
          colorHex: '#00f5a0',
          label: 'GOOD'
        };
      case Rating.MID:
        return {
          colorHex: '#ffb703',
          label: 'MID'
        };
      case Rating.BAD:
        return {
          colorHex: '#ff4d6d',
          label: 'BAD'
        };
      default:
        return {
          colorHex: '#00f5a0',
          label: 'GOOD'
        };
    }
  }, [latestLog]);

  const isOpen = isHovered || isClicked;

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Interactive Watched Button Tag with dynamic Review Color */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsClicked(prev => !prev);
        }}
        className={`group inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all duration-200 select-none cursor-pointer active:scale-95 touch-manipulation focus:outline-none ${isClicked ? 'ring-2 ring-offset-1 ring-offset-[#09090b]' : ''}`}
        style={{
          backgroundColor: isOpen ? `${theme.colorHex}2b` : `${theme.colorHex}18`,
          color: theme.colorHex,
          borderColor: isOpen ? `${theme.colorHex}80` : `${theme.colorHex}45`,
          boxShadow: isOpen
            ? `0 0 16px ${theme.colorHex}40`
            : `0 0 10px ${theme.colorHex}20`,
          ['--tw-ring-color' as any]: isClicked ? `${theme.colorHex}90` : undefined
        }}
        title={hasValidDate ? `Click or hover to view review details (Logged: ${formattedDate})` : 'Marked as Watched'}
        aria-label={hasValidDate ? `Watched on ${formattedDate}, review rating: ${theme.label}` : `Watched, rating: ${theme.label}`}
        aria-expanded={isOpen}
      >
        <CheckCircle2
          size={11}
          className="shrink-0 transition-transform duration-200 group-hover:scale-110"
          style={{ color: theme.colorHex }}
        />

        {/* Dynamic Label: Only shows date if a valid date exists */}
        <span className="flex items-center transition-all duration-200">
          {isOpen && hasValidDate ? (
            <span className="font-black tracking-wider flex items-center gap-1">
              <span>WATCHED</span>
              <span className="opacity-50">•</span>
              <span className="underline underline-offset-2 decoration-current/40">{formattedDate.toUpperCase()}</span>
            </span>
          ) : (
            <span className="tracking-widest">
              WATCHED
            </span>
          )}
        </span>

        {/* Rewatch Multiplier Badge if watched multiple times */}
        {sortedLogs.length > 1 && (
          <span
            className="ml-0.5 px-1 py-0.2 text-[7px] rounded font-black border"
            style={{
              backgroundColor: `${theme.colorHex}25`,
              borderColor: `${theme.colorHex}40`,
              color: theme.colorHex
            }}
            title={`Watched ${sortedLogs.length} times`}
          >
            {sortedLogs.length}×
          </span>
        )}
      </button>

      {/* Floating Desktop Popover / Card */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: popoverPosition === 'bottom' ? -4 : 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: popoverPosition === 'bottom' ? -3 : 3, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className={`absolute ${popoverPosition === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'} left-0 sm:left-1/2 sm:-translate-x-1/2 z-50 min-w-[200px] max-w-[300px] p-3 rounded-2xl bg-[#0c0c0e]/98 backdrop-blur-2xl border shadow-2xl space-y-2.5 text-left pointer-events-auto`}
            style={{
              borderColor: `${theme.colorHex}45`,
              boxShadow: `0 16px 40px -4px rgba(0, 0, 0, 0.85), 0 0 24px -2px ${theme.colorHex}30`
            }}
          >
            {/* Header: Log status & Rating pill in exact rating color */}
            <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={12} style={{ color: theme.colorHex }} />
                <span className="text-[9px] font-black uppercase tracking-wider text-white">
                  Diary Entry
                </span>
              </div>
              <span
                className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border flex items-center gap-1"
                style={{
                  backgroundColor: `${theme.colorHex}18`,
                  color: theme.colorHex,
                  borderColor: `${theme.colorHex}40`
                }}
              >
                <Star size={9} fill={theme.colorHex} strokeWidth={0} />
                <span>{theme.label}</span>
              </span>
            </div>

            {/* Date Row (ONLY shown if a valid date exists) */}
            {hasValidDate && (
              <div className="flex items-center gap-2 text-zinc-300">
                <Calendar size={13} style={{ color: theme.colorHex }} className="shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[7px] font-black text-zinc-500 uppercase tracking-widest leading-none">Review / Log Date</span>
                  <span className="text-[11px] font-black text-white tracking-wide mt-0.5">
                    {formattedDate}
                  </span>
                </div>
              </div>
            )}

            {/* User Review / Note (ONLY shown if present) */}
            {hasReview && (
              <div className="pt-2 border-t border-white/5 space-y-1">
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <MessageSquare size={10} style={{ color: theme.colorHex }} />
                  <span className="text-[7px] font-black uppercase tracking-widest">Your Review Note</span>
                </div>
                <p
                  className="text-[10px] text-zinc-300 italic font-medium leading-relaxed pl-2 border-l-2"
                  style={{ borderColor: `${theme.colorHex}70` }}
                >
                  "{latestLog.review}"
                </p>
              </div>
            )}

            {/* Rewatch count info */}
            {sortedLogs.length > 1 && (
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[8px] font-bold text-zinc-400">
                <span className="flex items-center gap-1">
                  <Repeat2 size={10} style={{ color: theme.colorHex }} />
                  <span>Logged {sortedLogs.length} times</span>
                </span>
                {(() => {
                  const oldest = sortedLogs[sortedLogs.length - 1];
                  const oldestHasDate = Boolean(oldest.watchDate && oldest.watchDate !== '0000-00-00' && oldest.datePrecision !== 'unknown');
                  if (!oldestHasDate) return null;
                  return (
                    <span className="text-zinc-500 font-mono text-[7px] uppercase">
                      1st: {formatWatchedDate(oldest)}
                    </span>
                  );
                })()}
              </div>
            )}

            {/* Subtle Caret pointing at the tag */}
            {popoverPosition === 'bottom' ? (
              <div
                className="absolute bottom-full left-4 sm:left-1/2 sm:-translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-b-4"
                style={{ borderBottomColor: `${theme.colorHex}55` }}
              />
            ) : (
              <div
                className="absolute top-full left-4 sm:left-1/2 sm:-translate-x-1/2 -mt-[1px] w-0 h-0 border-x-4 border-x-transparent border-t-4"
                style={{ borderTopColor: `${theme.colorHex}55` }}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WatchedTag;
