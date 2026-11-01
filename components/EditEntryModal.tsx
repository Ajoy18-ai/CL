
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calendar, MessageSquare, Save, Play, Sparkles, Heart, Loader2, Info, Star, Clock, Languages, Video, PenTool, Users, User, ChevronLeft, ChevronRight, Tv } from 'lucide-react';
import { WatchEntry, Rating } from '../types';
import RatingButtons from './RatingButtons';
import StreamSourcesModal from './StreamSourcesModal';
import { CustomDatePicker } from './CustomDatePicker';
import { fetchMediaDetails, fetchMediaCredits, searchTMDB } from '../services/api';
import { TMDB_IMAGE_BASE } from '../constants';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlternativePosterModal } from './AlternativePosterModal';
import { formatRuntimeHM } from './formater';

interface EditEntryModalProps {
  entry?: WatchEntry | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: WatchEntry) => void;
}

interface ExtraDetails {
  overview: string;
  tagline: string;
  vote_average: number;
  genres: string[];
  runtime: number;
  original_language: string;
  director: string;
  directorId?: number | null;
  writer: string;
  producer: string;
  cast: { id: number; name: string; image: string | null; character: string }[];
  studios: string[];
  creators?: { id: number; name: string }[];
  showrunners?: { id: number; name: string }[];
  releaseYear?: string;
}

