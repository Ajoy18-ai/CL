import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft, RotateCcw, Sparkles, Filter, Upload,
  HelpCircle, Layers, CheckCircle2, XCircle, Film, Tv,
  RefreshCw, Info, Undo2, Award, Eye, ChevronDown
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import { BacklogCandidate, BacklogStats, Rating } from '../types';
import {
  getStoredCandidates,
  saveStoredCandidates,
  buildCandidatePoolFromTMDB,
  getBacklogSessionBatch,
  recordBacklogSkip,
  recordBacklogWatched,
  undoLastBacklogAction,
  restoreSkippedCandidates,
  getStoredHistory
} from '../services/historicalPopularity';
import AlbumRail from '../components/AlbumRail';
import { BacklogLogModal } from '../components/backlog/BacklogLogModal';
import { BacklogDetailsModal } from '../components/backlog/BacklogDetailsModal';
import { LetterboxdImportModal } from '../components/backlog/LetterboxdImportModal';

const CATEGORIES = [
  { id: 'all', label: 'All Cinema' },
  { id: 'hollywood', label: 'Hollywood' },
  { id: 'bollywood', label: 'Bollywood' },
  { id: 'english_tv', label: 'English TV Seasons' },
  { id: 'indian_tv', label: 'Indian Series' },
  { id: 'classic', label: 'Pre-2000 Classics' },
  { id: 'imported', label: 'Imported List' }
];

