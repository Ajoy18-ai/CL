
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WatchEntry, Rating } from '../types';
import { RATING_CONFIG } from '../constants';
import { Trash2, Clapperboard, Edit2, Repeat2, ChevronRight, MoreHorizontal, X, Star, CheckCircle2, Eye, EyeOff, Copy } from 'lucide-react';
import EditEntryModal from './EditEntryModal';
import ExpandableDetailModal from './ExpandableDetailModal';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import { CachedImage } from './CachedImage';
import { useNavigate } from 'react-router-dom';
import { formatRuntimeHM } from './formater';

interface EntryCardProps {
  entry: WatchEntry;
  viewMode: 'grid' | 'list';
  logIndex?: number;
  index?: number;
  onDelete: (id: string) => void;
}

const cardDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Dhaka'
});

const EntryCard: React.FC<EntryCardProps> = ({ entry, viewMode, logIndex, index, onDelete }) => {
  if (!entry) return null;
  const navigate = useNavigate();
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { updateEntry, blurPosters } = useStore();
  const toast = useToastStore();
  const isBlurred = blurPosters || entry.isBlurred;
  const isLcp = index !== undefined && index < 4; // Check if the image renders above-the-fold (LCP candidate)

  const ratingCfg = RATING_CONFIG[entry.rating] || RATING_CONFIG[Rating.GOOD];
  const isVague = entry.isVague || entry.rating === Rating.VAGUE;
  const isAbsoluteCinema = entry.isAbsoluteCinema;
  const isRewatch = entry.isRewatch;

  const formatDate = (dateStr: string) => {
    if (entry.datePrecision === 'unknown' || dateStr === '0000-00-00') {
      return 'Date Unknown';
    }
    if (entry.datePrecision === 'year' || entry.approximateYear) {
      return `~${entry.approximateYear || dateStr.split('-')[0]}`;
    }
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime()) || date.getFullYear() <= 1900) return 'Date Unknown';
      return cardDateFormatter.format(date);
    } catch (e) {
      return dateStr;
    }
  };

  useEffect(() => {
    setShowMobileActions(false);
  }, [viewMode]);

  const handleCardClick = () => {
    if (viewMode === 'list') {
      setShowMobileActions(!showMobileActions);
    } else if (window.matchMedia('(max-width: 1024px)').matches) {
      setShowMobileActions(!showMobileActions);
    }
  };

  const handleUpdate = (updated: WatchEntry) => {
    updateEntry(updated);
    setIsEditModalOpen(false);
  };

  if (viewMode === 'list') {
    return (
      <>
        <div
          onClick={() => setIsExpanded(true)}
          style={{ transform: 'translateZ(0)' }}
          className="content-auto group flex items-center gap-6 py-6 px-4 border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors cursor-pointer relative"
        >
          {/* Index */}
          <div className="w-10 shrink-0">
             <span className="text-xs font-black text-zinc-700 tabular-nums uppercase">{logIndex}</span>
          </div>

          {/* Upgraded Thumbnail Size */}
          <div
            className="w-16 h-24 md:w-20 md:h-28 shrink-0 rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-lg relative group/poster"
          >
            <CachedImage
              src={entry.posterUrl}
              alt=""
              loading={isLcp ? "eager" : "lazy"}
              {...(isLcp ? { fetchPriority: "high" } : {})}
              className={`w-full h-full object-cover transition-[transform,filter] duration-300 ease-out ${isBlurred ? 'blur-2xl scale-110' : 'blur-0 scale-100'}`}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUpdate({ ...entry, isBlurred: !entry.isBlurred });
              }}
              className={`absolute top-1 right-1 p-1.5 bg-black/80 rounded-lg border border-white/10 text-zinc-400 hover:text-white transition-opacity duration-200 ${entry.isBlurred ? 'opacity-100' : 'opacity-0 group-hover/poster:opacity-100'}`}
              title={entry.isBlurred ? "Unblur Poster" : "Blur Poster"}
            >
              {entry.isBlurred ? <EyeOff size={10} /> : <Eye size={10} />}
            </button>
          </div>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <h3
                className={`text-base md:text-xl font-black text-zinc-100 truncate uppercase italic leading-tight tracking-tight cursor-pointer hover:text-[#9b5cff] transition-colors duration-200 flex items-center gap-1.5 group/title ${isBlurred ? 'blur-[6px] select-none hover:blur-none' : 'blur-0'}`}
                title="Click to copy entry name"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(entry.title);
                  toast.success(`Copied: "${entry.title}"`);
                }}
              >
                {entry.title}
                <Copy size={12} className="opacity-0 group-hover/title:opacity-100 text-[#9b5cff] transition-opacity shrink-0 hidden sm:inline" />
              </h3>
              <div
                className="flex items-center gap-1.5"
              >
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    const yearStr = entry.releaseYear || entry.year;
                    if (yearStr) {
                      const yearInt = parseInt(String(yearStr));
                      if (!isNaN(yearInt)) {
                        navigate(`/explore?tab=years&year=${yearInt}&mediaType=${entry.type || 'movie'}`);
                      }
                    }
                  }}
                  className="text-[11px] font-black text-zinc-600 hover:text-purple-400 cursor-pointer uppercase tracking-widest transition-colors duration-200"
                  title="Browse this year"
                >
                  {entry.releaseYear || entry.year}
                </span>
                {entry.episodeCount ? (
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                    {entry.episodeCount} EP
                  </span>
                ) : entry.runtime ? (
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                    {formatRuntimeHM(entry.runtime)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
               {/* Rating Indicator */}
               <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-white/5 border border-white/5">
                 <div className={`w-2 h-2 rounded-full ${ratingCfg.color} shadow-sm`} />
                 <span className={`text-[9px] font-black uppercase tracking-wider ${ratingCfg.text}`}>{ratingCfg.label}</span>
               </div>

               {/* Tags with more visual weight */}
               <div className="flex items-center gap-3">
                 {isRewatch && (
                    <div className="flex items-center gap-1.5 text-emerald-500/80 bg-emerald-500/5 px-2 py-0.5 rounded-md border border-emerald-500/10">
                      <Repeat2 size={12} />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em]">REWATCH</span>
                    </div>
                 )}
                 {isVague && (
                    <div className="flex items-center gap-1.5 text-zinc-500 bg-white/5 px-2 py-0.5 rounded-md border border-white/5">
                      <Clapperboard size={12} />
                      <span className="text-[8px] font-black uppercase tracking-[0.2em]">VAGUE</span>
                    </div>
                 )}
                 {isAbsoluteCinema && (
                    <div className="flex items-center gap-1.5 text-purple-500 bg-purple-500/5 px-2 py-0.5 rounded-md border border-purple-500/10">
                      <span className="text-[12px] whitespace-nowrap">✋😮🤚</span>
                      <span className="text-[8px] font-black uppercase tracking-[0.2em]">CINEMA</span>
                    </div>
                 )}
               </div>
            </div>
          </div>

          {/* Date with increased size */}
          <div className="hidden md:block shrink-0 px-6">
             <span className="text-xs font-black text-zinc-700 uppercase tracking-widest tabular-nums">{formatDate(entry.watchDate)}</span>
          </div>

          {/* Action Icons */}
          <div
            id={`list-actions-container-${entry.id}`}
            className="hidden lg:flex items-center gap-6 opacity-0 group-hover:opacity-100 transition-opacity"
          >
             <button
               id={`list-edit-btn-${entry.id}`}
               onClick={(e) => { e.stopPropagation(); setIsEditModalOpen(true); }}
               className="text-zinc-600 hover:text-white transition-colors"
               title="Edit Entry"
             >
               <Edit2 size={18} />
             </button>
             <button
               id={`list-delete-btn-${entry.id}`}
               onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
               className="text-zinc-600 hover:text-red-500 transition-colors"
               title="Delete Entry"
             >
               <Trash2 size={18} />
             </button>
          </div>

          <div className="lg:hidden ml-auto text-zinc-800">
             <MoreHorizontal size={20} />
          </div>

          {/* Mobile Actions Overlay */}
          <AnimatePresence>
            {showMobileActions && (
              <motion.div
                id={`list-mobile-actions-${entry.id}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="absolute right-0 top-0 bottom-0 bg-zinc-950/98 backdrop-blur-2xl flex items-center gap-6 px-10 z-10 border-l border-white/10"
              >
                <button
                  id={`list-mobile-edit-btn-${entry.id}`}
                  onClick={(e) => { e.stopPropagation(); setIsEditModalOpen(true); setShowMobileActions(false); }}
                  className="p-3.5 text-white bg-white/10 rounded-2xl"
                  title="Edit Entry"
                >
                  <Edit2 size={24} />
                </button>
                <button
                  id={`list-mobile-delete-btn-${entry.id}`}
                  onClick={(e) => { e.stopPropagation(); onDelete(entry.id); setShowMobileActions(false); }}
                  className="p-3.5 text-red-500 bg-red-500/10 rounded-2xl"
                  title="Delete Entry"
                >
                  <Trash2 size={24} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setShowMobileActions(false); }} className="p-3.5 text-zinc-500"><X size={24} /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {isExpanded && (
            <ExpandableDetailModal
              activeEntry={entry}
              onClose={() => setIsExpanded(false)}
              onDelete={(id) => {
                setIsExpanded(false);
                onDelete(id);
              }}
              onEdit={() => {
                setIsExpanded(false);
                setIsEditModalOpen(true);
              }}
            />
          )}
        </AnimatePresence>
        {isEditModalOpen && (
          <EditEntryModal entry={entry} isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSave={handleUpdate} />
        )}
      </>
    );
  }

  return (
    <>
      <div
        className="content-auto group cursor-pointer relative"
        style={{ transform: 'translateZ(0)' }}
        onClick={() => setIsExpanded(true)}
      >
        <div
          className="relative w-full aspect-[2/3] rounded-2xl md:rounded-[2rem] overflow-hidden shadow-lg shadow-black/30 mb-3 md:mb-4 transition-transform duration-200 ease-out active:scale-[0.97] lg:group-hover:scale-[1.02]"
        >
          <CachedImage
            src={entry.posterUrl}
            alt={entry.title}
            loading={isLcp ? "eager" : "lazy"}
            {...(isLcp ? { fetchPriority: "high" } : {})}
            className={`w-full h-full object-cover block bg-zinc-900 transition-[transform,filter] duration-300 ease-out ${isBlurred ? 'blur-2xl scale-110' : 'blur-0 scale-100'}`}
          />

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleUpdate({ ...entry, isBlurred: !entry.isBlurred });
            }}
            className={`absolute top-4 right-4 p-2.5 bg-black/80 rounded-xl border border-white/10 text-zinc-400 hover:text-white z-10 transition-opacity duration-200 ${showMobileActions || entry.isBlurred ? 'opacity-100' : 'opacity-0 lg:group-hover:opacity-100'}`}
            title={entry.isBlurred ? "Unblur Poster" : "Blur Poster"}
          >
            {entry.isBlurred ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>

          <div className="absolute top-4 left-4 flex flex-col gap-2">
            {isVague && (
              <div className="p-2 bg-black/85 rounded-xl border border-white/10 flex items-center gap-2">
                <Clapperboard size={12} className="text-zinc-400" />
                <span className="text-[8px] font-black text-zinc-400 uppercase tracking-widest">VAGUE</span>
              </div>
            )}
            {isRewatch && (
              <div className="p-2 bg-emerald-500/90 rounded-xl border border-white/10 flex items-center gap-2">
                <Repeat2 size={12} className="text-white" />
                <span className="text-[8px] font-black text-white uppercase tracking-widest">REWATCH</span>
              </div>
            )}
            {isAbsoluteCinema && (
              <div
                className="p-2 bg-[#9b5cff] rounded-xl border border-white/20 flex items-center gap-2 absolute-glow-active"
              >
                <span className="text-[10px] whitespace-nowrap">✋😮🤚</span>
              </div>
            )}
          </div>

          <div
            id={`grid-actions-overlay-${entry.id}`}
            className={`absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent flex items-end p-5 justify-end gap-3 transition-opacity duration-200 ${showMobileActions ? 'opacity-100' : 'opacity-0 lg:group-hover:opacity-100'} pointer-events-none`}
          >
             <button
               id={`grid-edit-btn-${entry.id}`}
               onClick={(e) => { e.stopPropagation(); setIsEditModalOpen(true); setShowMobileActions(false); }}
               className="p-3.5 rounded-2xl bg-white/95 text-black shadow-xl transition-transform duration-200 active:scale-90 hover:bg-[#9b5cff] hover:text-white pointer-events-auto border border-white/10"
               title="Edit Entry"
             >
               <Edit2 size={18} />
             </button>
             <button
               id={`grid-delete-btn-${entry.id}`}
               onClick={(e) => { e.stopPropagation(); onDelete(entry.id); setShowMobileActions(false); }}
               className="p-3.5 rounded-2xl bg-red-600/95 text-white shadow-xl transition-transform duration-200 active:scale-90 hover:bg-red-500 pointer-events-auto border border-white/10"
               title="Delete Entry"
             >
               <Trash2 size={18} />
             </button>
          </div>
        </div>

        <div className="space-y-1.5 px-1 text-center md:text-left">
          <h3
            className={`font-bold text-[13px] text-zinc-100 leading-tight line-clamp-1 uppercase tracking-tight cursor-pointer hover:text-[#9b5cff] transition-colors duration-200 flex items-center justify-center md:justify-start gap-1 group/title ${isBlurred ? 'blur-[6px] select-none hover:blur-none' : 'blur-0'}`}
            title="Click to copy entry name"
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(entry.title);
              toast.success(`Copied: "${entry.title}"`);
            }}
          >
            <span className="truncate">{entry.title}</span>
            <Copy size={10} className="opacity-0 group-hover/title:opacity-100 text-[#9b5cff] transition-opacity shrink-0 hidden sm:inline" />
          </h3>
          <div
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${ratingCfg.color}`} />
              <span className={`text-[10px] font-black uppercase tracking-wider ${ratingCfg.text}`}>{ratingCfg.label}</span>
            </div>
            {entry.episodeCount ? (
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest tabular-nums">{entry.episodeCount} EP</span>
            ) : (
              <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest tabular-nums">{formatDate(entry.watchDate)}</span>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <ExpandableDetailModal
            activeEntry={entry}
            onClose={() => setIsExpanded(false)}
            onDelete={(id) => {
              setIsExpanded(false);
              onDelete(id);
            }}
            onEdit={() => {
              setIsExpanded(false);
              setIsEditModalOpen(true);
            }}
          />
        )}
      </AnimatePresence>
      {isEditModalOpen && (
        <EditEntryModal entry={entry} isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSave={handleUpdate} />
      )}
    </>
  );
};

export default React.memo(EntryCard);
