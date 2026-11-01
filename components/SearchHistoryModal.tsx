import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  History, X, Search, Trash2, ArrowUpRight, Clock, AlertCircle,
  Film, Tv, User, Building2, Layers, Filter
} from 'lucide-react';
import { RecentSearchItem } from '../types';
import { TMDB_IMAGE_BASE } from '../constants';

interface SearchHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: RecentSearchItem[];
  onSelectSearch: (item: RecentSearchItem | string) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
}

export const formatRelativeTime = (timestamp: number): string => {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  });
};

type HistoryFilterType = 'all' | 'media' | 'talent';

const SearchHistoryModal: React.FC<SearchHistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onSelectSearch,
  onRemoveItem,
  onClearAll
}) => {
  const [filterQuery, setFilterQuery] = useState('');
  const [activeTypeFilter, setActiveTypeFilter] = useState<HistoryFilterType>('all');
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset filter when opened/closed
  useEffect(() => {
    if (!isOpen) {
      setIsConfirmingClear(false);
      setFilterQuery('');
      setActiveTypeFilter('all');
    }
  }, [isOpen]);

  const counts = useMemo(() => {
    let media = 0;
    let talent = 0;
    history.forEach(item => {
      if (item.type === 'person' || item.type === 'company') {
        talent++;
      } else {
        media++;
      }
    });
    return { all: history.length, media, talent };
  }, [history]);

  const filteredHistory = useMemo(() => {
    let list = history;

    if (activeTypeFilter === 'media') {
      list = list.filter(item => item.type !== 'person' && item.type !== 'company');
    } else if (activeTypeFilter === 'talent') {
      list = list.filter(item => item.type === 'person' || item.type === 'company');
    }

    if (!filterQuery.trim()) return list;
    const query = filterQuery.toLowerCase().trim();
    return list.filter(item => {
      const matchQuery = item.query.toLowerCase().includes(query);
      const matchTitle = item.title ? item.title.toLowerCase().includes(query) : false;
      const matchSubtitle = item.subtitle ? item.subtitle.toLowerCase().includes(query) : false;
      return matchQuery || matchTitle || matchSubtitle;
    });
  }, [history, filterQuery, activeTypeFilter]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 md:p-12 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/95 md:backdrop-blur-xl"
          />

          {/* Modal Card - Large, spacious CineLog signature container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ transform: 'translateZ(0)' }}
            className="relative w-full max-w-4xl bg-[#0c0c0e] rounded-[2.5rem] md:rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 md:p-8 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter italic leading-none">
                    Search History
                  </h2>
                  {history.length > 0 && (
                    <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-400 font-black text-[10px] tracking-widest uppercase border border-purple-500/30">
                      {history.length}
                    </span>
                  )}
                </div>
                <p className="text-purple-500 font-black uppercase tracking-[0.3em] text-[10px]">
                  Logged Searches & Viewed Titles
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                title="Close"
                aria-label="Close history"
              >
                <X size={20} />
              </button>
            </div>

            {/* Filter Bar & Controls */}
            {history.length > 0 && (
              <div className="px-6 md:px-8 py-3.5 border-b border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-black/40 shrink-0">
                {/* Category Pills matching CineLog Discovery bar */}
                <div className="flex bg-black p-1.5 rounded-full border border-white/5 shadow-inner">
                  <button
                    type="button"
                    onClick={() => setActiveTypeFilter('all')}
                    className={`px-5 py-2 rounded-full text-[10px] font-black tracking-widest uppercase transition-all duration-300 cursor-pointer ${
                      activeTypeFilter === 'all'
                        ? 'bg-[#9b5cff] text-white shadow-[0_0_20px_rgba(155,92,255,0.4)]'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    ALL ({counts.all})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTypeFilter('media')}
                    className={`px-5 py-2 rounded-full text-[10px] font-black tracking-widest uppercase transition-all duration-300 cursor-pointer ${
                      activeTypeFilter === 'media'
                        ? 'bg-[#9b5cff] text-white shadow-[0_0_20px_rgba(155,92,255,0.4)]'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    MEDIA ({counts.media})
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTypeFilter('talent')}
                    className={`px-5 py-2 rounded-full text-[10px] font-black tracking-widest uppercase transition-all duration-300 cursor-pointer ${
                      activeTypeFilter === 'talent'
                        ? 'bg-[#9b5cff] text-white shadow-[0_0_20px_rgba(155,92,255,0.4)]'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    TALENT ({counts.talent})
                  </button>
                </div>

                {/* Filter Search Field */}
                <div className="relative sm:max-w-xs flex-1">
                  <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Filter history..."
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-8 py-2 text-xs font-bold text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all"
                  />
                  {filterQuery.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterQuery('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white cursor-pointer"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* History List */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-6 md:p-8 space-y-3 overscroll-contain">
              {filteredHistory.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="w-16 h-16 rounded-3xl bg-white/5 border border-white/5 flex items-center justify-center text-zinc-600">
                    <Clock size={28} />
                  </div>
                  <p className="text-xs font-black uppercase tracking-[0.3em] text-zinc-500">
                    {filterQuery ? 'No Matching Records' : 'No History Recorded'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredHistory.map((item) => {
                    const imageSrc = item.image || (item.posterPath ? `${TMDB_IMAGE_BASE}${item.posterPath}` : null);
                    const isPerson = item.type === 'person';
                    const isCompany = item.type === 'company';
                    const isTV = item.type === 'tv';

                    return (
                      <div
                        key={item.id}
                        onClick={() => onSelectSearch(item)}
                        className="w-full p-4 rounded-[2rem] bg-white/5 border border-white/5 hover:bg-white/10 hover:border-purple-500/30 transition-all group flex items-center justify-between shadow-xl cursor-pointer active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-4 min-w-0 flex-1">
                          {/* Poster or Photo */}
                          <div className={`relative flex-shrink-0 bg-black rounded-2xl overflow-hidden border border-white/5 shadow-inner flex items-center justify-center ${
                            isPerson ? 'w-12 h-12 rounded-full ring-2 ring-purple-500/30' : 'w-12 h-16 rounded-xl object-cover'
                          }`}>
                            {imageSrc ? (
                              <img
                                src={imageSrc}
                                alt={item.title || item.query}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                loading="lazy"
                              />
                            ) : isPerson ? (
                              <User size={18} className="text-purple-400" />
                            ) : isCompany ? (
                              <Building2 size={18} className="text-blue-400" />
                            ) : isTV ? (
                              <Tv size={18} className="text-emerald-400" />
                            ) : (
                              <Film size={18} className="text-purple-400" />
                            )}
                          </div>

                          {/* Details */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-black text-sm md:text-base uppercase tracking-tight italic text-zinc-200 group-hover:text-white transition-colors truncate">
                                {item.title || item.query}
                              </h3>
                              {item.year && (
                                <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                                  ({item.year})
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2.5 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                              <span className="text-purple-400">
                                {item.subtitle || (isPerson ? 'Talent' : isCompany ? 'Studio' : isTV ? 'TV Series' : 'Movie')}
                              </span>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-zinc-600">
                                <Clock size={10} />
                                {formatRelativeTime(item.timestamp)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Remove Action */}
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRemoveItem(item.id);
                            }}
                            className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer"
                            title="Remove from history"
                            aria-label={`Delete record "${item.query}"`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {history.length > 0 && (
              <div className="p-6 md:p-8 border-t border-white/5 bg-black/40 flex items-center justify-between shrink-0">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">
                  {filteredHistory.length} of {history.length} items
                </span>

                {isConfirmingClear ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                      Clear all?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onClearAll();
                        setIsConfirmingClear(false);
                      }}
                      className="px-5 py-2 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-300 font-black text-[10px] tracking-widest uppercase border border-red-500/30 transition-all cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingClear(false)}
                      className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 font-black text-[10px] tracking-widest uppercase transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsConfirmingClear(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-all font-black text-[10px] tracking-widest uppercase cursor-pointer"
                  >
                    <Trash2 size={12} />
                    <span>Clear All</span>
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SearchHistoryModal;