const EditEntryModal: React.FC<EditEntryModalProps> = ({ entry, isOpen, onClose, onSave }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [rating, setRating] = useState<Rating>(entry?.rating || Rating.GOOD);
  const [isVague, setIsVague] = useState(!!entry?.isVague);
  const [isAbsoluteCinema, setIsAbsoluteCinema] = useState(!!entry?.isAbsoluteCinema);
  const [isRewatch, setIsRewatch] = useState(!!entry?.isRewatch);
  const [isFavorite, setIsFavorite] = useState(!!entry?.isFavorite);
  const [date, setDate] = useState(entry?.watchDate || new Date().toISOString().split('T')[0]);
  const [review, setReview] = useState(entry?.review || '');
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extraDetails, setExtraDetails] = useState<ExtraDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [posterUrl, setPosterUrl] = useState(entry?.posterUrl || '');
  const [showAlternativePosters, setShowAlternativePosters] = useState(false);
  const castScrollRef = useRef<HTMLDivElement>(null);

  const scrollCast = (direction: 'left' | 'right') => {
    if (castScrollRef.current) {
      const scrollOffset = direction === 'left' ? -260 : 260;
      castScrollRef.current.scrollBy({ left: scrollOffset, behavior: 'smooth' });
    }
  };

  const fetchFullDetails = async () => {
    if (extraDetails || !entry) return;
    setIsLoadingDetails(true);
    try {
      let resolvedId = entry.tmdbId ? Number(entry.tmdbId) : 0;
      let resolvedType: 'movie' | 'tv' = entry.type || 'movie';

      if (!resolvedId || isNaN(resolvedId)) {
        const cleanTitle = (entry.title || '').replace(/\s*-\s*Season\s*\d+.*/i, '').trim();
        if (cleanTitle) {
          const results = await searchTMDB(cleanTitle);
          if (results && results.length > 0) {
            resolvedId = results[0].id;
            resolvedType = (results[0].media_type as 'movie' | 'tv') || resolvedType;
          }
        }
      }

      if (!resolvedId) return;

      const [details, credits] = await Promise.all([
        fetchMediaDetails(resolvedId, resolvedType),
        fetchMediaCredits(resolvedId, resolvedType)
      ]);

      const crew = credits?.crew || [];
      const castList = credits?.cast || [];
      const directorObj = crew.find((c: any) => c.job === 'Director');
      const director = directorObj?.name || 'Unknown';
      const directorId = directorObj?.id || null;
      const writerList = crew.filter((c: any) => ['Writer', 'Screenplay', 'Author', 'Teleplay', 'Story'].includes(c.job));
      const writer = writerList.length > 0 ? writerList.map((w: any) => w.name).slice(0, 2).join(', ') : 'Unknown';
      const producerList = crew.filter((c: any) => ['Producer', 'Executive Producer'].includes(c.job));
      const producer = producerList.length > 0 ? producerList.map((p: any) => p.name).slice(0, 2).join(', ') : 'Unknown';
      const cast = castList.slice(0, 24).map((c: any) => ({
        id: c.id,
        name: c.name,
        image: c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : null,
        character: c.character
      }));

      // Extract Creators and Showrunners for TV
      let creators: { id: number; name: string }[] = [];
      if (details?.created_by && details.created_by.length > 0) {
        creators = details.created_by.map((c: any) => ({ id: c.id, name: c.name }));
      }
      const creatorCrew = crew.filter((c: any) => c.job === 'Creator').map((c: any) => ({ id: c.id, name: c.name }));
      if (creatorCrew.length > 0) {
        creators = [...new Map([...creators, ...creatorCrew].map((item: any) => [item.id, item])).values()] as { id: number; name: string }[];
      }

      const showrunners = [...new Map(
        crew
          .filter((c: any) => c.job === 'Showrunner' || c.job === 'Executive Producer / Showrunner')
          .map((c: any) => [c.id, { id: c.id, name: c.name }])
      ).values()] as { id: number; name: string }[];

      setExtraDetails({
        ...details,
        director,
        directorId,
        writer,
        producer,
        cast,
        creators,
        showrunners
      });
    } catch (e) {
      console.error("Details fetch failed:", e);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    const root = document.getElementById('root');
    if (isOpen && entry) {
      if (root) root.style.overflow = 'hidden';
      setRating(entry.rating || Rating.GOOD);
      setIsVague(!!entry.isVague);
      setIsAbsoluteCinema(!!entry.isAbsoluteCinema);
      setIsRewatch(!!entry.isRewatch);
      setIsFavorite(!!entry.isFavorite);
      setDate(entry.watchDate || new Date().toISOString().split('T')[0]);
      setReview(entry.review || '');
      setPosterUrl(entry.posterUrl || '');
      fetchFullDetails();
    } else {
      if (root) root.style.overflow = 'auto';
      setExtraDetails(null);
    }
    return () => {
      if (root) root.style.overflow = 'auto';
    };
  }, [isOpen, entry?.id]);

  if (!isOpen || !entry) return null;

  const handleSave = async () => {
    if (!entry) return;
    setIsSaving(true);
    onSave({
      ...entry,
      rating,
      isVague,
      isAbsoluteCinema,
      isRewatch,
      isFavorite,
      watchDate: date,
      review,
      posterUrl,
      year: new Date(date).getFullYear(),
      releaseYear: extraDetails?.releaseYear || entry.releaseYear,
      studios: extraDetails?.studios || entry.studios
    });
    setIsSaving(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[12000] flex items-center justify-center p-0 sm:p-4 md:p-8 overflow-hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/95 md:backdrop-blur-xl z-0"
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ transform: 'translateZ(0)' }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full h-full sm:h-auto sm:max-w-2xl bg-[#0c0c0e] sm:border sm:border-white/5 sm:rounded-[3.5rem] shadow-[0_0_150px_rgba(0,0,0,1)] flex flex-col max-h-[100dvh] sm:max-h-[95dvh] z-10 overflow-hidden"
          >
            <div className="absolute top-6 right-6 z-[60] flex items-center gap-3">
              <button
                type="button"
                onClick={() => { fetchFullDetails(); setShowInfoModal(true); }}
                className="p-3 bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all border border-white/10 hover:border-white/20 active:scale-90"
              >
                <Info size={20} />
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-3 bg-white/10 rounded-full text-zinc-400 hover:text-white transition-all border border-white/10 hover:border-white/20 active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-6 md:px-10 py-10 space-y-12 overscroll-contain">
              <header className="flex flex-col items-center text-center space-y-6 pt-4">
                <div
                  onClick={() => setShowAlternativePosters(true)}
                  className="relative group cursor-pointer"
                  title="Click to Choose Alternative Poster"
                >
                  <motion.img
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    src={posterUrl}
                    className="w-44 md:w-56 rounded-2xl md:rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] border border-white/10 relative z-10 transition-transform duration-500 group-hover:scale-105"
                    alt={entry.title}
                  />
                  {/* Elegant overlay hover indicator */}
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 rounded-2xl md:rounded-[2rem] opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <div className="p-3 bg-purple-500 text-white rounded-full shadow-lg border border-purple-400 scale-90 group-hover:scale-100 transition-transform duration-300">
                      <Sparkles size={18} />
                    </div>
                    <span className="text-[8px] font-black uppercase text-purple-300 tracking-[0.2em] mt-3">Change Poster</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <span className="inline-block px-3 py-1 rounded-full bg-[#111] border border-white/5 text-zinc-600 text-[8px] font-black uppercase tracking-[0.3em]">
                    LOG #{entry.id.slice(-4).toUpperCase()}
                  </span>

                  <h2 className="text-4xl md:text-5xl font-black italic text-white uppercase tracking-tighter leading-none px-4">
                    {entry.title}
                  </h2>

                  <div className="flex items-center justify-center gap-4">
                    <span className="px-3 py-1.5 rounded-xl bg-white/5 text-zinc-400 text-[9px] font-black uppercase tracking-[0.2em] border border-white/5">
                      {entry.type === 'tv' ? 'Series' : 'Movie'}
                    </span>
                    <span className="text-zinc-600 font-bold uppercase tracking-widest text-[10px]">{entry.releaseYear || entry.year}</span>
                    <button
                       type="button"
                       onClick={() => setIsFavorite(!isFavorite)}
                       className={`p-1.5 rounded-lg transition-all ${isFavorite ? 'text-red-500' : 'text-zinc-800 hover:text-zinc-600'}`}
                    >
                      <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowStreamModal(true)}
                    className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] px-8 py-4 rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all shadow-xl italic mt-2"
                  >
                    <Play size={14} fill="currentColor" /> Stream Entry
                  </button>
                </div>
              </header>

              <section className="space-y-6">
                <div className="flex items-center gap-4 px-2">
                  <Sparkles size={14} className="text-[#9b5cff]" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 italic whitespace-nowrap">Quality Assessment</h3>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <RatingButtons
                  rating={rating}
                  isVague={isVague}
                  isAbsoluteCinema={isAbsoluteCinema}
                  isRewatch={isRewatch}
                  onRatingChange={setRating}
                  onVagueToggle={setIsVague}
                  onAbsoluteCinemaToggle={setIsAbsoluteCinema}
                  onRewatchToggle={setIsRewatch}
                />
              </section>

              {/* Observation Date */}
              <section className="space-y-4">
                <label className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400 px-1">
                  <Calendar size={14} className="text-[#9b5cff]" /> Observation Date
                </label>
                <CustomDatePicker
                  value={date}
                  onChange={setDate}
                />
              </section>

              {/* Narrative Notes — Clean Full Width Resizable Text Box */}
              <section className="space-y-3 pt-2 border-t border-white/5">
                <label htmlFor="narrative-notes-textarea" className="flex items-center gap-3 text-[10px] font-black uppercase tracking-[0.4em] text-zinc-300 px-1">
                  <MessageSquare size={14} className="text-[#9b5cff]" /> Narrative Notes
                </label>
                <textarea
                  id="narrative-notes-textarea"
                  className="w-full bg-[#09090b] border border-white/10 rounded-2xl p-5 text-zinc-100 font-normal text-sm sm:text-base min-h-[200px] md:min-h-[260px] max-h-[700px] resize-y outline-none placeholder:text-zinc-600 leading-relaxed focus:border-purple-500/60 focus:ring-1 focus:ring-purple-500/30 transition-all font-sans"
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  placeholder="Capture your immediate resonance, scenes, reflections, and thoughts..."
                  rows={8}
                />
              </section>

              <div className="pt-4 pb-12">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`w-full py-7 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.5em] flex items-center justify-center gap-4 transition-all active:scale-[0.98] shadow-2xl italic
                    ${isSaving ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-black hover:bg-zinc-100'}`}
                >
                  {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  {isSaving ? 'Archiving...' : 'Commit Changes'}
                </button>
              </div>
            </div>
          </motion.div>

          <StreamSourcesModal
            isOpen={showStreamModal}
            onClose={() => setShowStreamModal(false)}
            media={entry}
          />

          <AnimatePresence>
            {showInfoModal && (
              <div className="fixed inset-0 z-[12100] flex items-center justify-center p-4 md:p-6">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowInfoModal(false)} className="absolute inset-0 bg-black/95 md:backdrop-blur-xl" />
                <motion.div
                  initial={{ opacity: 0, scale: 0.98, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: 16 }}
                  transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  style={{ transform: 'translateZ(0)' }}
                  className="relative w-full max-w-2xl bg-[#09090b] rounded-[3rem] border border-white/10 p-6 md:p-12 shadow-2xl flex flex-col gap-6 md:gap-8 max-h-[90vh] overflow-hidden"
                >
                  <div className="flex justify-between items-start gap-6 shrink-0">
                    <div className="space-y-1">
                      <h3 className="text-2xl md:text-3xl font-[900] text-white italic uppercase tracking-tighter leading-tight">{entry.title}</h3>
                      {extraDetails?.tagline && <p className="text-purple-500 font-black uppercase tracking-[0.3em] text-[10px] italic">{extraDetails.tagline}</p>}
                      {((extraDetails?.studios && extraDetails.studios.length > 0) ? extraDetails.studios : (entry.studios || [])).length > 0 && (
                        <p className="text-[10px] font-black text-purple-400 bg-purple-500/5 px-2.5 py-1 rounded-md border border-purple-500/10 inline-block uppercase tracking-[0.2em] mt-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[280px] sm:max-w-md">
                          {((extraDetails?.studios && extraDetails.studios.length > 0) ? extraDetails.studios : (entry.studios || [])).slice(0, 3).join(' • ')}
                        </p>
                      )}
                    </div>
                    <button onClick={() => setShowInfoModal(false)} className="p-3 bg-white/5 rounded-2xl hover:text-white transition-colors"><X size={20} /></button>
                  </div>

                  {isLoadingDetails ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
                      <Loader2 className="animate-spin text-zinc-700" size={32} />
                      <p className="text-[8px] font-black text-zinc-800 uppercase tracking-widest italic">Decrypting Archives...</p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto no-scrollbar space-y-10 overscroll-contain pb-10">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">Global Rating</p>
                          <div className="flex items-center gap-2">
                            <Star className="text-yellow-500 fill-yellow-500" size={14} />
                            <p className="text-xl font-black text-white italic">{extraDetails?.vote_average.toFixed(1)}</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">Runtime</p>
                          <div className="flex items-center gap-2 text-white">
                            <Clock size={14} className="text-zinc-500" />
                            <p className="text-xl font-black italic">{extraDetails?.runtime ? formatRuntimeHM(extraDetails.runtime) : 'N/A'}</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">Language</p>
                          <div className="flex items-center gap-2 text-white">
                            <Languages size={14} className="text-zinc-500" />
                            <p className="text-xl font-black italic uppercase">{extraDetails?.original_language}</p>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">Released</p>
                          <div className="flex items-center gap-2 text-white">
                            <Calendar size={14} className="text-zinc-500" />
                            <p
                              onClick={() => {
                                const yearStr = extraDetails?.releaseYear || entry.releaseYear || entry.year;
                                if (yearStr) {
                                  const yearInt = parseInt(String(yearStr));
                                  if (!isNaN(yearInt)) {
                                    onClose();
                                    navigate(`/explore?tab=years&year=${yearInt}&mediaType=${entry.type || 'movie'}`);
                                  }
                                }
                              }}
                              className="text-xl font-black italic hover:text-purple-400 cursor-pointer transition-colors duration-200"
                              title="Browse this year"
                            >
                              {extraDetails?.releaseYear || entry.releaseYear || entry.year}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.4em]">Narrative Scope</p>
                        <p className="text-sm md:text-base text-zinc-400 leading-relaxed font-medium italic">
                          {extraDetails?.overview || "No transmission data found for this record."}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                        {/* TV Show Creators */}
                        {extraDetails?.creators && extraDetails.creators.length > 0 && (
                          <div className="space-y-1">
                             <div className="flex items-center gap-2 text-zinc-700">
                                <Sparkles size={12} className="text-[#9b5cff]" />
                                <p className="text-[8px] font-black uppercase tracking-[0.3em]">
                                  Creator{extraDetails.creators.length > 1 ? 's' : ''}
                                </p>
                             </div>
                             <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                               {extraDetails.creators.map((c) => (
                                 <button
                                   key={c.id}
                                   type="button"
                                   onClick={() => {
                                     onClose();
                                     navigate(`/explore?personId=${c.id}`, { state: { from: location.pathname + location.search } });
                                   }}
                                   className="text-xs font-black text-white hover:text-[#9b5cff] italic uppercase truncate transition-colors text-left focus:outline-none"
                                   title={`View ${c.name}'s works in Explore`}
                                 >
                                   {c.name}
                                 </button>
                               ))}
                             </div>
                          </div>
                        )}

                        {/* TV Show Showrunners */}
                        {extraDetails?.showrunners && extraDetails.showrunners.length > 0 && (
                          <div className="space-y-1">
                             <div className="flex items-center gap-2 text-zinc-700">
                                <Tv size={12} className="text-purple-400" />
                                <p className="text-[8px] font-black uppercase tracking-[0.3em]">
                                  Showrunner{extraDetails.showrunners.length > 1 ? 's' : ''}
                                </p>
                             </div>
                             <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                               {extraDetails.showrunners.map((sr) => (
                                 <button
                                   key={sr.id}
                                   type="button"
                                   onClick={() => {
                                     onClose();
                                     navigate(`/explore?personId=${sr.id}`, { state: { from: location.pathname + location.search } });
                                   }}
                                   className="text-xs font-black text-white hover:text-[#9b5cff] italic uppercase truncate transition-colors text-left focus:outline-none"
                                   title={`View ${sr.name}'s works in Explore`}
                                 >
                                   {sr.name}
                                 </button>
                               ))}
                             </div>
                          </div>
                        )}

                        {(!entry || entry.type !== 'tv' || (!extraDetails?.creators?.length && !extraDetails?.showrunners?.length)) && (
                          <div className="space-y-1">
                             <div className="flex items-center gap-2 text-zinc-700">
                                <Video size={12} />
                                <p className="text-[8px] font-black uppercase tracking-[0.3em]">Director</p>
                             </div>
                             {extraDetails?.directorId ? (
                               <button
                                 onClick={() => {
                                   onClose();
                                   navigate(`/explore?personId=${extraDetails.directorId}`, { state: { from: location.pathname + location.search } });
                                 }}
                                 className="text-xs font-black text-white hover:text-purple-400 italic uppercase truncate transition-colors text-left focus:outline-none"
                               >
                                 {extraDetails?.director}
                               </button>
                             ) : (
                               <p className="text-xs font-black text-white italic uppercase truncate">{extraDetails?.director}</p>
                             )}
                          </div>
                        )}

                        <div className="space-y-1">
                           <div className="flex items-center gap-2 text-zinc-700">
                              <PenTool size={12} />
                              <p className="text-[8px] font-black uppercase tracking-[0.3em]">Writer</p>
                           </div>
                           <p className="text-xs font-black text-white italic uppercase truncate">{extraDetails?.writer}</p>
                        </div>

                        <div className="space-y-1">
                           <div className="flex items-center gap-2 text-zinc-700">
                              <Users size={12} />
                              <p className="text-[8px] font-black uppercase tracking-[0.3em]">Producer</p>
                           </div>
                           <p className="text-xs font-black text-white italic uppercase truncate">{extraDetails?.producer}</p>
                        </div>
                      </div>

                      {/* MOVIE CAST SECTION */}
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center justify-between">
                          <h5 className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Users size={13} className="text-[#9b5cff]" />
                            {entry?.type === 'tv' ? 'Series Cast' : 'Movie Cast'}
                          </h5>
                          <div className="flex items-center gap-2">
                            {extraDetails?.cast && extraDetails.cast.length > 0 && (
                              <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest px-2 py-0.5 rounded-md bg-white/5 border border-white/5">
                                {extraDetails.cast.length} {extraDetails.cast.length === 1 ? 'Actor' : 'Actors'}
                              </span>
                            )}
                            {extraDetails?.cast && extraDetails.cast.length > 3 && (
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

                        {extraDetails?.cast && extraDetails.cast.length > 0 ? (
                          <div
                            ref={castScrollRef}
                            className="flex gap-3 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-1 px-1 scroll-smooth"
                          >
                            {extraDetails.cast.map((member, idx) => (
                              <button
                                key={`${member.id}-${idx}`}
                                type="button"
                                onClick={() => {
                                  onClose();
                                  navigate(`/explore?personId=${member.id}`, { state: { from: location.pathname + location.search } });
                                }}
                                title={`${member.name}${member.character ? ` as ${member.character}` : ''} • Click to explore filmography`}
                                className="group flex flex-col w-24 sm:w-28 shrink-0 text-left focus:outline-none active:scale-95 transition-transform"
                              >
                                <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 group-hover:border-[#9b5cff]/50 shadow-md group-hover:shadow-lg group-hover:shadow-purple-500/10 transition-all duration-300">
                                  {member.image ? (
                                    <img
                                      src={member.image}
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

                      <div className="space-y-4">
                        <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.4em]">Atmosphere</p>
                        <div className="flex flex-wrap gap-2">
                          {extraDetails?.genres.map(g => (
                            <span key={g} className="px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-[9px] font-black text-zinc-500 uppercase tracking-widest">{g}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="shrink-0">
                    <button onClick={() => setShowInfoModal(false)} className="w-full py-5 bg-white text-black rounded-[2rem] font-black text-[10px] uppercase tracking-[0.5em] italic shadow-2xl">Dismiss View</button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AlternativePosterModal
            isOpen={showAlternativePosters}
            onClose={() => setShowAlternativePosters(false)}
            tmdbId={entry.tmdbId}
            type={entry.type}
            currentPosterUrl={posterUrl}
            onSelect={(newUrl) => {
              setPosterUrl(newUrl);
              setShowAlternativePosters(false);
            }}
            title={`Alternative Posters: ${entry.title}`}
          />
        </div>
      )}
    </AnimatePresence>
  );
};

export default EditEntryModal;
