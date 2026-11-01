import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Search, Trash2, Edit2, X, Film, Tv, ChevronLeft, ChevronRight,
  PlusCircle, Bookmark, ArrowRight, Shuffle, Layers, Loader2,
  LayoutGrid, ListFilter, Calendar, Type, CheckSquare, Square, FolderInput,
  Import, ListPlus, Send, ArrowLeft, Copy
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import { searchTMDB } from '../services/api';
import { TMDBResult, WatchListItem, CustomList } from '../types';
import { TMDB_IMAGE_BASE } from '../constants';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { CachedImage, precacheImages } from '../components/CachedImage';

const WatchedEyeIndicator: React.FC = () => (
  <div className="absolute top-2 right-2 z-20 animate-in fade-in zoom-in duration-500">
    <div className="bg-emerald-500/90 backdrop-blur-md p-1.5 rounded-full shadow-lg border border-white/20">
      <CheckSquare size={10} className="text-black" />
    </div>
  </div>
);

const CustomListsPage: React.FC = () => {
  const { customLists, entries, addCustomList, updateCustomList, removeCustomList, refreshCustomLists } = useStore();
  const toast = useToastStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const scrollToTopInstant = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const root = document.getElementById('root');
    if (root) {
      root.scrollTop = 0;
      root.scrollTo({ top: 0, behavior: 'instant' });
    }
    const main = document.querySelector('main');
    if (main) {
      main.scrollTop = 0;
      main.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const activeListId = searchParams.get('listId');
  const setActiveListId = (id: string | null) => {
    scrollToTopInstant();
    if (id) {
      setSearchParams({ listId: id });
    } else {
      setSearchParams({});
    }
  };

  const [isEditingName, setIsEditingName] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [localSearchQuery, setLocalSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'alpha'>('date');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);

  // Bulk Import States
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkListName, setBulkListName] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, name: '' });

  // Batch Action States
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedTmdbIds, setSelectedTmdbIds] = useState<Set<number>>(new Set());
  const [replaceTmdbId, setReplaceTmdbId] = useState<number | null>(null);

  // Collection Search State (round search button)
  const [showCollectionSearch, setShowCollectionSearch] = useState(false);
  const [collectionSearchQuery, setCollectionSearchQuery] = useState('');
  const collectionSearchInputRef = useRef<HTMLInputElement>(null);

  const filteredCollections = useMemo(() => {
    const query = collectionSearchQuery.trim().toLowerCase();
    const lists = (customLists || []).filter(Boolean);
    if (!query) return lists;

    const cleanQ = query.replace(/[-_.\s]+/g, ' ').trim();
    const compactQ = query.replace(/[-_.\s]+/g, '');
    const queryWords = cleanQ.split(' ').filter(Boolean);

    const isCloseWord = (a: string, b: string) => {
      if (a === b) return true;
      if (Math.abs(a.length - b.length) > 1) return false;
      let diff = 0;
      let i = 0, j = 0;
      while (i < a.length && j < b.length) {
        if (a[i] !== b[j]) {
          diff++;
          if (diff > 1) return false;
          if (a.length > b.length) i++;
          else if (b.length > a.length) j++;
          else { i++; j++; }
        } else {
          i++; j++;
        }
      }
      return true;
    };

    return lists.filter(list => {
      if (!list) return false;
      const name = (list.name || '').toLowerCase();
      const cleanName = name.replace(/[-_.\s]+/g, ' ').trim();
      const compactName = name.replace(/[-_.\s]+/g, '');
      const nameWords = cleanName.split(' ').filter(Boolean);

      // Direct or normalized substring match
      if (name.includes(query) || cleanName.includes(cleanQ) || compactName.includes(compactQ)) {
        return true;
      }

      // Word-level match with 1-character typo tolerance (e.g. "x man" for "x men")
      const wordsMatch = queryWords.length > 0 && queryWords.every(qw =>
        nameWords.some(nw => nw.includes(qw) || (qw.length >= 3 && isCloseWord(qw, nw)))
      );
      if (wordsMatch) return true;

      // Check item titles inside the collection
      return (list.items || []).some(item => {
        if (!item || !item.title) return false;
        const itemTitle = item.title.toLowerCase();
        return itemTitle.includes(query) || itemTitle.replace(/[-_.\s]+/g, '').includes(compactQ);
      });
    });
  }, [customLists, collectionSearchQuery]);

  const activeList = useMemo(() => customLists.find(l => l.id === activeListId), [customLists, activeListId]);

  useEffect(() => {
    scrollToTopInstant();
  }, [activeListId]);

  useEffect(() => {
    scrollToTopInstant();
    const t = setTimeout(scrollToTopInstant, 16);
    setIsSelectionMode(false);
    setSelectedTmdbIds(new Set());
    setLocalSearchQuery('');
    return () => clearTimeout(t);
  }, [activeListId]);

  const displayItems = useMemo(() => {
    if (!activeList || !activeList.items) return [];

    let items = (activeList.items || []).filter(Boolean).filter(item => {
      const title = item?.title || '';
      const matchesSearch = title.toLowerCase().includes(localSearchQuery.toLowerCase());
      const matchesType = typeFilter === 'all' || item?.type === typeFilter;
      return matchesSearch && matchesType;
    });

    if (sortBy === 'alpha') {
      items.sort((a, b) => (a?.title || '').localeCompare(b?.title || ''));
    } else {
      items.sort((a, b) => {
        const timeA = a?.addedAt ? new Date(a.addedAt).getTime() : 0;
        const timeB = b?.addedAt ? new Date(b.addedAt).getTime() : 0;
        return timeB - timeA;
      });
    }
    return items;
  }, [activeList, localSearchQuery, sortBy, typeFilter]);

  const [searchPage, setSearchPage] = useState(1);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);
  const searchScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchPage(1);
  }, [globalSearchQuery]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (globalSearchQuery.trim().length > 1) {
        setIsSearching(true);
        const res = await searchTMDB(globalSearchQuery, 1);
        setSearchResults(res);
        setIsSearching(false);
      } else {
        setSearchResults([]);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [globalSearchQuery]);

  const loadMoreSearchResults = async () => {
    if (isLoadingMoreSearch || !globalSearchQuery.trim()) return;
    setIsLoadingMoreSearch(true);
    try {
      const nextPage = searchPage + 1;
      const res = await searchTMDB(globalSearchQuery, nextPage);
      if (res && res.length > 0) {
        setSearchResults(prev => [...prev, ...res]);
        setSearchPage(nextPage);
      }
    } catch (e) {
      console.error("Failed to load more global search results", e);
    } finally {
      setIsLoadingMoreSearch(false);
    }
  };

  useEffect(() => {
    const container = searchScrollRef.current;
    if (!container || !showSearchModal) return;

    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!container) return;
        const { scrollTop, scrollHeight, clientHeight } = container;
        if (scrollHeight - scrollTop - clientHeight < 200) {
          loadMoreSearchResults();
        }
      });
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      container.removeEventListener('scroll', handleScroll);
    };
  }, [showSearchModal, searchPage, globalSearchQuery, isLoadingMoreSearch]);

  // Automated pre-caching of global search results
  useEffect(() => {
    if (searchResults && searchResults.length > 0) {
      precacheImages(searchResults.map(item => item.poster_path ? `${TMDB_IMAGE_BASE}${item.poster_path}` : null));
    }
  }, [searchResults]);

  const handleSaveName = async (id: string) => {
    if (!editingNameValue.trim()) return;
    await updateCustomList(id, { name: editingNameValue.trim() });
    setIsEditingName(null);
  };

  const addItemToList = async (media: TMDBResult) => {
    if (!activeListId || !activeList) return;
    const newItem: WatchListItem = {
      tmdbId: media.id,
      type: media.media_type,
      title: media.title || media.name || 'Untitled',
      posterUrl: media.poster_path ? `${TMDB_IMAGE_BASE}${media.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
      addedAt: new Date().toISOString()
    };

    let updatedItems;
    if (replaceTmdbId !== null) {
      updatedItems = (activeList.items || []).map(item => (item && item.tmdbId === replaceTmdbId) ? newItem : item).filter(Boolean);
      setReplaceTmdbId(null);
    } else {
      updatedItems = [newItem, ...(activeList.items || []).filter(Boolean)];
    }

    await updateCustomList(activeListId, { items: updatedItems });
    setShowSearchModal(false);
    setGlobalSearchQuery('');
  };

  const removeItemFromList = async (tmdbId: number) => {
    if (!activeListId || !activeList) return;
    const updatedItems = (activeList.items || []).filter(item => item && item.tmdbId !== tmdbId);
    await updateCustomList(activeListId, { items: updatedItems });
  };

  const handleBulkImport = async () => {
    if (!bulkListName.trim() || !bulkText.trim()) return;

    setIsImporting(true);
    const titles = bulkText.split('\n').map(t => t.trim()).filter(t => t.length > 0);
    setImportProgress({ current: 0, total: titles.length, name: '' });

    const items: WatchListItem[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < titles.length; i++) {
      const title = titles[i];
      setImportProgress({ current: i + 1, total: titles.length, name: title });

      try {
        const results = await searchTMDB(title);
        if (results && results.length > 0) {
          const media = results[0];
          items.push({
            tmdbId: media.id,
            type: media.media_type,
            title: media.title || media.name || title,
            posterUrl: media.poster_path ? `${TMDB_IMAGE_BASE}${media.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
            addedAt: now
          });
        }
        if (titles.length > 10) await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.warn(`Failed to resolve: ${title}`);
      }
    }

    if (items.length > 0) {
      await addCustomList(bulkListName.trim(), items);
    }

    setIsImporting(false);
    setShowBulkModal(false);
    setBulkListName('');
    setBulkText('');
  };

  const toggleSelection = (tmdbId: number) => {
    setSelectedTmdbIds(prev => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId);
      else next.add(tmdbId);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    if (!activeListId || !activeList || selectedTmdbIds.size === 0) return;
    const updatedItems = (activeList.items || []).filter(item => item && !selectedTmdbIds.has(item.tmdbId));
    await updateCustomList(activeListId, { items: updatedItems });
    setIsSelectionMode(false);
    setSelectedTmdbIds(new Set());
  };

  return (
    <div className="space-y-6 md:space-y-10 pb-44 px-4 md:px-0 max-w-7xl mx-auto">
      <AnimatePresence mode="wait">
        {!activeListId || !activeList ? (
            <motion.div
              key="lists-main"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8 md:space-y-12"
            >
              <header className="flex flex-col lg:flex-row lg:items-center justify-between pt-4 gap-8">
                <div className="flex items-center gap-4 flex-1">
                  {/* Aesthetic Return Navigation */}
                  <button
                    onClick={() => navigate('/profile')}
                    className="p-3 bg-zinc-900 rounded-2xl border border-white/5 hover:bg-white/5 active:scale-95 transition-all flex items-center justify-center shrink-0"
                  >
                    <ChevronLeft size={20} className="text-zinc-500" />
                  </button>

                  <div className="space-y-1">
                    <h1 className="text-3xl md:text-5xl lg:text-6xl font-black tracking-tighter italic text-white uppercase leading-none">Collections</h1>
                    <p className="text-zinc-600 font-black uppercase tracking-[0.3em] md:tracking-[0.4em] text-[8px] md:text-[10px] pl-0.5">Letterboxd & IMDb Inspired Curations</p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 sm:gap-3 w-full md:w-auto">
                  {/* Round Search Button (Beside Bulk Import, icon only) */}
                  <button
                    type="button"
                    onClick={() => {
                      setShowCollectionSearch(prev => {
                        const next = !prev;
                        if (next) {
                          setTimeout(() => collectionSearchInputRef.current?.focus(), 80);
                        } else {
                          setCollectionSearchQuery('');
                        }
                        return next;
                      });
                    }}
                    className={`w-12 h-12 md:w-13 md:h-13 rounded-full flex items-center justify-center border transition-all duration-200 shrink-0 active:scale-95 shadow-md ${
                      showCollectionSearch
                        ? 'bg-[#9b5cff] text-white border-[#9b5cff] shadow-purple-500/30 ring-2 ring-purple-500/30'
                        : 'bg-white/5 text-zinc-400 border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20'
                    }`}
                    aria-label="Search collections"
                    title={showCollectionSearch ? "Close search bar" : "Search collections"}
                  >
                    <Search size={18} />
                  </button>

                  <button
                    onClick={() => setShowBulkModal(true)}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-3 px-6 py-4 bg-white/5 text-zinc-400 border border-white/5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:text-white transition-all italic"
                  >
                    <Import size={16} /> <span>Bulk Import</span>
                  </button>
                  <button
                    onClick={() => addCustomList('New Collection')}
                    className="flex-1 md:flex-initial flex items-center justify-center gap-3 px-6 md:px-8 py-4 bg-[#9b5cff] text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl shadow-purple-500/20 active:scale-95 transition-all italic"
                  >
                    <Plus size={16} /> <span>Manual List</span>
                  </button>
                </div>
              </header>

              {/* Slide-out Search Bar for Collections */}
              <AnimatePresence>
                {showCollectionSearch && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -8 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -8 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="overflow-hidden space-y-2 pb-1"
                  >
                    <div className="relative flex items-center bg-[#111114] border border-white/10 focus-within:border-[#9b5cff] focus-within:ring-2 focus-within:ring-[#9b5cff]/20 rounded-2xl p-2.5 pl-4 shadow-xl transition-all">
                      <Search size={18} className="text-zinc-400 shrink-0 mr-3" />
                      <input
                        ref={collectionSearchInputRef}
                        type="text"
                        value={collectionSearchQuery}
                        onChange={(e) => setCollectionSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            if (collectionSearchQuery) {
                              setCollectionSearchQuery('');
                            } else {
                              setShowCollectionSearch(false);
                            }
                          }
                        }}
                        placeholder="Search collections (e.g. 'x-men', 'marvel', or film titles)..."
                        className="w-full bg-transparent text-white text-sm placeholder:text-zinc-500 font-medium focus:outline-none"
                      />
                      {collectionSearchQuery && (
                        <button
                          type="button"
                          onClick={() => {
                            setCollectionSearchQuery('');
                            collectionSearchInputRef.current?.focus();
                          }}
                          className="p-2 text-zinc-500 hover:text-white transition-colors"
                          title="Clear search"
                        >
                          <X size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setShowCollectionSearch(false);
                          setCollectionSearchQuery('');
                        }}
                        className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white text-[9px] font-black uppercase tracking-widest transition-colors ml-1"
                      >
                        Close
                      </button>
                    </div>

                    {collectionSearchQuery.trim() && (
                      <div className="flex items-center justify-between px-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        <span>
                          {filteredCollections.length} {filteredCollections.length === 1 ? 'collection' : 'collections'} found for &quot;{collectionSearchQuery}&quot;
                        </span>
                        <button
                          type="button"
                          onClick={() => setCollectionSearchQuery('')}
                          className="text-[#b88aff] hover:underline transition-colors"
                        >
                          Clear Filter
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {filteredCollections.map((list) => {
                  const validItems = (list.items || []).filter(Boolean);
                  const previews = validItems.slice(0, 3);
                  const totalCount = validItems.length;
                  const watchedCount = validItems.filter(item =>
                    item && entries.some(entry => entry && entry.tmdbId === item.tmdbId)
                  ).length;
                  const progressPercent = totalCount > 0 ? Math.round((watchedCount / totalCount) * 100) : 0;

                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      key={list.id}
                      onClick={() => setActiveListId(list.id)}
                      className="group relative p-6 rounded-[2.5rem] bg-[#0c0c0e] border border-white/5 hover:border-[#9b5cff]/30 transition-all duration-500 shadow-2xl flex flex-col cursor-pointer overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-[#0c0c0e] -z-10" />

                      <div className="space-y-6 relative z-10">
                        <div className="flex justify-between items-start">
                          <div className="min-w-0 pr-4">
                            <div className="space-y-0.5">
                              <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter italic leading-tight truncate">{list.name}</h3>
                              <p className="text-[9px] font-bold text-zinc-600 uppercase tracking-widest">{totalCount} TITLES</p>
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <button onClick={(e) => { e.stopPropagation(); setIsEditingName(list.id); setEditingNameValue(list.name); }} className="p-2 text-zinc-700 hover:text-white transition-colors"><Edit2 size={12} /></button>
                            <button onClick={(e) => { e.stopPropagation(); removeCustomList(list.id); }} className="p-2 text-zinc-700 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                          </div>
                        </div>

                        <div className="relative h-32 md:h-40 flex items-center justify-center">
                          {previews.length > 0 ? (
                            <div className="flex -space-x-12 md:-space-x-16">
                              {previews.map((item, i) => (
                                <motion.div
                                  key={`${item.tmdbId}-${i}`}
                                  initial={{ opacity: 0, x: 20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.1 }}
                                  className="w-20 md:w-24 aspect-[2/3] rounded-xl overflow-hidden border border-white/10 shadow-2xl rotate-[-5deg] group-hover:rotate-0 transition-transform duration-500"
                                  style={{ zIndex: 3 - i }}
                                >
                                  <CachedImage src={item.posterUrl} className="w-full h-full object-cover" alt="" />
                                </motion.div>
                              ))}
                            </div>
                          ) : (
                            <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center border border-dashed border-white/10 text-zinc-800">
                              <Bookmark size={24} />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-4 pt-2">
                          <div className="flex-1 space-y-2">
                            <div className="flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">
                              <span>Progress</span>
                              <span>{progressPercent}%</span>
                            </div>
                            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                              <div
                                style={{
                                  transform: `scaleX(${progressPercent / 100})`,
                                  transformOrigin: 'left',
                                  transition: 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)'
                                }}
                                className="h-full w-full bg-[#9b5cff]"
                              />
                            </div>
                          </div>
                          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-white group-hover:bg-[#9b5cff] transition-all">
                             <ArrowRight size={14} />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}

                {filteredCollections.length === 0 && (
                  <div className="col-span-full py-16 px-6 text-center space-y-4 bg-[#0c0c0e] border border-white/5 rounded-[2.5rem]">
                    <Search size={36} className="text-zinc-700 mx-auto" />
                    <div className="space-y-1">
                      <p className="text-zinc-200 font-black text-lg uppercase tracking-tight italic">
                        {collectionSearchQuery.trim() ? 'No Collections Match Search' : 'No Collections Found'}
                      </p>
                      <p className="text-zinc-600 text-xs">
                        {collectionSearchQuery.trim()
                          ? `No custom collections matching "${collectionSearchQuery}".`
                          : 'Create your first custom collection or import one.'}
                      </p>
                    </div>
                    {collectionSearchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          setCollectionSearchQuery('');
                          collectionSearchInputRef.current?.focus();
                        }}
                        className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors"
                      >
                        Reset Filter
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={`custom-list-detail-${activeListId}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              onAnimationStart={scrollToTopInstant}
              className="space-y-6 md:space-y-8 min-h-screen"
            >
              <div className="fixed inset-0 bg-[#0c0c0e] -z-10" />

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setActiveListId(null)}
                    className="p-3 bg-zinc-900 rounded-2xl border border-white/5 hover:bg-white/5 active:scale-95 transition-all"
                  >
                    <ChevronLeft size={20} className="text-zinc-500" />
                  </button>
                  <div className="space-y-1">
                    <h2
                      className="text-2xl md:text-5xl font-black tracking-tighter italic text-white uppercase leading-none"
                    >
                      {activeList.name}
                    </h2>
                    <p className="text-purple-500 font-black uppercase tracking-[0.4em] text-[9px]">{activeList.items?.length || 0} Entries</p>
                  </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                  <button
                    onClick={() => setIsSelectionMode(!isSelectionMode)}
                    className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl font-black text-[9px] uppercase tracking-widest transition-all ${
                      isSelectionMode ? 'bg-[#9b5cff] text-white shadow-lg shadow-purple-500/20' : 'bg-white/5 text-zinc-500'
                    }`}
                  >
                    {isSelectionMode ? <X size={14} /> : <CheckSquare size={14} />}
                    <span>{isSelectionMode ? 'Cancel' : 'Select'}</span>
                  </button>
                  <button
                    onClick={() => { setShowSearchModal(true); setReplaceTmdbId(null); }}
                    className="flex-1 flex items-center justify-center gap-2 p-4 bg-white text-black rounded-2xl font-black text-[9px] uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                  >
                    <PlusCircle size={14} /> <span>Add</span>
                  </button>
                </div>
              </div>

              <div className="sticky top-2 z-40 space-y-3">
                 <div className="bg-[#0c0c0e]/90 p-3 md:p-4 rounded-[2.5rem] border border-white/10 backdrop-blur-3xl shadow-2xl flex flex-col gap-4">
                    <div className="relative group">
                      <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-purple-400 transition-colors" size={16} />
                      <input
                        type="text"
                        placeholder="Search items in list..."
                        value={localSearchQuery}
                        onChange={(e) => setLocalSearchQuery(e.target.value)}
                        className="w-full bg-black/40 border border-white/5 rounded-2xl pl-12 pr-10 py-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-purple-500/20 transition-all italic placeholder:text-zinc-500"
                      />
                    </div>

                    <div className="flex flex-col md:flex-row gap-3">
                      <div className="flex bg-black/40 p-1 rounded-2xl border border-white/5 flex-1 overflow-x-auto no-scrollbar">
                        {[
                          { id: 'all', label: 'ALL', icon: <Layers size={14} /> },
                          { id: 'movie', label: 'FILM', icon: <Film size={14} /> },
                          { id: 'tv', label: 'TV', icon: <Tv size={14} /> }
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            onClick={() => setTypeFilter(tab.id as any)}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-black text-[8px] uppercase tracking-widest transition-all whitespace-nowrap ${
                              typeFilter === tab.id ? 'bg-[#1a1a1e] text-[#c0a0ff] shadow-sm' : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            {tab.icon} <span>{tab.label}</span>
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSortBy(sortBy === 'date' ? 'alpha' : 'date')}
                          className="flex-1 flex items-center justify-center gap-2 px-5 py-4 bg-zinc-900 border border-white/5 rounded-2xl text-[8px] font-black uppercase tracking-widest text-zinc-400"
                        >
                          {sortBy === 'date' ? <Calendar size={14} /> : <Type size={14} />}
                          <span>{sortBy === 'date' ? 'Date' : 'Alpha'}</span>
                        </button>
                        <div className="flex bg-zinc-900 p-1 rounded-2xl border border-white/5">
                          <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl ${viewMode === 'grid' ? 'bg-[#27272a] text-white' : 'text-zinc-700'}`}><LayoutGrid size={14} /></button>
                          <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl ${viewMode === 'list' ? 'bg-[#27272a] text-white' : 'text-zinc-700'}`}><ListFilter size={14} /></button>
                        </div>
                      </div>
                    </div>
                 </div>
              </div>

              <div className={`
                ${viewMode === 'grid'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-6'
                  : 'flex flex-col gap-3'}
                relative z-10 pt-2
              `}>
                {(displayItems || []).filter(Boolean).map((item, idx) => {
                  if (!item) return null;
                  const isWatched = entries.some(e => e && e.tmdbId === item.tmdbId);
                  const isSelected = selectedTmdbIds.has(item.tmdbId);

                  return (
                    <motion.div
                      layout
                      key={`${item.tmdbId}-${idx}`}
                      onClick={() => isSelectionMode && toggleSelection(item.tmdbId)}
                      className={`
                        group relative rounded-2xl md:rounded-[2rem] overflow-hidden bg-zinc-900 border border-white/5
                        ${viewMode === 'list' ? 'h-auto' : 'aspect-[2/3]'}
                        ${isSelected ? 'ring-2 ring-[#9b5cff]' : ''}
                      `}
                    >
                      {viewMode === 'grid' ? (
                        <>
                          <CachedImage src={item.posterUrl} className="w-full h-full object-cover" loading="lazy" />
                          {isWatched && <WatchedEyeIndicator />}
                          {!isSelectionMode && (
                             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 md:group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4 gap-2">
                               <button
                                 onClick={() => navigate(`/add-entry?id=${item.tmdbId}&type=${item.type}`, { state: { from: location.pathname + location.search } })}
                                 className="w-full py-2 bg-white text-black rounded-xl text-[8px] font-black uppercase italic"
                               >
                                 Log Entry
                               </button>
                             </div>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-3 p-3 bg-[#111]/40 border border-white/5 rounded-2xl">
                          <CachedImage src={item.posterUrl} className="w-12 h-18 object-cover rounded-lg" />
                          <div className="flex-1 min-w-0 text-left">
                            <h3
                              className="font-bold text-white truncate text-xs uppercase tracking-tight cursor-pointer hover:text-[#9b5cff] transition-all flex items-center gap-1 group/title"
                              title="Click to copy entry name"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(item.title);
                                toast.success(`Copied: "${item.title}"`);
                              }}
                            >
                              <span className="truncate">{item.title}</span>
                              <Copy size={10} className="opacity-0 group-hover/title:opacity-100 text-[#9b5cff] transition-opacity shrink-0 hidden sm:inline" />
                            </h3>
                            {isWatched && <span className="text-emerald-500 text-[7px] font-black uppercase tracking-widest italic">Watched</span>}
                          </div>
                          {!isSelectionMode && (
                            <button onClick={() => removeItemFromList(item.tmdbId)} className="p-3 text-zinc-800 hover:text-red-500 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      {/* Optimized Mobile Batch Bar */}
      <AnimatePresence>
        {isSelectionMode && selectedTmdbIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-28 left-0 right-0 z-[2100] px-6 flex justify-center"
          >
            <div className="w-full max-sm bg-[#1a1a1e]/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-3 flex items-center justify-between shadow-2xl">
              <div className="px-5 border-r border-white/5 mr-2">
                <span className="text-lg font-black text-white italic">{selectedTmdbIds.size}</span>
                <span className="text-[7px] font-black text-zinc-500 block uppercase tracking-widest">Selects</span>
              </div>
              <div className="flex flex-1 gap-2">
                {selectedTmdbIds.size === 1 && (
                  <button
                    onClick={() => {
                      setReplaceTmdbId(Array.from(selectedTmdbIds)[0]);
                      setShowSearchModal(true);
                      setIsSelectionMode(false);
                      setSelectedTmdbIds(new Set());
                    }}
                    className="flex-1 p-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    <Edit2 size={14} />
                    <span className="text-[8px] font-black uppercase tracking-widest">Replace</span>
                  </button>
                )}
                <button onClick={handleBatchDelete} className="flex-1 p-3 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-xl flex items-center justify-center gap-2 transition-all">
                  <Trash2 size={14} />
                  <span className="text-[8px] font-black uppercase tracking-widest">Remove</span>
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Import Modal */}
      <AnimatePresence>
        {showBulkModal && (
          <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isImporting && setShowBulkModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-3xl" />
            <motion.div
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-xl bg-[#0c0c0e] rounded-[3rem] border border-white/10 shadow-2xl p-8 md:p-12 overflow-hidden flex flex-col gap-8"
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter italic">Bulk Import</h2>
                  <p className="text-zinc-600 font-black uppercase tracking-widest text-[8px]">Paste titles to auto-generate collection</p>
                </div>
                {!isImporting && <button onClick={() => setShowBulkModal(false)} className="p-3 bg-white/5 rounded-2xl hover:text-white transition-colors"><X size={20} /></button>}
              </div>

              {isImporting ? (
                <div className="py-12 space-y-8 flex flex-col items-center justify-center text-center">
                   <div className="relative w-24 h-24 flex items-center justify-center">
                     <Loader2 className="animate-spin text-[#9b5cff]" size={48} />
                     <span className="absolute text-[10px] font-black text-white italic">{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
                   </div>
                   <div className="space-y-2">
                     <p className="text-sm font-black text-white uppercase italic tracking-tighter">Resolving Records...</p>
                     <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest truncate max-w-xs">{importProgress.name}</p>
                   </div>
                   <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                     <motion.div
                       initial={{ width: 0 }}
                       animate={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                       className="h-full bg-[#9b5cff]"
                     />
                   </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-zinc-700 uppercase tracking-[0.4em] px-1">Collection Name</label>
                    <input
                      placeholder="e.g. IMDb Top 250, Nolan Filmography"
                      value={bulkListName}
                      onChange={(e) => setBulkListName(e.target.value)}
                      className="w-full h-14 bg-black border border-white/5 rounded-2xl px-6 text-sm font-bold text-white outline-none focus:border-purple-500/30 transition-all italic"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-zinc-700 uppercase tracking-[0.4em] px-1">Title List (One Per Line)</label>
                    <textarea
                      placeholder="Inception&#10;Interstellar&#10;The Dark Knight..."
                      value={bulkText}
                      onChange={(e) => setBulkText(e.target.value)}
                      className="w-full h-48 bg-black border border-white/5 rounded-3xl p-6 text-sm font-bold text-white outline-none focus:border-purple-500/30 transition-all italic resize-none no-scrollbar"
                    />
                  </div>
                  <button
                    onClick={handleBulkImport}
                    disabled={!bulkListName.trim() || !bulkText.trim()}
                    className="w-full py-6 bg-white text-black rounded-3xl font-black text-[10px] uppercase tracking-[0.4em] italic shadow-2xl active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
                  >
                    <Send size={14} /> Start Parsing Archives
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSearchModal && (
          <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowSearchModal(false); setReplaceTmdbId(null); }} className="absolute inset-0 bg-black/95 backdrop-blur-3xl" />
            <motion.div
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="relative w-full max-w-3xl bg-[#0c0c0e] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col h-[80vh]"
            >
              <div className="p-6 md:p-10 pb-2 space-y-6 flex flex-col shrink-0">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl md:text-3xl font-black text-white uppercase tracking-tighter italic">
                    {replaceTmdbId ? 'Replace Media' : 'Search Media'}
                  </h2>
                  <button onClick={() => { setShowSearchModal(false); setReplaceTmdbId(null); }} className="p-3 bg-white/5 rounded-2xl text-zinc-500"><X size={20} /></button>
                </div>
                <div className="relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-700" size={18} />
                  <input autoFocus placeholder="Find films or series..." value={globalSearchQuery} onChange={(e) => setGlobalSearchQuery(e.target.value)} className="w-full h-16 bg-black border border-white/5 rounded-2xl pl-16 pr-8 text-sm font-bold outline-none placeholder:text-zinc-800 italic" />
                  {isSearching && <div className="absolute right-6 top-1/2 -translate-y-1/2"><Loader2 className="animate-spin text-[#9b5cff]" size={16} /></div>}
                </div>
              </div>
              <div ref={searchScrollRef} className="flex-1 overflow-y-auto no-scrollbar p-6 pt-0 pb-20">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {searchResults.map((res, idx) => (
                    <button key={`${res.id}-${idx}`} onClick={() => addItemToList(res)} className="group flex flex-col gap-3 text-left active:scale-[0.98] transition-all">
                      <div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-xl">
                        <CachedImage src={res.poster_path ? `${TMDB_IMAGE_BASE}${res.poster_path}` : ''} className="w-full h-full object-cover" alt="" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                           <PlusCircle size={24} className="text-white" />
                        </div>
                      </div>
                      <p className="font-bold text-sm text-zinc-100 line-clamp-1 group-hover:text-purple-400 transition-colors px-1 mt-1">
                        {res.title || res.name}
                      </p>
                      <p className="font-bold text-xs text-zinc-500 tracking-widest leading-none px-1">
                        {(res.release_date || res.first_air_date || '').split('-')[0] || 'N/A'}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Collection Modal */}
      <AnimatePresence>
        {isEditingName && (
          <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditingName(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-3xl px-4"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative w-full max-w-md bg-[#0c0c0e] rounded-[3rem] border border-white/10 overflow-hidden flex flex-col p-8 gap-6 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-white uppercase tracking-tighter italic">Rename Collection</h2>
                <button
                  onClick={() => setIsEditingName(null)}
                  className="p-3 bg-white/5 rounded-2xl text-zinc-500 hover:text-white transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4">
                <input
                  type="text"
                  autoFocus
                  value={editingNameValue}
                  onChange={(e) => setEditingNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveName(isEditingName);
                    }
                  }}
                  className="w-full h-14 bg-black border border-white/5 rounded-2xl px-6 text-sm font-bold text-white outline-none focus:border-purple-500/30 transition-all italic"
                  placeholder="Collection Name"
                />
                <button
                  onClick={() => handleSaveName(isEditingName)}
                  className="w-full py-5 bg-[#9b5cff] text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.4em] shadow-2xl shadow-purple-500/20 active:scale-95 transition-all outline-none"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomListsPage;
