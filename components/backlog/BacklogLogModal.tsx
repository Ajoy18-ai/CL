import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, Check, AlertCircle, Clock, Sparkles, HelpCircle, Film, Tv } from 'lucide-react';
import { BacklogCandidate, Rating, WatchEntry } from '../../types';
import { useStore } from '../../store/useStore';
import { useToastStore } from '../../store/useToastStore';
import { fetchMediaDetails } from '../../services/api';
import { recordBacklogWatched, isCandidateAlreadyLogged } from '../../services/historicalPopularity';
import RatingButtons from '../RatingButtons';
import { CustomDatePicker } from '../CustomDatePicker';

interface BacklogLogModalProps {
  candidate: BacklogCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  onLoggedSuccess: (candidate: BacklogCandidate) => void;
}

export const BacklogLogModal: React.FC<BacklogLogModalProps> = ({
  candidate,
  isOpen,
  onClose,
  onLoggedSuccess
}) => {
  const { entries, addEntry } = useStore();
  const toast = useToastStore();

  const [rating, setRating] = useState<Rating | null>(null);
  const [isVague, setIsVague] = useState(false);
  const [isAbsoluteCinema, setIsAbsoluteCinema] = useState(false);
  const [isRewatch, setIsRewatch] = useState(false);
  const [review, setReview] = useState('');

  // Date Precision mode: 'exact' | 'year' | 'unknown'
  const [dateMode, setDateMode] = useState<'unknown' | 'year' | 'exact'>('unknown');
  const [exactDate, setExactDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [approxYear, setApproxYear] = useState<number>(() => {
    const relYear = candidate?.releaseYear ? parseInt(candidate.releaseYear) : 2018;
    return isNaN(relYear) ? 2018 : Math.min(2024, Math.max(1970, relYear));
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if already in diary
  const alreadyLoggedEntry = useMemo(() => {
    if (!candidate) return null;
    return entries.find(e => {
      if (!e) return false;
      if (e.tmdbId === candidate.tmdbId && e.type === candidate.type) {
        if (candidate.type === 'tv' && candidate.seasonNumber !== undefined) {
          return e.seasonNumber === candidate.seasonNumber || (e.title && candidate.seasonName && e.title.toLowerCase().includes(candidate.seasonName.toLowerCase()));
        }
        return true;
      }
      return false;
    });
  }, [candidate, entries]);

  // Reset state when a new candidate is opened
  useEffect(() => {
    if (candidate) {
      setRating(null);
      setIsVague(false);
      setIsAbsoluteCinema(false);
      setIsRewatch(false);
      setReview('');
      setDateMode('unknown');
      const relYear = candidate.releaseYear ? parseInt(candidate.releaseYear) : 2018;
      setApproxYear(isNaN(relYear) ? 2018 : Math.min(2024, Math.max(1970, relYear)));
    }
  }, [candidate]);

  if (!isOpen || !candidate) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Determine watchDate, year, and datePrecision
      let finalWatchDate = '0000-00-00';
      let finalYear = 0;
      let finalPrecision: 'exact' | 'year' | 'unknown' = dateMode;

      if (dateMode === 'exact') {
        finalWatchDate = exactDate;
        finalYear = new Date(exactDate).getFullYear() || 0;
      } else if (dateMode === 'year') {
        finalWatchDate = `${approxYear}-01-01`;
        finalYear = approxYear;
      } else {
        // Date Unknown: Use placeholder non-corrupting date
        finalWatchDate = '0000-00-00';
        finalYear = 0; // Year 0 prevents it from polluting specific annual recaps (e.g. 2026/2025)
      }

      // Fetch full details from TMDB to keep metadata rich
      let genres = candidate.genres;
      let runtime = 120;
      let studios: string[] = [];

      try {
        const details = await fetchMediaDetails(candidate.tmdbId, candidate.type);
        if (details.genres) genres = details.genres;
        if (details.runtime) runtime = details.runtime;
        if (details.studios) studios = details.studios;
      } catch (err) {
        console.warn("Failed fetching extra details for backlog candidate:", err);
      }

      // If no rating selected, default to VAGUE or null representation
      const finalRating = rating || Rating.VAGUE;

      await addEntry({
        tmdbId: candidate.tmdbId,
        type: candidate.type,
        title: candidate.title,
        posterUrl: candidate.posterUrl,
        watchDate: finalWatchDate,
        rating: finalRating,
        isVague: isVague || !rating,
        isAbsoluteCinema,
        isRewatch,
        isFavorite: false,
        review: review.trim() || undefined,
        year: finalYear,
        releaseYear: candidate.releaseYear,
        genres,
        runtime,
        studios,
        episodeCount: candidate.episodeCount,
        airDate: candidate.airDate,
        seasonSynopsis: candidate.overview,
        seasonNumber: candidate.seasonNumber,
        seasonName: candidate.seasonName,
        datePrecision: finalPrecision,
        approximateYear: dateMode === 'year' ? approxYear : undefined,
        isBacklogRecovery: true
      });

      // Record in backlog history
      const tempEntryId = `backlog-${Date.now()}`;
      recordBacklogWatched(candidate.id, tempEntryId);

      onLoggedSuccess(candidate);
      onClose();
    } catch (err) {
      console.error("Backlog recovery log error:", err);
      toast.error("Failed to log title. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-xl bg-[#0f0f12] border border-white/15 rounded-[2.5rem] p-6 md:p-8 shadow-2xl overflow-hidden my-8"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X size={18} />
        </button>

        {/* Media Preview Header */}
        <div className="flex items-center gap-4 pb-6 border-b border-white/10">
          <div className="w-16 h-24 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 shrink-0">
            <img src={candidate.posterUrl} alt={candidate.title} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-[#b88aff] text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                {candidate.type === 'tv' ? <Tv size={10} /> : <Film size={10} />}
                {candidate.seasonNumber ? `Season ${candidate.seasonNumber}` : (candidate.type === 'tv' ? 'TV Series' : 'Movie')}
              </span>
              <span className="text-zinc-400 text-xs font-bold">{candidate.releaseYear}</span>
            </div>
            <h3 className="text-lg md:text-xl font-black text-white italic uppercase tracking-tight truncate">
              {candidate.title}
            </h3>
            <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">
              Historical Discovery • Rating & review optional
            </p>
          </div>
        </div>

        {/* Duplicate Warning if Already Logged */}
        {alreadyLoggedEntry && (
          <div className="mt-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="text-left text-xs">
              <p className="font-bold text-amber-200 uppercase tracking-wider">Already in your diary</p>
              <p className="text-zinc-300 mt-0.5">
                Logged with rating <span className="font-black text-white">{alreadyLoggedEntry.rating}</span> on {alreadyLoggedEntry.watchDate}. Adding again will create a new viewing record.
              </p>
            </div>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSave} className="space-y-6 mt-6">

          {/* 1. Watch Date Section (Exact, Approximate Year, or Unknown) */}
          <div className="space-y-3 text-left">
            <label className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b88aff] block">
              When Did You Watch This?
            </label>

            {/* 3-way segmented control */}
            <div className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-black/60 border border-white/10">
              <button
                type="button"
                onClick={() => setDateMode('unknown')}
                className={`py-2.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  dateMode === 'unknown'
                    ? 'bg-[#9b5cff] text-white shadow-lg'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <HelpCircle size={12} />
                <span>Date Unknown</span>
              </button>

              <button
                type="button"
                onClick={() => setDateMode('year')}
                className={`py-2.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  dateMode === 'year'
                    ? 'bg-[#9b5cff] text-white shadow-lg'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Calendar size={12} />
                <span>Approx. Year</span>
              </button>

              <button
                type="button"
                onClick={() => setDateMode('exact')}
                className={`py-2.5 px-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  dateMode === 'exact'
                    ? 'bg-[#9b5cff] text-white shadow-lg'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Clock size={12} />
                <span>Exact Date</span>
              </button>
            </div>

            {/* Date Mode Description / Custom Inputs */}
            {dateMode === 'unknown' && (
              <p className="text-[11px] text-zinc-400 italic px-1">
                Will be stored as a historical entry without a specific date. Will not corrupt your annual recaps or 2025/2026 stats.
              </p>
            )}

            {dateMode === 'year' && (
              <div className="flex items-center gap-4 bg-black/40 border border-white/10 rounded-2xl p-3">
                <span className="text-xs text-zinc-400 font-bold uppercase tracking-wider">Approximate Year:</span>
                <input
                  type="number"
                  min="1950"
                  max="2024"
                  value={approxYear}
                  onChange={(e) => setApproxYear(parseInt(e.target.value) || 2018)}
                  className="w-24 px-3 py-1.5 rounded-xl bg-zinc-900 border border-white/20 text-white font-mono font-bold text-center text-sm focus:outline-none focus:border-[#b88aff]"
                />
                <span className="text-[10px] text-zinc-400">(e.g. 2014)</span>
              </div>
            )}

            {dateMode === 'exact' && (
              <div className="bg-black/40 border border-white/10 rounded-2xl p-2">
                <CustomDatePicker
                  value={exactDate}
                  onChange={setExactDate}
                  label="Exact Watch Date"
                />
              </div>
            )}
          </div>

          {/* 2. Rating Buttons (Optional) */}
          <div className="space-y-3 text-left">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b88aff] block">
                Rating <span className="text-zinc-400 normal-case font-normal">(Optional)</span>
              </label>
              {rating && (
                <button
                  type="button"
                  onClick={() => setRating(null)}
                  className="text-[10px] text-zinc-400 hover:text-red-400 underline"
                >
                  Clear Rating
                </button>
              )}
            </div>

            <RatingButtons
              rating={rating}
              isVague={isVague}
              isAbsoluteCinema={isAbsoluteCinema}
              isRewatch={isRewatch}
              onRatingChange={(r) => setRating(r)}
              onVagueToggle={setIsVague}
              onAbsoluteCinemaToggle={setIsAbsoluteCinema}
              onRewatchToggle={setIsRewatch}
            />
          </div>

          {/* 3. Review (Optional) */}
          <div className="space-y-2 text-left">
            <label className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b88aff] block">
              Memory / Review <span className="text-zinc-400 normal-case font-normal">(Optional)</span>
            </label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
              placeholder="What do you remember about watching this movie or series?"
              rows={2}
              maxLength={1000}
              className="w-full px-4 py-3 rounded-2xl bg-black/50 border border-white/10 text-white placeholder-zinc-500 text-xs focus:outline-none focus:border-[#9b5cff] transition-all"
            />
          </div>

          {/* Submit Action */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 font-black text-xs uppercase tracking-wider transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-2 py-4 px-6 rounded-2xl bg-gradient-to-r from-[#600dca] to-[#9b5cff] hover:from-[#7215e8] hover:to-[#ac77ff] active:scale-98 text-white font-black text-xs uppercase tracking-widest transition-all shadow-[0_10px_30px_rgba(155,92,255,0.4)] flex items-center justify-center gap-2"
            >
              <Check size={16} strokeWidth={3} />
              <span>{isSubmitting ? 'Recording...' : 'Mark as Watched'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
