import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Film, Tv, Clock, Star, Calendar, Users, PenTool, Check, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { BacklogCandidate } from '../../types';
import { fetchMediaDetails, fetchMediaCredits } from '../../services/api';
import { formatRuntimeHM } from '../formater';
import { TMDB_IMAGE_BASE } from '../../constants';

interface BacklogDetailsModalProps {
  candidate: BacklogCandidate | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkWatched: (candidate: BacklogCandidate) => void;
  onSkip: (candidate: BacklogCandidate) => void;
}

export const BacklogDetailsModal: React.FC<BacklogDetailsModalProps> = ({
  candidate,
  isOpen,
  onClose,
  onMarkWatched,
  onSkip
}) => {
  const [details, setDetails] = useState<any>(null);
  const [credits, setCredits] = useState<{ cast: any[]; crew: any[] }>({ cast: [], crew: [] });
  const [isLoading, setIsLoading] = useState(false);
  const castScrollRef = useRef<HTMLDivElement>(null);

  const scrollCast = (direction: 'left' | 'right') => {
    if (castScrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      castScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (!candidate || !isOpen) return;

    let isCancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const [det, cred] = await Promise.all([
          fetchMediaDetails(candidate.tmdbId, candidate.type),
          fetchMediaCredits(candidate.tmdbId, candidate.type)
        ]);
        if (!isCancelled) {
          setDetails(det);
          setCredits(cred);
        }
      } catch (e) {
        console.warn("Failed fetching backlog details:", e);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    load();
    return () => { isCancelled = true; };
  }, [candidate, isOpen]);

  if (!isOpen || !candidate) return null;

  const director = credits.crew?.find((c: any) => c.job === 'Director')?.name;
  const writer = credits.crew?.find((c: any) => ['Writer', 'Screenplay', 'Author'].includes(c.job))?.name;
  const creators = details?.created_by?.map((c: any) => c.name).join(', ');
  const runtimeHM = details?.runtime ? formatRuntimeHM(details.runtime) : null;

  return (
    <div className="fixed inset-0 z-[2500] flex items-center justify-center p-3 md:p-6 bg-black/90 backdrop-blur-lg overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', damping: 25, stiffness: 280 }}
        className="relative w-full max-w-4xl bg-[#0e0e11] border border-white/15 rounded-[2.5rem] p-6 md:p-8 shadow-2xl overflow-hidden my-auto"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 z-20 w-11 h-11 rounded-full bg-black/60 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all border border-white/10"
          title="Return to Discovery Rail"
        >
          <X size={20} />
        </button>

        {/* Cinematic Layout: Poster on left, details on right (Desktop split, Mobile column) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">

          {/* LEFT: Poster with Backlight */}
          <div className="md:col-span-5 flex flex-col items-center">
            <div className="relative w-48 md:w-full max-w-[280px] aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.8)] border border-white/15">
              <img
                src={candidate.posterUrl}
                alt={candidate.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

              <div className="absolute top-3 left-3 flex items-center gap-1.5">
                <span className="px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md border border-white/20 text-[9px] font-black uppercase text-white flex items-center gap-1">
                  {candidate.type === 'tv' ? <Tv size={10} className="text-[#b88aff]" /> : <Film size={10} className="text-[#b88aff]" />}
                  {candidate.seasonNumber ? `Season ${candidate.seasonNumber}` : (candidate.type === 'tv' ? 'Series' : 'Film')}
                </span>
              </div>
            </div>

            {/* Quick Actions underneath poster */}
            <div className="flex items-center gap-3 w-full max-w-[280px] mt-5">
              <button
                type="button"
                onClick={() => {
                  onSkip(candidate);
                  onClose();
                }}
                className="flex-1 py-3 px-3 rounded-xl bg-zinc-900 hover:bg-red-950/40 border border-white/10 text-zinc-400 hover:text-red-400 text-xs font-black uppercase tracking-wider transition-all"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => {
                  onMarkWatched(candidate);
                  onClose();
                }}
                className="flex-2 py-3 px-4 rounded-xl bg-gradient-to-r from-[#600dca] to-[#9b5cff] hover:from-[#7215e8] hover:to-[#ac77ff] text-white text-xs font-black uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-1.5"
              >
                <Check size={14} strokeWidth={3} />
                <span>Mark Watched</span>
              </button>
            </div>
          </div>

          {/* RIGHT: Metadata & Synopsis Panel */}
          <div className="md:col-span-7 space-y-5 text-left">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-[#b88aff] font-mono text-xs font-bold">
                  Score {candidate.historicalScore}/100
                </span>
                <span className="text-zinc-400 font-bold text-xs">{candidate.releaseYear}</span>
                {runtimeHM && (
                  <span className="text-zinc-400 text-xs font-medium flex items-center gap-1">
                    <Clock size={11} className="text-zinc-400" />
                    {runtimeHM}
                  </span>
                )}
                <span className="text-amber-400 text-xs font-black flex items-center gap-1 ml-auto">
                  <Star size={12} className="fill-amber-400" />
                  {candidate.voteAverage.toFixed(1)} ({candidate.voteCount.toLocaleString()} votes)
                </span>
              </div>

              <h2 className="text-2xl md:text-3xl font-black text-white italic uppercase tracking-tight">
                {candidate.title}
              </h2>
              {candidate.originalTitle && candidate.originalTitle !== candidate.title && (
                <p className="text-xs text-zinc-400 italic mt-0.5">
                  Original: {candidate.originalTitle}
                </p>
              )}
            </div>

            {/* Genres */}
            {details?.genres && details.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {details.genres.map((g: string) => (
                  <span key={g} className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-bold uppercase text-zinc-300">
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Overview */}
            <div className="space-y-1">
              <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b88aff]">Synopsis</h4>
              <p className="text-xs md:text-sm text-zinc-300 leading-relaxed max-h-36 overflow-y-auto pr-2">
                {candidate.overview || details?.overview || 'No synopsis available for this title.'}
              </p>
            </div>

            {/* TV Season Details if applicable */}
            {candidate.seasonNumber && (
              <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/20 space-y-1">
                <span className="text-[9px] font-black uppercase tracking-wider text-[#b88aff] block">Season Details</span>
                <p className="text-xs text-zinc-200">
                  {candidate.seasonName} • {candidate.episodeCount ? `${candidate.episodeCount} Episodes` : 'Full Season'}
                  {candidate.airDate && ` • Aired ${candidate.airDate}`}
                </p>
              </div>
            )}

            {/* Creators, Director, Writer */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/10 text-xs">
              {director && (
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Director</span>
                  <span className="font-bold text-white truncate block">{director}</span>
                </div>
              )}
              {creators && (
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Creator(s)</span>
                  <span className="font-bold text-white truncate block">{creators}</span>
                </div>
              )}
              {writer && (
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block">Writer</span>
                  <span className="font-bold text-white truncate block">{writer}</span>
                </div>
              )}
            </div>

            {/* Cast List */}
            {credits.cast && credits.cast.length > 0 && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#b88aff] flex items-center gap-1.5">
                    <Users size={12} />
                    <span>Key Cast</span>
                  </h4>
                  {credits.cast.length > 4 && (
                    <div className="hidden sm:flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => scrollCast('left')}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all shadow-sm"
                        title="Slide cast left"
                        aria-label="Slide cast left"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollCast('right')}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all shadow-sm"
                        title="Slide cast right"
                        aria-label="Slide cast right"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div
                  ref={castScrollRef}
                  className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar scroll-smooth"
                >
                  {credits.cast.slice(0, 16).map((actor: any) => (
                    <div key={actor.id} className="flex flex-col items-center shrink-0 w-16 text-center">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 border border-white/10 mb-1 shadow-sm">
                        {actor.profile_path ? (
                          <img
                            src={`${TMDB_IMAGE_BASE}${actor.profile_path}`}
                            alt={actor.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-zinc-400">
                            {actor.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-bold text-zinc-200 truncate w-full">{actor.name}</span>
                      <span className="text-[8px] text-zinc-400 truncate w-full">{actor.character || 'Cast'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
