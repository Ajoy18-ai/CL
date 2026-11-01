
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Grid, List as ListIcon, Plus, Trash2, Clapperboard, Calendar as CalendarIcon, RefreshCw, ArrowUpDown, Eye, EyeOff } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Link, useSearchParams } from 'react-router-dom';
import EntryCard from '../components/EntryCard';
import { WatchEntry } from '../types';
import { SkeletonGrid } from '../components/SkeletonCard';
import EditEntryModal from '../components/EditEntryModal';

interface DashboardProps {
  selectedYear: number;
  setSelectedYear: (year: number) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ selectedYear, setSelectedYear }) => {
  const { entries, updateEntry, removeEntry, refreshEntries, isLoading, isCloudConnected, sortOrder, setSortOrder, blurPosters, toggleBlurPosters } = useStore();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [entryToDelete, setEntryToDelete] = useState<WatchEntry | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [directEditEntry, setDirectEditEntry] = useState<WatchEntry | null>(null);

  const editId = searchParams.get('editId') || searchParams.get('edit') || searchParams.get('editEntryId');

  useEffect(() => {
    if (editId && entries.length > 0) {
      const target = entries.find(e => String(e.id) === String(editId));
      if (target) {
        setDirectEditEntry(target);
      }
    }
  }, [editId, entries]);

  useEffect(() => {
    if (entries.length === 0) {
      refreshEntries();
    }
  }, [entries.length, refreshEntries]);

  const displayYears = useMemo(() => {
    const entryYears = Array.from(new Set<number>(entries.map(e => e.year))).filter(y => typeof y === 'number' && y > 1900);
    const staticYears = [2025, 2024, 2023];
    return Array.from(new Set<number>([...entryYears, ...staticYears])).sort((a, b) => b - a);
  }, [entries]);

  useEffect(() => {
    const validYears = entries.map(e => e.year).filter(y => typeof y === 'number' && y > 1900);
    const hasDataInSelection = entries.some(e => e.year === selectedYear);
    if (!hasDataInSelection && validYears.length > 0) {
      const mostRecentActiveYear = Math.max(...validYears);
      if (mostRecentActiveYear !== selectedYear) {
        setSelectedYear(mostRecentActiveYear);
      }
    }
  }, [entries, selectedYear, setSelectedYear]);

  // Determine original log sequence based on chronological creation (1, 2, 3...)
  // This list stays stable regardless of UI sorting preference.
  const chronoSortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const getTime = (e: WatchEntry) => {
        if (e.watchDate && e.watchDate !== '0000-00-00') {
          const t = new Date(e.watchDate).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
        return e.createdAt ? new Date(e.createdAt).getTime() : 0;
      };
      return getTime(a) - getTime(b);
    });
  }, [entries]);

  const logIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    chronoSortedEntries.forEach((e, idx) => {
      map.set(e.id, idx + 1);
    });
    return map;
  }, [chronoSortedEntries]);

  const filteredEntries = useMemo(() => {
    const baseList = entries.filter(e => e && e.id && e.title && e.year === selectedYear);

    return baseList.sort((a, b) => {
      const getTime = (e: WatchEntry) => {
        if (e.watchDate && e.watchDate !== '0000-00-00') {
          const t = new Date(e.watchDate).getTime();
          if (!isNaN(t) && t > 0) return t;
        }
        return 0;
      };
      const dateA = getTime(a);
      const dateB = getTime(b);

      // Main sort by user preference (desc: newest first, asc: oldest first)
      if (dateB !== dateA) {
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }

      // Tie-breaker for same day: Log creation time
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [entries, selectedYear, sortOrder]);

  const handleConfirmDelete = async () => {
    if (entryToDelete) {
      await removeEntry(entryToDelete.id);
      setEntryToDelete(null);
    }
  };

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
  };

  return (
    <div className="space-y-10 pb-44">
      <header className="flex flex-col md:flex-row md:items-start justify-between gap-6 pl-0 pr-3 pt-4 -mt-[33px] mb-[31px]">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl md:text-5xl font-black tracking-tighter italic text-white uppercase leading-none">Pulse</h1>
            {!isCloudConnected && (
               <div className="px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[8px] font-black uppercase tracking-widest">Local Mode</div>
            )}
          </div>
          <p className="text-zinc-400 font-medium text-[10px] uppercase tracking-widest">Visual Archive • {entries.length} Total Records</p>
        </div>

        <div className="flex flex-row items-center gap-2.5 w-full md:w-auto md:justify-end">
          {/* Year selector */}
          <div className="flex-1 sm:flex-initial flex bg-[#111]/40 backdrop-blur-md p-1 rounded-xl border border-white/5 overflow-x-auto no-scrollbar justify-start w-[156px] h-[39.5px] pl-[4px] ml-0 sm:w-auto sm:h-auto sm:p-1">
            {displayYears.slice(0, 6).map(year => {
              const hasData = entries.some(e => e.year === year);
              return (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-2.5 py-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black transition-all duration-300 flex-shrink-0 relative min-w-[38px] sm:min-w-[50px] text-center ${
                    selectedYear === year
                    ? 'bg-[#8b5cf6] text-white shadow-lg shadow-purple-500/20'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {year}
                  {hasData && selectedYear !== year && (
                    <div className="absolute top-1 right-1 w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-[#8b5cf6]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Controls */}
          <div
            className="flex bg-[#111]/60 backdrop-blur-xl p-1 rounded-xl sm:rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] gap-1 sm:gap-1.5 items-center shrink-0 w-[148px] h-[40px] -ml-[1px] -mr-[27px] mt-0 mb-0 sm:w-auto sm:h-auto sm:m-0"
          >
            <button
              type="button"
              onClick={toggleBlurPosters}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-transform duration-150 active:scale-95 hover:scale-105 touch-manipulation border ${
                blurPosters
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border-transparent'
              }`}
              title={blurPosters ? "Show Posters" : "Blur Posters"}
            >
              {blurPosters ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
            <button
              type="button"
              onClick={toggleSortOrder}
              className="p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-transform duration-150 active:scale-95 hover:scale-105 touch-manipulation text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
              title={sortOrder === 'desc' ? "Showing Newest First" : "Showing Oldest First"}
            >
              <ArrowUpDown className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-200 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-transform duration-150 active:scale-95 hover:scale-105 touch-manipulation border ${
                viewMode === 'grid'
                  ? 'bg-white/10 text-white border-white/10'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border-transparent'
              }`}
            >
              <Grid className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 sm:p-3 rounded-lg sm:rounded-xl transition-transform duration-150 active:scale-95 hover:scale-105 touch-manipulation border ${
                viewMode === 'list'
                  ? 'bg-white/10 text-white border-white/10'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border-transparent'
              }`}
            >
              <ListIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {isLoading && entries.length === 0 ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-8"
          >
            <div className="flex items-center gap-3 px-0 md:px-0">
               <div className="w-5 h-5 border-2 border-[#8b5cf6] border-t-transparent rounded-full animate-spin"></div>
               <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.4em] italic">Synchronizing Archive...</span>
            </div>
            <SkeletonGrid count={10} viewMode={viewMode} type="dashboard" />
          </motion.div>
        ) : filteredEntries.length > 0 ? (
          <motion.div
            key={`${viewMode}-${selectedYear}-${sortOrder}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`grid gap-x-3 gap-y-8 md:gap-x-4 md:gap-y-12 px-0 md:px-0 ${viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'grid-cols-1 max-w-2xl mx-auto'}`}
          >
            {filteredEntries.map((entry, index) => {
              const logIndex = logIndexMap.get(entry.id) || (index + 1);
              return (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  viewMode={viewMode}
                  logIndex={logIndex}
                  index={index}
                  onDelete={() => setEntryToDelete(entry)}
                />
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-[50vh] flex flex-col items-center justify-center text-zinc-600 space-y-6"
          >
            <div className="p-12 rounded-[3rem] bg-[#111] border border-white/5 relative group">
              <div className="absolute inset-0 bg-purple-500/5 blur-3xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
              <CalendarIcon size={64} className="text-zinc-800 relative z-10" strokeWidth={1} />
            </div>
            <div className="text-center space-y-3 px-4">
              <p className="font-black text-white text-2xl uppercase tracking-tighter italic">Timeline Silent</p>
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-widest max-w-[200px] leading-relaxed mx-auto">No entries recorded for {selectedYear}.</p>
            </div>
            <Link
              to="/add-entry"
              className="px-10 py-5 bg-white text-black font-black rounded-2xl active:scale-95 flex items-center gap-3 text-[10px] uppercase tracking-[0.2em] shadow-2xl"
            >
              <Plus size={16} /> Log Entry
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {entryToDelete && (
          <div className="fixed inset-0 z-[2500] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEntryToDelete(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-2xl"
            />
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="relative w-full max-w-md bg-[#09090b] rounded-[3.5rem] border border-white/5 p-10 md:p-14 shadow-[0_0_120px_rgba(0,0,0,0.8)] flex flex-col items-center text-center space-y-10"
            >
              <div className="w-24 h-24 rounded-[2.5rem] bg-red-500/10 flex items-center justify-center border border-red-500/10">
                <Trash2 size={40} className="text-red-500" />
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl md:text-4xl font-black text-white uppercase tracking-tighter italic leading-none">Destroy Record?</h2>
                <p className="text-zinc-500 text-sm font-medium leading-relaxed px-2">
                  Are you absolutely sure you want to remove <span className="text-white font-black italic">{entryToDelete.title}</span>?
                </p>
              </div>
              <div className="flex flex-col w-full gap-3">
                <button onClick={handleConfirmDelete} className="w-full py-6 bg-red-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.4em] shadow-2xl shadow-red-600/20 active:scale-95 transition-all italic">Yes, Remove Entry</button>
                <button onClick={() => setEntryToDelete(null)} className="w-full py-6 bg-white/5 border border-white/5 text-zinc-500 rounded-2xl font-black text-[10px] uppercase tracking-[0.4em] hover:text-white hover:bg-white/10 transition-all italic">No, Keep Record</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Direct Edit Modal triggered via search params */}
      {directEditEntry && (
        <EditEntryModal
          entry={directEditEntry}
          isOpen={!!directEditEntry}
          onClose={() => {
            setDirectEditEntry(null);
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('editId');
              next.delete('edit');
              next.delete('editEntryId');
              return next;
            });
          }}
          onSave={async (updated) => {
            await updateEntry(updated);
            setDirectEditEntry(null);
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('editId');
              next.delete('edit');
              next.delete('editEntryId');
              return next;
            });
          }}
        />
      )}
    </div>
  );
};

export default Dashboard;
