import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { WatchEntry } from '../types';
import { RATING_CONFIG, TMDB_IMAGE_BASE } from '../constants';
import { X, Calendar, Clock, Film, Tv, Edit2, Trash2, MessageSquare, Repeat2, Clapperboard, Copy, ZoomIn, Sparkles, Users, ChevronLeft, ChevronRight, Info, Star, PenTool, Building2 } from 'lucide-react';
import { useOutsideClick } from '../hooks/use-outside-click';
import { useToastStore } from '../store/useToastStore';
import { useStore } from '../store/useStore';
import { AlternativePosterModal } from './AlternativePosterModal';
import { useNavigate } from 'react-router-dom';
import { fetchMediaCredits, fetchMediaDetails, searchTMDB } from '../services/api';
import { formatRuntimeHM } from './formater';

interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
  known_for_department?: string;
}

interface ExpandableDetailModalProps {
  activeEntry: WatchEntry | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onEdit: (entry: WatchEntry) => void;
}

const ExpandableDetailModal: React.FC<ExpandableDetailModalProps> = ({
  activeEntry,
  onClose,
  onDelete,
  onEdit,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const castScrollRef = useRef<HTMLDivElement>(null);
  const toast = useToastStore();
  const navigate = useNavigate();
  const { updateEntry, blurPosters, setIsPosterModalOpen } = useStore();
  const isBlurred = activeEntry ? (blurPosters || activeEntry.isBlurred) : false;

  const [isZoomedIn, setIsZoomedIn] = useState(false);
  const [showAlternativePosters, setShowAlternativePosters] = useState(false);
  const [cast, setCast] = useState<CastMember[]>([]);
  const [isLoadingCast, setIsLoadingCast] = useState(false);

  // Sync isPosterModalOpen with store so desktop sidebar & mobile dock are hidden
  useEffect(() => {
    if (isZoomedIn || showAlternativePosters) {
      setIsPosterModalOpen(true);
    } else {
      setIsPosterModalOpen(false);
    }
    return () => {
      setIsPosterModalOpen(false);
    };
  }, [isZoomedIn, showAlternativePosters, setIsPosterModalOpen]);
  const [mediaOverview, setMediaOverview] = useState<string | null>(null);
  const [director, setDirector] = useState<{ id: number; name: string } | null>(null);
  const [creators, setCreators] = useState<{ id: number; name: string }[]>([]);
  const [showrunners, setShowrunners] = useState<{ id: number; name: string }[]>([]);
  const [writers, setWriters] = useState<string[]>([]);
  const [studios, setStudios] = useState<string[]>([]);
  const [tmdbRating, setTmdbRating] = useState<number | null>(null);

  // Esc key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch Movie / Media Cast and Details on mount or entry change
  useEffect(() => {
    let isMounted = true;
    const loadDetailsAndCast = async () => {
      if (!activeEntry) return;

      setIsLoadingCast(true);
      try {
        let resolvedId = activeEntry.tmdbId ? Number(activeEntry.tmdbId) : 0;
        let resolvedType: 'movie' | 'tv' = activeEntry.type || 'movie';

        // Fallback: If tmdbId is missing or 0, search TMDB with clean title
        if (!resolvedId || isNaN(resolvedId)) {
          const cleanTitle = (activeEntry.title || '').replace(/\s*-\s*Season\s*\d+.*/i, '').trim();
          if (cleanTitle) {
            const results = await searchTMDB(cleanTitle);
            if (results && results.length > 0) {
              resolvedId = results[0].id;
              resolvedType = (results[0].media_type as 'movie' | 'tv') || resolvedType;
            }
          }
        }

        if (resolvedId && !isNaN(resolvedId)) {
          const [creditsData, detailsData] = await Promise.allSettled([
            fetchMediaCredits(resolvedId, resolvedType),
            fetchMediaDetails(resolvedId, resolvedType)
          ]);

          if (!isMounted) return;

          let fetchedCreators: { id: number; name: string }[] = [];
          let fetchedShowrunners: { id: number; name: string }[] = [];

          if (detailsData.status === 'fulfilled' && detailsData.value) {
            if (detailsData.value.overview) setMediaOverview(detailsData.value.overview);
            if (detailsData.value.vote_average) setTmdbRating(detailsData.value.vote_average);
            if (detailsData.value.studios && detailsData.value.studios.length > 0) {
              setStudios(detailsData.value.studios);
            }
            if (detailsData.value.created_by && detailsData.value.created_by.length > 0) {
              fetchedCreators = detailsData.value.created_by.map((c: any) => ({ id: c.id, name: c.name }));
            }
          }

          if (creditsData.status === 'fulfilled' && creditsData.value) {
            const castList: CastMember[] = (creditsData.value.cast || [])
              .filter((member: CastMember) => member && member.name)
              .sort((a: CastMember, b: CastMember) => (a.order ?? 999) - (b.order ?? 999));
            setCast(castList);

            const crew = creditsData.value.crew || [];
            const dirObj = crew.find((c: any) => c.job === 'Director');
            if (dirObj) setDirector({ id: dirObj.id, name: dirObj.name });

            // Extract Showrunners
            const srList = crew
              .filter((c: any) => c.job === 'Showrunner' || c.job === 'Executive Producer / Showrunner')
              .map((c: any) => ({ id: c.id, name: c.name }));
            fetchedShowrunners = [...new Map(srList.map((item: any) => [item.id, item])).values()] as { id: number; name: string }[];

            // Extract Creators from crew if any
            const creatorCrew = crew
              .filter((c: any) => c.job === 'Creator')
              .map((c: any) => ({ id: c.id, name: c.name }));
            if (creatorCrew.length > 0) {
              fetchedCreators = [...new Map([...fetchedCreators, ...creatorCrew].map((item: any) => [item.id, item])).values()] as { id: number; name: string }[];
            }

            const writerList = crew
              .filter((c: any) => ['Writer', 'Screenplay', 'Author', 'Story', 'Teleplay'].includes(c.job))
              .map((w: any) => w.name);
            setWriters([...new Set(writerList)].slice(0, 3) as string[]);
          }

          setCreators(fetchedCreators);
          setShowrunners(fetchedShowrunners);
        } else {
          if (isMounted) {
            setCast([]);
          }
        }
      } catch (err) {
        console.error("Failed to load details or cast:", err);
      } finally {
        if (isMounted) setIsLoadingCast(false);
      }
    };

    loadDetailsAndCast();

    return () => {
      isMounted = false;
    };
  }, [activeEntry?.id, activeEntry?.tmdbId, activeEntry?.title, activeEntry?.type]);

  const scrollCast = (direction: 'left' | 'right') => {
    if (castScrollRef.current) {
      const scrollOffset = direction === 'left' ? -260 : 260;
      castScrollRef.current.scrollBy({ left: scrollOffset, behavior: 'smooth' });
    }
  };

  useOutsideClick(modalRef, () => {
    if (activeEntry && !isZoomedIn && !showAlternativePosters) onClose();
  });

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'Asia/Dhaka'
      }).format(date);
    } catch (e) {
      return dateStr;
    }
  };

  if (!activeEntry) return null;

  const ratingCfg = RATING_CONFIG[activeEntry.rating] || RATING_CONFIG.GOOD;
  const entryTitle = activeEntry.title || 'Untitled';
  const isVague = activeEntry.isVague || activeEntry.rating === 'VAGUE';
  const isAbsoluteCinema = activeEntry.isAbsoluteCinema;
  const isRewatch = activeEntry.isRewatch;

  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 overflow-y-auto bg-black/90 md:backdrop-blur-xl">
        {/* Backdrop overlay */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 pointer-events-none"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          ref={modalRef}
          style={{ transform: 'translateZ(0)' }}
          className="relative w-full max-w-xl bg-zinc-950 border border-white/10 rounded-[2.5rem] md:rounded-[3.5rem] overflow-hidden shadow-2xl flex flex-col z-50 overflow-y-auto max-h-[92vh] no-scrollbar"
        >
          {/* Header image banner */}
          <div
            onClick={() => setIsZoomedIn(true)}
            className="relative h-72 sm:h-96 w-full shrink-0 group/banner cursor-pointer overflow-hidden"
          >
            <div
              className="w-full h-full transition-transform duration-300 group-hover/banner:scale-[1.02]"
            >
              <img
                src={activeEntry.posterUrl}
                alt={entryTitle}
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover object-center bg-zinc-900 transition-[transform,filter] duration-300 ${isBlurred ? 'blur-2xl scale-110' : 'blur-0 scale-100'}`}
              />
            </div>
            {/* Top gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-zinc-950/40 pointer-events-none" />

            {/* Elegant overlay hint */}
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 opacity-0 group-hover/banner:opacity-100 transition-opacity duration-200">
              <div className="p-3 bg-black/70 backdrop-blur-md rounded-2xl border border-white/10 text-white flex items-center gap-2.5 shadow-2xl scale-95 group-hover/banner:scale-100 transition-transform duration-200">
                <ZoomIn size={15} className="text-[#9b5cff]" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">Click to Enlarge</span>
              </div>
            </div>

            {/* Quick badges */}
            <div className="absolute top-6 left-6 flex flex-col gap-2.5">
              {activeEntry.type === 'movie' ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 border border-white/10">
                  <Film size={12} className="text-[#9b5cff]" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-white">Movie</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 border border-white/10">
                  <Tv size={12} className="text-[#9b5cff]" />
                  <span className="text-[9px] font-black uppercase tracking-wider text-white">TV Show</span>
                </div>
              )}
            </div>

            {/* Close Button & Info shortcut */}
            <div className="absolute top-6 right-6 flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  document.getElementById('entry-information-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-black/80 border border-white/10 hover:border-purple-500/40 text-zinc-300 hover:text-white rounded-2xl transition-colors active:scale-95"
                title="Jump to Information & Movie Cast"
              >
                <Info size={14} className="text-[#9b5cff]" />
                <span className="text-[9px] font-black uppercase tracking-wider hidden sm:inline">Info & Cast</span>
              </button>
              <button
                onClick={onClose}
                className="p-2.5 bg-black/80 border border-white/10 text-zinc-400 hover:text-white rounded-2xl transition-colors"
                title="Close Details"
              >
                <X size={18} />
              </button>
            </div>

            {/* Film Title on banner */}
            <div className="absolute bottom-6 left-6 right-6">
              <div className="space-y-1.5">
                <h2
                  className={`text-2xl sm:text-4xl font-black text-white italic uppercase tracking-tight leading-none cursor-pointer hover:text-[#9b5cff] transition-colors duration-200 flex items-center gap-2 group/title ${isBlurred ? 'blur-[8px] select-none hover:blur-none' : 'blur-0'}`}
                  title="Click to copy entry name"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(entryTitle);
                    toast.success(`Copied: "${entryTitle}"`);
                  }}
                >
                  {entryTitle}
                  <Copy size={16} className="opacity-0 group-hover/title:opacity-100 text-[#9b5cff] transition-opacity shrink-0 hidden sm:inline" />
                </h2>
                <div
                  className="flex flex-wrap items-center gap-3"
                >
                  <span
                    onClick={() => {
                      const yearStr = activeEntry.releaseYear || activeEntry.year;
                      if (yearStr) {
                        const yearInt = parseInt(String(yearStr));
                        if (!isNaN(yearInt)) {
                          onClose();
                          navigate(`/explore?tab=years&year=${yearInt}&mediaType=${activeEntry.type || 'movie'}`);
                        }
                      }
                    }}
                    className="text-xs font-black text-zinc-400 hover:text-purple-400 cursor-pointer uppercase tracking-widest transition-colors duration-200"
                    title="Browse this year"
                  >
                    {activeEntry.releaseYear || activeEntry.year}
                  </span>
                  {activeEntry.runtime ? (
                    <span className="flex items-center gap-1 text-xs font-black text-zinc-400 uppercase tracking-widest">
                      <Clock size={12} />
                      {formatRuntimeHM(activeEntry.runtime)}
                    </span>
                  ) : null}
                  {activeEntry.episodeCount && (
                    <span className="text-[10px] font-black text-zinc-300 bg-purple-500/10 px-2.5 py-0.5 rounded-md border border-purple-500/20 uppercase tracking-wider">
                      {activeEntry.episodeCount} EP
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Details Content */}
          <div className="p-6 sm:p-10 space-y-8">
            {/* Metadata Rows */}
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex flex-col gap-1">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Logged On</span>
                <span className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={13} className="text-zinc-500" />
                  {formatDate(activeEntry.watchDate)}
                </span>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex flex-col gap-1">
                <span className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Status / Vibe</span>
                <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${ratingCfg?.color}`} />
                  <span className={ratingCfg?.text}>{ratingCfg?.label}</span>
                </span>
              </div>
            </div>

            {/* Tags Banner */}
            {(isRewatch || isVague || isAbsoluteCinema || (activeEntry.genres && activeEntry.genres.length > 0)) && (
              <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.04]">
                {isRewatch && (
                  <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-400/5 px-3 py-1 rounded-full border border-emerald-400/10 text-[9px] font-black uppercase tracking-wider">
                    <Repeat2 size={12} />
                    Rewatched
                  </div>
                )}
                {isVague && (
                  <div className="flex items-center gap-1.5 text-zinc-400 bg-white/5 px-3 py-1 rounded-full border border-white/5 text-[9px] font-black uppercase tracking-wider">
                    <Clapperboard size={12} />
                    Vague Memory
                  </div>
                )}
                {isAbsoluteCinema && (
                  <div className="flex items-center gap-1.5 text-purple-400 bg-purple-400/5 px-3 py-1 rounded-full border border-purple-400/10 text-[9px] font-black uppercase tracking-wider whitespace-nowrap">
                    <span className="whitespace-nowrap">✋😮🤚</span>
                    Absolute Cinema
                  </div>
                )}
                {activeEntry.genres?.map(genre => (
                  <span key={genre} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-[9px] font-black uppercase tracking-wider">
                    {genre}
                  </span>
                ))}
              </div>
            )}

            {/* INFORMATION & MOVIE CAST SECTION */}
            <div id="entry-information-section" className="space-y-5 pt-3 border-t border-white/[0.06]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[#9b5cff]">
                    <Info size={14} />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-black text-white uppercase tracking-[0.2em] flex items-center gap-2">
                      {activeEntry.type === 'tv' ? 'Series Information' : 'Movie Information'}
                    </h4>
                    <p className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest">
                      Synopsis, Key Credits & Cast
                    </p>
                  </div>
                </div>

                {tmdbRating && tmdbRating > 0 ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                    <span className="text-[10px] font-black tabular-nums">{tmdbRating.toFixed(1)}</span>
                    <span className="text-[8px] font-bold text-zinc-500 uppercase">TMDB</span>
                  </div>
                ) : null}
              </div>

              {/* Narrative Overview / Synopsis */}
              {(mediaOverview || activeEntry.seasonSynopsis) && (
                <div className="space-y-1.5 bg-white/[0.02] border border-white/[0.04] p-4 rounded-2xl">
                  <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Film size={11} className="text-[#9b5cff]" />
                    {activeEntry.seasonSynopsis ? 'Season Overview' : 'Synopsis'}
                  </span>
                  <p className="text-zinc-300 text-xs sm:text-[13px] leading-relaxed font-normal">
                    {activeEntry.seasonSynopsis || mediaOverview}
                  </p>
                </div>
              )}

              {/* Creators, Showrunners, Director & Writers */}
              {(creators.length > 0 || showrunners.length > 0 || director || writers.length > 0) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* TV Show Creators */}
                  {creators.length > 0 && (
                    <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex flex-col gap-1.5">
                      <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Sparkles size={11} className="text-[#9b5cff]" />
                        Creator{creators.length > 1 ? 's' : ''}
                      </span>
                      <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                        {creators.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(`/explore?personId=${c.id}`);
                            }}
                            className="text-left text-xs font-black text-white hover:text-[#9b5cff] uppercase tracking-wider truncate transition-colors"
                            title={`View ${c.name}'s works in Explore`}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* TV Show Showrunners */}
                  {showrunners.length > 0 && (
                    <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex flex-col gap-1.5">
                      <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Tv size={11} className="text-purple-400" />
                        Showrunner{showrunners.length > 1 ? 's' : ''}
                      </span>
                      <div className="flex flex-wrap gap-x-2.5 gap-y-1">
                        {showrunners.map((sr) => (
                          <button
                            key={sr.id}
                            type="button"
                            onClick={() => {
                              onClose();
                              navigate(`/explore?personId=${sr.id}`);
                            }}
                            className="text-left text-xs font-black text-white hover:text-[#9b5cff] uppercase tracking-wider truncate transition-colors"
                            title={`View ${sr.name}'s works in Explore`}
                          >
                            {sr.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Director */}
                  {director && (
                    <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex flex-col gap-1.5">
                      <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <Clapperboard size={11} className="text-purple-400" />
                        Director
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          navigate(`/explore?personId=${director.id}`);
                        }}
                        className="text-left text-xs font-black text-white hover:text-[#9b5cff] uppercase tracking-wider truncate transition-colors"
                        title={`View ${director.name}'s works`}
                      >
                        {director.name}
                      </button>
                    </div>
                  )}

                  {/* Writers */}
                  {writers.length > 0 && (
                    <div className="p-3 bg-white/[0.02] border border-white/[0.04] rounded-2xl flex flex-col gap-1.5">
                      <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                        <PenTool size={11} className="text-zinc-400" />
                        Writer{writers.length > 1 ? 's' : ''}
                      </span>
                      <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider truncate">
                        {writers.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* MOVIE CAST SECTION */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <h5 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Users size={13} className="text-[#9b5cff]" />
                    {activeEntry.type === 'tv' ? 'Series Cast' : 'Movie Cast'}
                  </h5>
                  <div className="flex items-center gap-2">
                    {cast.length > 0 && (
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                        {cast.length} {cast.length === 1 ? 'Actor' : 'Actors'}
                      </span>
                    )}
                    {cast.length > 3 && (
                      <div className="hidden sm:flex items-center gap-1 ml-1">
                        <button
                          type="button"
                          onClick={() => scrollCast('left')}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors active:scale-95 border border-white/5"
                          title="Scroll Left"
                          aria-label="Scroll cast left"
                        >
                          <ChevronLeft size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => scrollCast('right')}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors active:scale-95 border border-white/5"
                          title="Scroll Right"
                          aria-label="Scroll cast right"
                        >
                          <ChevronRight size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {isLoadingCast ? (
                  <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-1 px-1">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="w-24 sm:w-28 shrink-0 flex flex-col gap-2 animate-pulse">
                        <div className="w-full aspect-[3/4] rounded-2xl bg-zinc-900/80 border border-white/5" />
                        <div className="h-3 bg-zinc-900 rounded w-4/5" />
                        <div className="h-2 bg-zinc-900/60 rounded w-3/5" />
                      </div>
                    ))}
                  </div>
                ) : cast.length > 0 ? (
                  <div
                    ref={castScrollRef}
                    className="flex gap-3 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-1 px-1 scroll-smooth"
                  >
                    {cast.map((member) => (
                      <button
                        key={`${member.id}-${member.order ?? 0}`}
                        type="button"
                        onClick={() => {
                          onClose();
                          navigate(`/explore?personId=${member.id}`);
                        }}
                        title={`${member.name}${member.character ? ` as ${member.character}` : ''} • Click to explore filmography`}
                        className="group flex flex-col w-24 sm:w-28 shrink-0 text-left focus:outline-none active:scale-95 transition-transform"
                      >
                        <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 group-hover:border-[#9b5cff]/50 shadow-md group-hover:shadow-lg group-hover:shadow-purple-500/10 transition-all duration-300">
                          {member.profile_path ? (
                            <img
                              src={`${TMDB_IMAGE_BASE}${member.profile_path}`}
                              alt={member.name}
                              referrerPolicy="no-referrer"
                              loading="lazy"
                              className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-zinc-900/80 text-zinc-600 gap-1 p-2">
                              <Users size={22} className="opacity-40" />
                              <span className="text-[7px] font-black uppercase text-zinc-600 tracking-wider">No Photo</span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        </div>
                        <div className="mt-2 space-y-0.5 px-0.5">
                          <p className="font-bold text-[11px] text-zinc-200 group-hover:text-[#9b5cff] truncate leading-tight transition-colors">
                            {member.name}
                          </p>
                          {member.character && (
                            <p className="text-[9px] font-medium text-zinc-500 truncate leading-tight">
                              {member.character}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] text-center">
                    <p className="text-zinc-600 text-xs italic">Movie cast details currently unavailable for this title.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Opinion/Review section */}
            <div className="space-y-3 pt-2 border-t border-white/[0.04]">
              <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                <MessageSquare size={13} />
                My Review & Opinion
              </h4>
              {activeEntry.review ? (
                <div className="relative p-6 sm:p-8 bg-zinc-900/60 border border-white/[0.06] rounded-[2rem] overflow-hidden">
                  {/* Subtle quote icon watermarks */}
                  <div className="absolute top-4 left-4 text-white/5 text-7xl font-serif select-none pointer-events-none">“</div>
                  <div className="absolute bottom-2 right-4 text-white/5 text-7xl font-serif select-none pointer-events-none">”</div>
                  <p className="text-zinc-200 text-sm sm:text-base leading-relaxed italic relative z-10 font-medium">
                    {activeEntry.review}
                  </p>
                </div>
              ) : (
                <p className="text-zinc-600 text-xs italic">No written thoughts logged for this entry.</p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-4 pt-6 border-t border-white/[0.04]">
              <button
                onClick={() => onEdit(activeEntry)}
                className="flex-1 py-4 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all active:scale-95"
              >
                <Edit2 size={14} />
                Edit Record
              </button>
              <button
                onClick={() => onDelete(activeEntry.id)}
                className="flex-1 py-4 bg-red-600/10 border border-red-500/20 hover:bg-red-600/20 text-red-400 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2.5 transition-all active:scale-95"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        </motion.div>

        {/* Zoom Lightbox Modal */}
        {isZoomedIn && (
          <div
            onClick={() => setIsZoomedIn(false)}
            className="fixed inset-0 z-[9999] bg-black/98 md:backdrop-blur-2xl flex flex-col items-center justify-center p-4 cursor-zoom-out"
          >
            {/* Top Right Controls */}
            <div className="absolute top-6 right-6 z-10 flex items-center gap-3">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] bg-white/5 px-3 py-1.5 rounded-full border border-white/10">Tap Anywhere to Exit</span>
              <button
                onClick={() => setIsZoomedIn(false)}
                className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white rounded-2xl backdrop-blur-md transition-colors"
                title="Close Zoom"
              >
                <X size={18} />
              </button>
            </div>

            {/* Top Left Change Poster Control */}
            <div className="absolute top-6 left-6 z-10">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAlternativePosters(true);
                }}
                className="p-2.5 bg-purple-500 hover:bg-purple-600 text-white rounded-2xl border border-purple-400 shadow-lg shadow-purple-500/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center cursor-pointer"
                title="Change Poster"
              >
                <Sparkles size={18} />
              </button>
            </div>

            <div
              className="relative max-w-full max-h-[90vh] flex flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={activeEntry.posterUrl}
                alt="Enlarged Poster"
                className={`max-h-[90vh] max-w-[90vw] md:max-h-[85vh] object-contain rounded-[2rem] border border-white/10 shadow-2xl select-none transition-all duration-500 ${isBlurred ? 'blur-2xl' : 'blur-0'}`}
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        )}

        {/* Alternative Posters Modal */}
        <AlternativePosterModal
          isOpen={showAlternativePosters}
          onClose={() => setShowAlternativePosters(false)}
          tmdbId={activeEntry.tmdbId}
          type={activeEntry.type}
          currentPosterUrl={activeEntry.posterUrl}
          onSelect={async (newUrl) => {
            try {
              await updateEntry({ ...activeEntry, posterUrl: newUrl });
              toast.success("Poster updated successfully!");
              setShowAlternativePosters(false);
            } catch (err) {
              console.error(err);
              toast.error("Failed to update poster.");
            }
          }}
          title={`Alternative Posters: ${entryTitle}`}
        />
      </div>
    </AnimatePresence>,
    document.body
  );
};

export default ExpandableDetailModal;