export const BacklogRecoveryPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToastStore();
  const { entries, addEntry } = useStore();

  const [candidates, setCandidates] = useState<BacklogCandidate[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [isLoadingPool, setIsLoadingPool] = useState(true);

  // Modals state
  const [loggingCandidate, setLoggingCandidate] = useState<BacklogCandidate | null>(null);
  const [detailsCandidate, setDetailsCandidate] = useState<BacklogCandidate | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showSkippedModal, setShowSkippedModal] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  // Initialize Candidate Pool
  const initializePool = useCallback(async (forceRefresh = false) => {
    setIsLoadingPool(true);
    try {
      let pool = getStoredCandidates();
      if (pool.length === 0 || forceRefresh) {
        pool = await buildCandidatePoolFromTMDB();
        saveStoredCandidates(pool);
      }
      setCandidates(pool);
    } catch (e) {
      console.error("Failed to load candidate pool:", e);
      toast.error("Could not load discovery pool. Please check your connection.");
    } finally {
      setIsLoadingPool(false);
    }
  }, [toast]);

  useEffect(() => {
    initializePool();
  }, [initializePool]);

  // Derive current discovery batch & exact statistics
  const { batch, stats } = useMemo(() => {
    return getBacklogSessionBatch(candidates, entries, categoryFilter, 24);
  }, [candidates, entries, categoryFilter]);

  // Keep active index in bounds if batch length changes
  useEffect(() => {
    if (activeItemIndex >= batch.length && batch.length > 0) {
      setActiveItemIndex(Math.max(0, batch.length - 1));
    }
  }, [batch.length, activeItemIndex]);

  // Actions
  const handleSkip = (item: BacklogCandidate) => {
    recordBacklogSkip(item.id);
    // Silent skip - no popup notification as requested
    setCandidates(prev => prev.map(c => c.id === item.id ? { ...c, status: 'skipped' } : c));
  };

  const handleRateWatched = async (item: BacklogCandidate, rating: Rating | null = null) => {
    try {
      const entryId = `backlog-${item.id}-${Date.now()}`;
      await addEntry({
        tmdbId: item.tmdbId,
        type: item.type,
        title: item.title,
        posterUrl: item.posterUrl,
        rating: rating || Rating.GOOD,
        review: '',
        watchDate: '0000-00-00',
        year: 0,
        genres: item.genres,
        isRewatch: false,
        isAbsoluteCinema: rating === Rating.PEAK,
        isVague: rating === Rating.VAGUE,
        runtime: 120,
        episodeCount: item.episodeCount,
        airDate: item.airDate,
        seasonSynopsis: item.overview,
        seasonNumber: item.seasonNumber,
        seasonName: item.seasonName,
        datePrecision: 'unknown',
        approximateYear: undefined,
        isBacklogRecovery: true
      });

      recordBacklogWatched(item.id, entryId);
      setCandidates(prev => prev.map(c => c.id === item.id ? { ...c, status: 'watched' } : c));
      // Popup notifications switched off on backlog page for fast, silent logging
    } catch (e) {
      console.error("Backlog quick rating error:", e);
      toast.error("Failed to log title. Please try again.");
    }
  };

  const handleOpenLog = (item: BacklogCandidate) => {
    setLoggingCandidate(item);
  };

  const handleOpenDetails = (item: BacklogCandidate) => {
    setDetailsCandidate(item);
  };

  const handleLoggedSuccess = (item: BacklogCandidate) => {
    setCandidates(prev => prev.map(c => c.id === item.id ? { ...c, status: 'watched' } : c));
  };

  const handleUndo = () => {
    const undoneId = undoLastBacklogAction();
    if (undoneId) {
      setCandidates(prev => prev.map(c => c.id === undoneId ? { ...c, status: 'unseen' } : c));
      toast.success("Previous action undone. Candidate returned to discovery.");
    } else {
      toast.info("No recent actions to undo.");
    }
  };

  const handleRevisitSkipped = () => {
    const restoredCount = restoreSkippedCandidates();
    if (restoredCount > 0) {
      setCandidates(prev => prev.map(c => c.status === 'skipped' ? { ...c, status: 'unseen' } : c));
      toast.success(`Restored ${restoredCount} skipped title(s) back into your discovery queue!`);
      setShowSkippedModal(false);
    } else {
      toast.info("No skipped titles to restore.");
    }
  };

  // Skipped list for inspection
  const skippedList = useMemo(() => {
    const history = getStoredHistory();
    return candidates.filter(c => history[c.id]?.status === 'skipped');
  }, [candidates]);

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto pb-24 md:pb-28 text-center px-1 sm:px-4">

      {/* Top Bar Navigation & Minimal Title */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 text-left border-b border-white/10 pb-4 sm:pb-5">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <Link
            to="/profile"
            aria-label="Back to Profile"
            title="Back to Profile"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-zinc-900/80 hover:bg-white/10 border border-white/10 hover:border-white/25 flex items-center justify-center text-zinc-400 hover:text-white transition-all duration-300 shadow-sm active:scale-95 shrink-0"
          >
            <ArrowLeft size={16} />
          </Link>
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-[900] italic uppercase tracking-[-0.04em] text-white leading-none truncate">
            Backlog
          </h1>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            className="h-9 px-2.5 sm:h-10 sm:px-3.5 rounded-xl sm:rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all duration-300 active:scale-95 shadow-sm"
            title="Undo last action"
          >
            <Undo2 size={13} className="shrink-0" />
            <span className="hidden sm:inline">Undo</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSkippedModal(true)}
            className="h-9 px-2.5 sm:h-10 sm:px-3.5 rounded-xl sm:rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all duration-300 active:scale-95 shadow-sm"
            title="Revisit skipped titles"
          >
            <RotateCcw size={13} className="shrink-0" />
            <span className="hidden sm:inline">Skipped</span>
            <span className="text-[10px] text-purple-300 font-mono">({stats.skippedCount})</span>
          </button>

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="h-9 px-2.5 sm:h-10 sm:px-3.5 rounded-xl sm:rounded-2xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/30 text-purple-200 hover:text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all duration-300 active:scale-95 shadow-sm"
            title="Import titles from Letterboxd list"
          >
            <Upload size={13} className="shrink-0" />
            <span className="hidden sm:inline">Import</span>
          </button>

          <button
            type="button"
            onClick={() => initializePool(true)}
            disabled={isLoadingPool}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-all duration-300 active:scale-95 disabled:opacity-50 shadow-sm shrink-0"
            title="Refresh candidate pool from TMDB"
          >
            <RefreshCw size={13} className={isLoadingPool ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Category Filter Pills (Edge-to-edge scroll on mobile) */}
      <div className="-mx-3 px-3 sm:mx-0 sm:px-0 flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar touch-pan-x">
        {CATEGORIES.map(cat => {
          const isActive = categoryFilter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => {
                setCategoryFilter(cat.id);
                setActiveItemIndex(0);
              }}
              className={`py-1.5 sm:py-2 px-3 sm:px-4 rounded-xl font-black text-[11px] sm:text-xs uppercase tracking-wider transition-all whitespace-nowrap border shrink-0 ${
                isActive
                  ? 'bg-white text-black border-white shadow-lg'
                  : 'bg-zinc-900/60 text-zinc-400 border-white/10 hover:text-white hover:border-white/20'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Main Interactive Stage: React Bits Pro Album Rail */}
      <div className="relative min-h-[460px] xs:min-h-[500px] md:min-h-[560px] flex items-center justify-center">
        {isLoadingPool ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-[#b88aff] border-t-transparent animate-spin" />
            <p className="text-xs font-black uppercase tracking-widest text-zinc-400">
              Generating Historical Discovery Stream...
            </p>
          </div>
        ) : batch.length === 0 ? (
          <div className="p-12 rounded-3xl bg-zinc-950/60 border border-white/10 max-w-md mx-auto text-center space-y-4">
            <Sparkles size={36} className="text-[#b88aff] mx-auto animate-bounce" />
            <h3 className="text-xl font-black text-white italic uppercase">No More Titles in this Category</h3>
            <p className="text-xs text-zinc-400">
              You have reviewed all available candidates in the &quot;{CATEGORIES.find(c => c.id === categoryFilter)?.label}&quot; filter.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className="py-2.5 px-4 rounded-xl bg-white text-black font-black text-xs uppercase tracking-wider"
              >
                Switch to All
              </button>
              {stats.skippedCount > 0 && (
                <button
                  type="button"
                  onClick={handleRevisitSkipped}
                  className="py-2.5 px-4 rounded-xl bg-purple-900/60 border border-purple-500/30 text-purple-200 font-black text-xs uppercase tracking-wider"
                >
                  Restore Skipped
                </button>
              )}
            </div>
          </div>
        ) : (
          <AlbumRail
            items={batch}
            activeIndex={activeItemIndex}
            onActiveIndexChange={setActiveItemIndex}
            onSelect={handleOpenDetails}
            onSwipeLeft={handleSkip}
            onSwipeRight={(item) => handleRateWatched(item, null)}
            onRateWatched={handleRateWatched}
          />
        )}
      </div>

      {/* Collapsible Recovery Progress (Bottom, hidden by default with down arrow toggle) */}
      <div className="w-full max-w-4xl mx-auto pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={() => setShowProgress(prev => !prev)}
          className="group w-full flex items-center justify-between px-5 py-3.5 rounded-2xl bg-[#121215]/80 hover:bg-[#18181c] border border-white/10 hover:border-purple-500/30 transition-all duration-300 shadow-md active:scale-[0.99]"
          aria-expanded={showProgress}
        >
          <div className="flex items-center gap-2.5">
            <Sparkles size={14} className="text-[#b88aff]" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-white group-hover:text-purple-200 transition-colors">
              Recovery Progress
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-purple-500/20 text-[#b88aff] font-bold">
              {stats.totalCandidates > 0 ? Math.round((stats.processedCount / stats.totalCandidates) * 100) : 0}% Processed
            </span>
          </div>

          <div className="flex items-center gap-2 text-zinc-400 group-hover:text-white transition-colors">
            <span className="text-[10px] font-black uppercase tracking-wider hidden sm:inline text-zinc-400">
              {showProgress ? 'Hide Stats' : 'Show Stats'}
            </span>
            <div className={`w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center transition-transform duration-300 ${showProgress ? 'rotate-180 bg-purple-500/20 text-[#b88aff]' : 'rotate-0'}`}>
              <ChevronDown size={15} />
            </div>
          </div>
        </button>

        {/* Expandable Progress Content with Smooth Transition */}
        <AnimatePresence>
          {showProgress && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden mt-3"
            >
              <div className="p-5 md:p-6 rounded-3xl bg-gradient-to-br from-purple-950/20 via-[#121215] to-black border border-white/10 shadow-2xl space-y-4 text-left">
                {/* Metric Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                  <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-1">
                    <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider block">Candidate Pool</span>
                    <p className="text-xl md:text-2xl font-black text-white italic">{stats.totalCandidates}</p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 space-y-1">
                    <span className="text-[9px] font-black uppercase text-zinc-400 tracking-wider block">Processed</span>
                    <p className="text-xl md:text-2xl font-black text-white italic">{stats.processedCount}</p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 space-y-1">
                    <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider block">Marked Watched</span>
                    <p className="text-xl md:text-2xl font-black text-emerald-300 italic">{stats.watchedCount}</p>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/20 space-y-1">
                    <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider block">Skipped</span>
                    <p className="text-xl md:text-2xl font-black text-amber-300 italic">{stats.skippedCount}</p>
                  </div>

                  <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-purple-950/20 border border-purple-500/20 space-y-1">
                    <span className="text-[9px] font-black uppercase text-[#b88aff] tracking-wider block">Remaining</span>
                    <p className="text-xl md:text-2xl font-black text-purple-200 italic">{stats.remainingCount}</p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-zinc-800/60 rounded-full h-2 mt-4 overflow-hidden p-0.5">
                  <div
                    className="bg-gradient-to-r from-[#600dca] to-[#b88aff] h-full rounded-full transition-all duration-500"
                    style={{ width: `${stats.totalCandidates > 0 ? (stats.processedCount / stats.totalCandidates) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Helpful Instructions Footnote */}
      <div className="flex flex-wrap items-center justify-center gap-6 text-[11px] text-zinc-500 pt-4 border-t border-white/5">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500/80" /> Click X / Swipe Left to skip
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-500" /> Tap BAD, MID, GOOD, PEAK, or Eye to log instantly
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white/60" /> Click any poster for synopsis, cast & crew
        </span>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {loggingCandidate && (
          <BacklogLogModal
            candidate={loggingCandidate}
            isOpen={!!loggingCandidate}
            onClose={() => setLoggingCandidate(null)}
            onLoggedSuccess={handleLoggedSuccess}
          />
        )}

        {detailsCandidate && (
          <BacklogDetailsModal
            candidate={detailsCandidate}
            isOpen={!!detailsCandidate}
            onClose={() => setDetailsCandidate(null)}
            onMarkWatched={handleOpenLog}
            onSkip={handleSkip}
          />
        )}

        {isImportModalOpen && (
          <LetterboxdImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onImportSuccess={() => initializePool(false)}
          />
        )}

        {/* Skipped Titles Review Modal */}
        {showSkippedModal && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-[#0f0f12] border border-white/15 rounded-[2.5rem] p-6 md:p-8 shadow-2xl max-h-[85vh] flex flex-col text-left"
            >
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div>
                  <h3 className="text-xl font-black text-white italic uppercase">Skipped Titles ({skippedList.length})</h3>
                  <p className="text-xs text-zinc-400">Titles you previously skipped. You can restore them anytime.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSkippedModal(false)}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center"
                >
                  <ArrowLeft size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-2 no-scrollbar">
                {skippedList.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-10">No skipped titles in your history.</p>
                ) : (
                  skippedList.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-white/5">
                      <div className="flex items-center gap-3">
                        <img src={item.posterUrl} alt={item.title} className="w-10 h-14 rounded-md object-cover" />
                        <div>
                          <h4 className="text-xs font-bold text-white truncate max-w-xs">{item.title}</h4>
                          <span className="text-[10px] text-zinc-400">{item.releaseYear} • {item.category}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenLog(item);
                          setShowSkippedModal(false);
                        }}
                        className="py-1.5 px-3 rounded-lg bg-[#9b5cff] text-white text-[10px] font-black uppercase tracking-wider"
                      >
                        Log Now
                      </button>
                    </div>
                  ))
                )}
              </div>

              {skippedList.length > 0 && (
                <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleRevisitSkipped}
                    className="py-3 px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider flex items-center gap-2"
                  >
                    <RotateCcw size={14} />
                    <span>Restore All ({skippedList.length}) to Discovery</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSkippedModal(false)}
                    className="py-3 px-4 rounded-xl bg-zinc-900 text-zinc-400 text-xs font-bold"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default BacklogRecoveryPage;
