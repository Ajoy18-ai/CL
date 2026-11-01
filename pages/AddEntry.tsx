import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Tv, Film, TrendingUp, ArrowLeft, Star, Clock, Plus, Calendar, Sparkles, Bookmark, CheckCircle2, Loader2, FolderPlus, X, ChevronRight, ChevronLeft, ChevronDown, Play, Flame, Layers, Heart, Info, Users, Languages, PenTool, Video, User, Copy, Scan, History } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import { TMDBResult, Rating, WatchListItem, WatchList, RecentSearchItem, WatchEntry } from '../types';
import { searchTMDB, getTrending, getTopRated, fetchMediaDetails, fetchMediaCredits } from '../services/api';
import { TMDB_IMAGE_BASE, TMDB_IMAGE_LARGE, TMDB_IMAGE_ORIGINAL, TMDB_BASE_URL, TMDB_KEY, BLOCKED_TMDB_IDS } from '../constants';
import RatingButtons from '../components/RatingButtons';
import StreamSourcesModal from '../components/StreamSourcesModal';
import SearchHistoryModal from '../components/SearchHistoryModal';
import { CustomDatePicker } from '../components/CustomDatePicker';
import { WatchedTag } from '../components/WatchedTag';
import { formatRuntimeHM } from '../components/formater';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  getStoredSearchHistory,
  saveSearchHistoryItem,
  removeSearchHistoryItem,
  clearAllSearchHistory
} from '../services/searchHistory';

interface ExtraDetails {
  id: number;
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
  seasons?: { id: number; name: string; season_number: number; poster_path: string | null; episode_count: number; air_date: string; overview: string }[];
  studios: string[];
  creators?: { id: number; name: string }[];
  showrunners?: { id: number; name: string }[];
}

const formatReleaseDate = (rawDate?: string) => {
  if (!rawDate) return null;
  const trimmed = rawDate.trim();
  const parts = trimmed.split('-');
  const yearStr = parts[0];
  const yearInt = parseInt(yearStr, 10);

  if (isNaN(yearInt)) {
    return { dayMonth: '', year: yearStr, yearInt: undefined, full: trimmed };
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (parts.length >= 3) {
    const monthNum = parseInt(parts[1], 10);
    const dayNum = parseInt(parts[2], 10);
    const monthName = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? months[monthNum - 1] : parts[1];
    const dayStr = !isNaN(dayNum) ? `${dayNum}` : parts[2];

    return {
      day: dayStr,
      month: monthName,
      dayMonth: `${dayStr} ${monthName}`,
      year: yearStr,
      yearInt,
      full: `${dayStr} ${monthName} ${yearStr}`
    };
  } else if (parts.length === 2) {
    const monthNum = parseInt(parts[1], 10);
    const monthName = !isNaN(monthNum) && monthNum >= 1 && monthNum <= 12 ? months[monthNum - 1] : parts[1];
    return {
      day: '',
      month: monthName,
      dayMonth: monthName,
      year: yearStr,
      yearInt,
      full: `${monthName} ${yearStr}`
    };
  }

  return {
    day: '',
    month: '',
    dayMonth: '',
    year: yearStr,
    yearInt,
    full: yearStr
  };
};

const isMediaMatchingEntry = (
  media: { id?: number | string; title?: string; name?: string; release_date?: string; first_air_date?: string },
  entry: WatchEntry,
  activeSeasonName?: string | null
): boolean => {
  if (!media || !entry) return false;
  const mediaId = Number(media.id);
  const entryTmdbId = entry.tmdbId ? Number(entry.tmdbId) : null;

  // Authoritative check: If BOTH have valid numeric TMDB IDs
  if (mediaId && entryTmdbId) {
    if (entryTmdbId !== mediaId) {
      return false; // Different TMDB entities: definitely NOT a match!
    }
    // Same show/movie. If checking a specific season, ensure it matches that season
    if (activeSeasonName) {
      const cleanSeason = activeSeasonName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanEntryTitle = (entry.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanEntryTitle.includes('season')) {
        return cleanEntryTitle.includes(cleanSeason);
      }
    }
    return true;
  }

  // Fallback strictly for entries missing TMDB ID (e.g. legacy import)
  const mediaTitle = (media.title || media.name || '').trim().toLowerCase();
  const entryTitle = (entry.title || '').trim().toLowerCase();
  if (!mediaTitle || !entryTitle) return false;

  const cleanMedia = mediaTitle.replace(/[^a-z0-9]/g, '');
  const cleanEntry = entryTitle.replace(/[^a-z0-9]/g, '');

  if (!cleanMedia || !cleanEntry) return false;

  // STRICT exact equality only — NO .startsWith or substring check!
  if (cleanMedia !== cleanEntry) {
    if (activeSeasonName) {
      const expectedWithSeason = `${cleanMedia}${activeSeasonName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      if (cleanEntry === expectedWithSeason) return true;
    }
    return false;
  }

  // If both have years, require matching year
  const mediaYear = parseInt((media.release_date || media.first_air_date || '').split('-')[0], 10);
  const entryYear = entry.releaseYear ? parseInt(entry.releaseYear, 10) : (entry.year || null);
  if (mediaYear && entryYear && !isNaN(mediaYear) && !isNaN(entryYear)) {
    if (Math.abs(mediaYear - entryYear) > 1) {
      return false;
    }
  }

  return true;
};

const AddEntry: React.FC = () => {
  const toast = useToastStore();
  const { entries, addEntry, watchLists, addWatchList, updateWatchList, refreshWatchLists, blurPosters, setIsPosterModalOpen } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');

  // Recent Searches & History Modal State
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(() => getStoredSearchHistory());
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Synchronize history if changed anywhere in the app
  useEffect(() => {
    const handleHistoryUpdate = () => {
      setRecentSearches(getStoredSearchHistory());
    };
    window.addEventListener('cinelog:search-history-updated', handleHistoryUpdate);
    window.addEventListener('storage', handleHistoryUpdate);
    return () => {
      window.removeEventListener('cinelog:search-history-updated', handleHistoryUpdate);
      window.removeEventListener('storage', handleHistoryUpdate);
    };
  }, []);

  const saveRecentSearch = (itemOrQuery: string | Partial<RecentSearchItem>) => {
    const updated = saveSearchHistoryItem(itemOrQuery);
    setRecentSearches(updated);
  };

  const handleRemoveRecentSearch = (idOrQuery: string) => {
    const updated = removeSearchHistoryItem(idOrQuery);
    setRecentSearches(updated);
  };

  const handleClearAllRecentSearches = () => {
    const updated = clearAllSearchHistory();
    setRecentSearches(updated);
    toast.success('Search and visit history cleared');
  };

  const handleSelectRecentSearch = (itemOrQuery: RecentSearchItem | string) => {
    const query = typeof itemOrQuery === 'string' ? itemOrQuery : itemOrQuery.query;
    setSearch(query);
    handleSearch(1, query);

    // If it is a talent or company item from history, also allow navigating or searching
    if (typeof itemOrQuery === 'object') {
      saveRecentSearch(itemOrQuery);
      if ((itemOrQuery.type === 'person' || itemOrQuery.type === 'company') && itemOrQuery.entityId) {
        navigate(`/explore?search=${encodeURIComponent(query)}&tab=${itemOrQuery.type === 'person' ? 'talents' : 'studios'}`);
        setShowHistoryModal(false);
        return;
      }
    } else {
      saveRecentSearch(query);
    }
    setShowHistoryModal(false);
  };

  // Discovery States
  const [discoveryItems, setDiscoveryItems] = useState<TMDBResult[]>([]);
  const [discoveryMode, setDiscoveryMode] = useState<'trending' | 'topRated'>('trending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'tv'>('all');
  const [languageFilter, setLanguageFilter] = useState<string>('all');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoadingDiscovery, setIsLoadingDiscovery] = useState(true);
  const [isLoadingMore_discovery, setIsLoadingMore_discovery] = useState(false);

  // Search States
  const [searchResults, setSearchResults] = useState<TMDBResult[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMoreSearch, setIsLoadingMoreSearch] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [selectedMedia, setSelectedMedia] = useState<TMDBResult | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [isVague, setIsVague] = useState(false);
  const [isAbsoluteCinema, setIsAbsoluteCinema] = useState(false);
  const [isRewatch, setIsRewatch] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [review, setReview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [extraDetails, setExtraDetails] = useState<ExtraDetails | null>(null);

  const activeSeason = useMemo(() => {
    return selectedSeason !== null && extraDetails?.seasons ? extraDetails.seasons.find(s => s.season_number === selectedSeason) : null;
  }, [selectedSeason, extraDetails]);

  // Check if current selected media has already been logged/watched in the diary
  const watchedEntries = useMemo(() => {
    if (!selectedMedia) return [];
    return (entries || []).filter(e => isMediaMatchingEntry(selectedMedia, e, activeSeason?.name));
  }, [entries, selectedMedia, activeSeason]);

  const isAlreadyWatched = watchedEntries.length > 0;
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const infoCastScrollRef = useRef<HTMLDivElement>(null);

  const scrollInfoCast = (direction: 'left' | 'right') => {
    if (infoCastScrollRef.current) {
      const scrollOffset = direction === 'left' ? -260 : 260;
      infoCastScrollRef.current.scrollBy({ left: scrollOffset, behavior: 'smooth' });
    }
  };

  // Folder Selector States
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [addedStatus, setAddedStatus] = useState<string | null>(null);
  const [isInitializingPreselect, setIsInitializingPreselect] = useState(false);

  // Streaming Modal State
  const [showStreamModal, setShowStreamModal] = useState(false);

  // Fullscreen Poster Modal State
  const [fullscreenPosterData, setFullscreenPosterData] = useState<{ url: string; fallbackUrl?: string; title: string } | null>(null);

  // Escape key listener to close fullscreen poster
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && fullscreenPosterData) {
        setFullscreenPosterData(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fullscreenPosterData]);

  // Sync isPosterModalOpen so sidebar is hidden when fullscreen poster is open
  useEffect(() => {
    if (fullscreenPosterData) {
      setIsPosterModalOpen(true);
    } else {
      setIsPosterModalOpen(false);
    }
    return () => {
      setIsPosterModalOpen(false);
    };
  }, [fullscreenPosterData, setIsPosterModalOpen]);

  // Click outside listener for language dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setShowLanguageDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Initial Fetch & Reset
  useEffect(() => {
    refreshWatchLists();
    setHasMore(true);
    loadDiscovery(1, true);
  }, [discoveryMode, typeFilter, languageFilter]);

  const loadDiscovery = async (page: number, reset: boolean = false) => {
    if (page === 1 || reset) {
      setIsLoadingDiscovery(true);
    } else {
      setIsLoadingMore_discovery(true);
    }
    try {
      let res: TMDBResult[] = [];
      if (discoveryMode === 'trending') {
        res = await getTrending(page, typeFilter, languageFilter);
      } else {
        res = await getTopRated(page, typeFilter === 'all' ? 'both' : typeFilter, languageFilter);
      }

      const filteredRes = res.filter(item => !BLOCKED_TMDB_IDS.includes(item.id));
      if (filteredRes.length === 0) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      setDiscoveryItems(prev => (reset || page === 1) ? filteredRes : [...prev, ...filteredRes]);
      setCurrentPage(page);
    } catch (e) {
      console.error("Discovery fetch failed:", e);
      setHasMore(false);
    } finally {
      setIsLoadingDiscovery(false);
      setIsLoadingMore_discovery(false);
    }
  };

  const handleSearch = async (page: number = 1, queryOverride?: string) => {
    const term = queryOverride !== undefined ? queryOverride : search;
    if (term.trim().length <= 1) return;

    if (page === 1) {
      setIsSearching(true);
    } else {
      setIsLoadingMoreSearch(true);
    }
    try {
      const res = await searchTMDB(term.trim(), page);
      const filteredRes = res.filter(item => !BLOCKED_TMDB_IDS.includes(item.id));
      if (filteredRes.length === 0) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
      setSearchResults(prev => page === 1 ? filteredRes : [...prev, ...filteredRes]);
      setSearchPage(page);
    } catch (e) {
      console.error("Search failed:", e);
      setHasMore(false);
    } finally {
      setIsSearching(false);
      setIsLoadingMoreSearch(false);
    }
  };

  const handleLoadMore = useCallback(() => {
    const isBusy = isLoadingDiscovery || isSearching || isLoadingMore_discovery || isLoadingMoreSearch;
    if (isBusy || !hasMore) return;

    if (search.trim().length > 1) {
      handleSearch(searchPage + 1, search.trim());
    } else {
      loadDiscovery(currentPage + 1, false);
    }
  }, [
    isLoadingDiscovery,
    isSearching,
    isLoadingMore_discovery,
    isLoadingMoreSearch,
    hasMore,
    search,
    searchPage,
    currentPage,
    discoveryMode,
    typeFilter,
    languageFilter
  ]);

  // Observer reference to watch the last item in the list
  const observer = useRef<IntersectionObserver | null>(null);

  const lastElementRef = useCallback(
    (node: HTMLElement | null) => {
      const isBusy = isLoadingDiscovery || isSearching || isLoadingMore_discovery || isLoadingMoreSearch;
      if (isBusy) return;
      if (observer.current) observer.current.disconnect();

      observer.current = new IntersectionObserver(
        (entries) => {
          // When the last poster comes into view, trigger the next page
          if (entries[0].isIntersecting && hasMore) {
            handleLoadMore();
          }
        },
        {
          rootMargin: '200px' // Starts loading 200px before the user even reaches the bottom
        }
      );

      if (node) observer.current.observe(node);
    },
    [isLoadingDiscovery, isSearching, isLoadingMore_discovery, isLoadingMoreSearch, hasMore, handleLoadMore]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search.trim().length > 1) {
        setHasMore(true);
        setSearchPage(1);
        handleSearch(1, search.trim());
      } else {
        setSearchResults([]);
        setSearchPage(1);
        setHasMore(true);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const root = document.getElementById('root');
    if (root) {
      requestAnimationFrame(() => {
        root.scrollTo({ top: 0, behavior: 'instant' });
        window.scrollTo(0, 0);
      });
    }
    if (selectedMedia) {
      fetchFullDetails(selectedMedia);
    }
  }, [selectedMedia]);

  const fetchFullDetails = async (media: TMDBResult) => {
    if (extraDetails && extraDetails.id === media.id) return;
    setIsLoadingDetails(true);
    try {
      const [details, credits] = await Promise.all([
        fetchMediaDetails(media.id, media.media_type),
        fetchMediaCredits(media.id, media.media_type)
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
      const cast = castList.slice(0, 30).map((c: any) => ({
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
        id: media.id,
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

  const containingLists = useMemo(() => {
    if (!selectedMedia) return [];
    return watchLists.filter(list =>
      list.items?.some(item => item.tmdbId === selectedMedia.id)
    );
  }, [selectedMedia, watchLists]);

  useEffect(() => {
    const preId = searchParams.get('id');
    const preType = searchParams.get('type');

    if (preId && preType) {
      if (BLOCKED_TMDB_IDS.includes(parseInt(preId))) {
        navigate('/add-entry', { replace: true });
        return;
      }
      const fetchPreSelected = async () => {
        setIsInitializingPreselect(true);
        try {
          const response = await fetch(`${TMDB_BASE_URL}/${preType}/${preId}?api_key=${TMDB_KEY}&language=en-US&include_adult=true`);
          if (!response.ok) throw new Error("Could not find media");
          const data = await response.json();

          const alreadyWatched = (entries || []).some(e => isMediaMatchingEntry(data, e));

          setSelectedMedia({
            id: data.id,
            title: data.title,
            name: data.name,
            poster_path: data.poster_path,
            media_type: preType as 'movie' | 'tv',
            release_date: data.release_date,
            first_air_date: data.first_air_date,
            genre_ids: data.genres?.map((g: any) => g.id) || []
          });
          setRating(null);
          setIsVague(false);
          setIsAbsoluteCinema(false);
          setIsRewatch(alreadyWatched);
          setIsFavorite(false);
          setReview('');
        } catch (e) {
          console.error("Auto-select failed:", e);
        } finally {
          setIsInitializingPreselect(false);
        }
      };
      fetchPreSelected();
    }
  }, [searchParams]);

  const handleAddToExistingList = async (list: WatchList) => {
    if (!selectedMedia) return;
    if (list.items?.some(i => i.tmdbId === selectedMedia.id)) return;

    try {
      const season = selectedSeason !== null && extraDetails?.seasons ? extraDetails.seasons.find(s => s.season_number === selectedSeason) : null;
      const title = season ? `${selectedMedia.title || selectedMedia.name} - ${season.name}` : (selectedMedia.title || selectedMedia.name || 'Untitled');
      const posterUrl = season?.poster_path ? `${TMDB_IMAGE_BASE}${season.poster_path}` : (selectedMedia.poster_path ? `${TMDB_IMAGE_BASE}${selectedMedia.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster');

      const newItem: WatchListItem = {
        tmdbId: selectedMedia.id,
        type: selectedMedia.media_type,
        title,
        posterUrl,
        addedAt: new Date().toISOString(),
        episodeCount: season?.episode_count,
        airDate: season?.air_date,
        seasonSynopsis: season?.overview
      };

      const updatedItems = [...(list.items || []), newItem];
      await updateWatchList(list.id, { items: updatedItems });

      setAddedStatus(list.name);
      setShowFolderSelector(false);
      toast.success(`"${newItem.title}" has been successfully added to your "${list.name}" watch list.`);
      setTimeout(() => setAddedStatus(null), 3000);
    } catch (error) {
      console.error("Failed to add to watch list:", error);
      toast.error(`We couldn't add "${selectedMedia?.title || 'this title'}" to your watch list. Please check your network and try again.`);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!selectedMedia || !newFolderName.trim()) return;

    try {
      const season = selectedSeason !== null && extraDetails?.seasons ? extraDetails.seasons.find(s => s.season_number === selectedSeason) : null;
      const title = season ? `${selectedMedia.title || selectedMedia.name} - ${season.name}` : (selectedMedia.title || selectedMedia.name || 'Untitled');
      const posterUrl = season?.poster_path ? `${TMDB_IMAGE_BASE}${season.poster_path}` : (selectedMedia.poster_path ? `${TMDB_IMAGE_BASE}${selectedMedia.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster');

      const newItem: WatchListItem = {
        tmdbId: selectedMedia.id,
        type: selectedMedia.media_type,
        title,
        posterUrl,
        addedAt: new Date().toISOString(),
        episodeCount: season?.episode_count,
        airDate: season?.air_date,
        seasonSynopsis: season?.overview
      };

      await addWatchList(newFolderName.trim(), [newItem]);

      setAddedStatus(newFolderName.trim());
      setIsCreatingFolder(false);
      setNewFolderName('');
      setShowFolderSelector(false);
      toast.success(`Successfully created custom watch list "${newFolderName.trim()}" and added "${newItem.title}" to it!`);
      setTimeout(() => setAddedStatus(null), 3000);
    } catch (error) {
      console.error("Failed to create folder:", error);
      toast.error('Could not create the new list folder. Please make sure the list name is valid and try again.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedia || isSubmitting || !rating) return;

    try {
      setIsSubmitting(true);
      const details = await fetchMediaDetails(selectedMedia.id, selectedMedia.media_type);

      const season = selectedSeason !== null && extraDetails?.seasons ? extraDetails.seasons.find(s => s.season_number === selectedSeason) : null;
      const title = season ? `${selectedMedia.title || selectedMedia.name} - ${season.name}` : (selectedMedia.title || selectedMedia.name || 'Untitled');
      const posterUrl = season?.poster_path ? `${TMDB_IMAGE_BASE}${season.poster_path}` : (selectedMedia.poster_path ? `${TMDB_IMAGE_BASE}${selectedMedia.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster');

      const releaseYear = season?.air_date?.split('-')[0] || selectedMedia.release_date?.split('-')[0] || selectedMedia.first_air_date?.split('-')[0] || '';

      await addEntry({
        tmdbId: selectedMedia.id,
        type: selectedMedia.media_type,
        title,
        posterUrl,
        watchDate: date,
        rating,
        isVague,
        isAbsoluteCinema,
        isRewatch,
        isFavorite,
        review,
        year: new Date(date).getFullYear(),
        releaseYear,
        genres: details.genres,
        runtime: details.runtime,
        studios: details.studios || [],
        episodeCount: season?.episode_count,
        airDate: season?.air_date,
        seasonSynopsis: season?.overview
      });

      toast.success(`Logged "${title}" into your Watch Diary under ${date}.`);
      navigate('/');
    } catch (error) {
      console.error("Failed to log entry:", error);
      toast.error(`Failed to log "${selectedMedia?.title || 'this title'}" to your watch diary. Please verify your connection or input values.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSearchActive = search.trim().length > 1;
  const currentItems = isSearchActive ? searchResults : discoveryItems;
  const isInitialLoading = isSearchActive
    ? (isSearching && searchResults.length === 0)
    : (isLoadingDiscovery && discoveryItems.length === 0);
  const isLoadingMore = isSearchActive ? isLoadingMoreSearch : isLoadingMore_discovery;

  if (isInitializingPreselect) {
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center gap-6">
        <Loader2 className="animate-spin text-purple-500" size={40} />
        <p className="text-zinc-600 font-black uppercase tracking-[0.4em] text-[10px]">Retrieving Media Details...</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!selectedMedia ? (
            <motion.div
              key="search-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-10"
            >
              <div className="flex items-start justify-between gap-4 px-2">
                <div className="space-y-1.5 md:space-y-2 text-left">
                  <h1 className="text-4xl md:text-6xl font-black tracking-tighter italic text-white uppercase flex items-center gap-3">
                    Find & Log
                  </h1>
                  <p className="text-zinc-500 font-medium text-xs md:text-sm">Search the global TMDB database or discover trending masterworks</p>
                </div>

                <button
                  type="button"
                  onClick={() => setShowHistoryModal(true)}
                  className="p-3 md:p-4 rounded-2xl bg-[#111] hover:bg-zinc-800 border border-white/5 hover:border-purple-500/30 text-zinc-400 hover:text-white transition-all shadow-xl flex-shrink-0 group active:scale-95 cursor-pointer flex items-center gap-2"
                  title="Search History"
                  aria-label="Search History"
                >
                  <Clock size={18} className="group-hover:text-purple-400 transition-colors" />
                  <span className="text-xs font-bold uppercase tracking-wider hidden sm:inline text-zinc-400 group-hover:text-zinc-200">History</span>
                </button>
              </div>

              <div className="sticky top-4 z-30 group">
                <div className="absolute inset-0 bg-purple-600/10 blur-2xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-full -z-10" />
                <div className="relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-purple-400 transition-colors" size={20} />
                  <input
                    type="text"
                    placeholder="Search movies or series..."
                    className="w-full h-12 md:h-16 bg-[#111]/90 backdrop-blur-xl border border-white/10 rounded-xl md:rounded-[2.5rem] pl-16 pr-14 md:pr-16 text-base md:text-xl font-bold focus:outline-none focus:ring-2 focus:ring-purple-500/20 transition-all placeholder:text-zinc-700 shadow-2xl"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && search.trim().length > 1) {
                        e.preventDefault();
                        handleSearch(1, search.trim());
                        saveRecentSearch(search.trim());
                      }
                    }}
                  />
                  {isSearching ? (
                    <div className="absolute right-6 top-1/2 -translate-y-1/2">
                      <div className="w-5 h-5 md:w-6 md:h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : search.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('');
                        setSearchResults([]);
                      }}
                      className="absolute right-5 md:right-6 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                      aria-label="Clear search input"
                    >
                      <X size={16} />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
                  <div className="flex items-center gap-2.5">
                    {search.trim().length > 1 ? (
                      <Search size={16} className="text-zinc-500" />
                    ) : (
                      discoveryMode === 'trending' ? <Flame size={16} className="text-orange-500" /> : <Star size={16} className="text-yellow-500" />
                    )}
                    <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">
                      {search.trim().length > 1 ? 'Global Results' : (discoveryMode === 'trending' ? 'Global Trending' : 'Top Rated Masterpieces')}
                    </h2>
                  </div>

                  {search.trim().length <= 1 && (
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                      {/* Discovery Mode segment from Image */}
                      <div className="flex bg-black p-1.5 rounded-[1.8rem] border border-white/5 backdrop-blur-md shadow-inner relative overflow-hidden">
                        <button
                          onClick={() => setDiscoveryMode('trending')}
                          className={`relative z-10 px-6 py-3 rounded-full text-[10px] font-black tracking-widest uppercase transition-all duration-300 flex items-center gap-2 ${discoveryMode === 'trending' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          <Flame size={14} className={discoveryMode === 'trending' ? 'text-white' : 'text-zinc-600'} />
                          TRENDING
                          {discoveryMode === 'trending' && (
                            <motion.div layoutId="discoveryActive" className="absolute inset-0 bg-[#9b5cff] rounded-full -z-10 shadow-[0_0_20px_rgba(155,92,255,0.4)]" />
                          )}
                        </button>
                        <button
                          onClick={() => setDiscoveryMode('topRated')}
                          className={`relative z-10 px-6 py-3 rounded-full text-[10px] font-black tracking-widest uppercase transition-all duration-300 flex items-center gap-2 ${discoveryMode === 'topRated' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                          <Star size={14} className={discoveryMode === 'topRated' ? 'text-white' : 'text-zinc-600'} />
                          TOP RATED
                          {discoveryMode === 'topRated' && (
                            <motion.div layoutId="discoveryActive" className="absolute inset-0 bg-[#9b5cff] rounded-full -z-10 shadow-[0_0_20px_rgba(155,92,255,0.4)]" />
                          )}
                        </button>
                      </div>

                      {/* Media Type segment from Image */}
                      <div className="flex bg-black p-1.5 rounded-[1.8rem] border border-white/5 backdrop-blur-md shadow-inner relative overflow-hidden">
                        {[
                          { id: 'all', label: 'ALL', icon: null },
                          { id: 'movie', label: 'MOVIES', icon: <Film size={14} /> },
                          { id: 'tv', label: 'SERIES', icon: <Tv size={14} /> }
                        ].map((type) => (
                          <button
                            key={type.id}
                            onClick={() => setTypeFilter(type.id as any)}
                            className={`relative z-10 px-6 py-3 rounded-full text-[10px] font-black tracking-widest uppercase transition-all duration-300 flex items-center gap-2 ${typeFilter === type.id ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'}`}
                          >
                            {/* Added <any> cast to fix TypeScript error for 'className' property in React.cloneElement */}
                            {type.icon && React.cloneElement(type.icon as React.ReactElement<any>, { className: typeFilter === type.id ? 'text-white' : 'text-zinc-700' })}
                            {type.label}
                            {typeFilter === type.id && (
                              <motion.div layoutId="typeActive" className="absolute inset-0 bg-[#27272a] rounded-full -z-10" />
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Language Filter Dropdown */}
                      <div className="relative" ref={languageDropdownRef}>
                        <button
                          onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                          className="flex bg-black p-1.5 px-6 py-[14px] rounded-[1.8rem] border border-white/5 backdrop-blur-md shadow-inner items-center gap-2 text-[10px] font-black tracking-widest uppercase text-zinc-400 hover:text-white transition-all"
                        >
                          <Languages size={14} />
                          {
                            [
                              { id: 'all', label: 'GLOBAL' },
                              { id: 'en', label: 'HOLLYWOOD' },
                              { id: 'hi', label: 'BOLLYWOOD' },
                              { id: 'bn', label: 'BANGLA' },
                              { id: 'fr', label: 'FRANCE' },
                              { id: 'it', label: 'ITALIAN' },
                              { id: 'ru', label: 'RUSSIAN' }
                            ].find(l => l.id === languageFilter)?.label || 'GLOBAL'
                          }
                          <ChevronDown size={14} className={`transition-transform duration-300 ${showLanguageDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {showLanguageDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: 10, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 10, scale: 0.95 }}
                              transition={{ duration: 0.2 }}
                              className="absolute right-0 mt-2 w-48 bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
                            >
                              {[
                                { id: 'all', label: 'GLOBAL' },
                                { id: 'en', label: 'HOLLYWOOD' },
                                { id: 'hi', label: 'BOLLYWOOD' },
                                { id: 'bn', label: 'BANGLA' },
                                { id: 'fr', label: 'FRANCE' },
                                { id: 'it', label: 'ITALIAN' },
                                { id: 'ru', label: 'RUSSIAN' }
                              ].map((lang) => (
                                <button
                                  key={lang.id}
                                  onClick={() => {
                                    setLanguageFilter(lang.id);
                                    setShowLanguageDropdown(false);
                                  }}
                                  className={`w-full text-left px-6 py-4 text-[10px] font-black tracking-widest uppercase transition-all ${languageFilter === lang.id ? 'bg-[#9b5cff]/20 text-white' : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'}`}
                                >
                                  {lang.label}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  )}
                </div>

                {/* Initial Skeleton Loader or Poster Grid */}
                {isSearchActive && !isSearching && searchResults.length === 0 ? (
                  <div className="text-center py-20 space-y-4">
                    <Film className="mx-auto text-zinc-700" size={48} />
                    <p className="text-zinc-400 font-bold text-sm">No titles found for &quot;{search}&quot;</p>
                    <p className="text-zinc-600 text-xs font-semibold">Try searching with a different movie or TV series name</p>
                  </div>
                ) : isInitialLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {[...Array(12)].map((_, i) => (
                      <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                ) : (
                  /* Poster Grid */
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {currentItems.map((res, index) => {
                      const isLast = index === currentItems.length - 1;
                      const handleCardSelect = () => {
                        const alreadyWatched = (entries || []).some(e => isMediaMatchingEntry(res, e));

                        setSelectedMedia(res);
                        setExtraDetails(null);
                        setSelectedSeason(null);
                        setRating(null);
                        setIsVague(false);
                        setIsAbsoluteCinema(false);
                        setIsRewatch(alreadyWatched);
                        setIsFavorite(false);
                        setReview('');

                        const itemTitle = res.title || res.name || (search.trim().length > 1 ? search.trim() : 'Media');
                        const year = (res.release_date || res.first_air_date || '').split('-')[0];
                        saveRecentSearch({
                          query: itemTitle,
                          title: itemTitle,
                          type: res.media_type || (res.title ? 'movie' : 'tv'),
                          posterPath: res.poster_path || undefined,
                          year: year || undefined,
                          subtitle: res.media_type === 'tv' ? 'TV SERIES' : 'MOVIE',
                          entityId: res.id
                        });
                      };

                      return (
                        <button
                          key={`${res.id}-${index}`}
                          ref={isLast ? (lastElementRef as any) : null}
                          type="button"
                          onClick={handleCardSelect}
                          className="content-auto flex flex-col gap-3 group text-left relative transition-transform duration-150 active:scale-[0.97] touch-manipulation cursor-pointer select-none"
                        >
                          <div
                            className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-xl"
                          >
                            {res.poster_path ? (
                              <img
                                src={`${TMDB_IMAGE_BASE}${res.poster_path}`}
                                alt={res.title || res.name}
                                className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${blurPosters ? 'blur-2xl scale-110' : 'blur-0 scale-100'}`}
                                loading={index < 6 ? "eager" : "lazy"}
                                decoding="async"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center p-4 text-center text-[10px] font-black uppercase text-zinc-700 italic">
                                {res.title || res.name}
                              </div>
                            )}
                          </div>

                          <div className="px-1 space-y-0.5">
                             <h3 className="font-bold text-sm md:text-base text-zinc-200 truncate group-hover:text-purple-400 transition-colors">
                              {res.title || res.name}
                            </h3>
                            <div className="flex items-center gap-2">
                              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">
                                {res.release_date?.split('-')[0] || res.first_air_date?.split('-')[0] || 'N/A'}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Infinite Scroll Loading Skeleton */}
                {isLoadingMore && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 mt-6">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="aspect-[2/3] bg-white/5 rounded-2xl animate-pulse" />
                    ))}
                  </div>
                )}

                {/* End of results message */}
                {!hasMore && currentItems.length > 0 && !isLoadingMore && (
                  <div className="text-center py-10 text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em]">
                    End of Archives
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="config-view"
              layoutId={`media-card-${selectedMedia.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-4xl mx-auto space-y-12 min-h-[70vh]"
            >
              <div className="relative group">
                <div className="absolute inset-0 bg-purple-600/10 blur-[100px] -z-10 rounded-full" />
                <div className="flex flex-col md:flex-row gap-10 items-center md:items-start bg-[#111] p-8 md:p-10 rounded-[2.5rem] border border-white/5 shadow-2xl relative">

                  <div
                    onClick={() => {
                      const posterPath = activeSeason?.poster_path || selectedMedia.poster_path;
                      if (posterPath) {
                        setFullscreenPosterData({
                          url: posterPath.startsWith('http') ? posterPath : `${TMDB_IMAGE_ORIGINAL}${posterPath}`,
                          fallbackUrl: posterPath.startsWith('http') ? posterPath : `${TMDB_IMAGE_LARGE}${posterPath}`,
                          title: (activeSeason ? `${selectedMedia.title || selectedMedia.name} - ${activeSeason.name}` : (selectedMedia.title || selectedMedia.name)) || 'Poster'
                        });
                      }
                    }}
                    className={`shrink-0 relative overflow-hidden rounded-2xl md:rounded-3xl shadow-2xl ${
                      selectedMedia.poster_path || activeSeason?.poster_path
                        ? 'cursor-pointer group/poster select-none'
                        : ''
                    }`}
                    title={selectedMedia.poster_path || activeSeason?.poster_path ? "Click to view full screen" : undefined}
                  >
                    {selectedMedia.poster_path || activeSeason?.poster_path ? (
                      <>
                        <img
                          src={`${TMDB_IMAGE_LARGE}${activeSeason?.poster_path || selectedMedia.poster_path}`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `${TMDB_IMAGE_BASE}${activeSeason?.poster_path || selectedMedia.poster_path}`;
                          }}
                          decoding="async"
                          loading="eager"
                          className={`w-52 md:w-64 shadow-2xl ring-1 ring-white/10 transition-transform duration-300 group-hover/poster:scale-105 ${blurPosters ? 'blur-2xl scale-110' : 'blur-0 scale-100'}`}
                          alt="Selected"
                        />
                        {/* Hover icon overlay - Exact match for user's screenshot */}
                        <div className="absolute inset-0 bg-black/35 opacity-0 group-hover/poster:opacity-100 transition-opacity duration-300 flex items-center justify-center pointer-events-none">
                          <div className="w-13 h-13 md:w-14 md:h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/25 text-white flex items-center justify-center shadow-2xl scale-90 group-hover/poster:scale-100 transition-all duration-300">
                            <Scan size={22} className="text-white" strokeWidth={2.2} />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="w-52 h-78 md:w-64 md:h-96 bg-zinc-900 rounded-2xl flex items-center justify-center p-6 text-center text-zinc-700 italic font-black uppercase">
                        {selectedMedia.title || selectedMedia.name}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 text-center md:text-left space-y-6 pt-2">
                    <div className="flex flex-wrap items-center justify-center md:justify-between gap-4">
                      <button
                        onClick={() => {
                          if (searchParams.get('id')) {
                            if (location.state?.from) {
                              navigate(location.state.from);
                            } else if (window.history.state && window.history.state.idx > 0) {
                              navigate(-1);
                            } else {
                              navigate('/explore');
                            }
                          } else {
                            setSelectedMedia(null);
                            setExtraDetails(null);
                            setSelectedSeason(null);
                            setRating(null);
                            setIsVague(false);
                            setIsAbsoluteCinema(false);
                            setIsRewatch(false);
                            setIsFavorite(false);
                            setReview('');
                            navigate('/add-entry', { replace: true });
                          }
                        }}
                        className="text-zinc-600 text-[10px] font-black hover:text-white flex items-center gap-2 uppercase tracking-[0.2em] transition-all"
                      >
                        <ArrowLeft size={14} /> {searchParams.get('id') ? 'Go Back' : 'Change Selection'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          fetchFullDetails(selectedMedia);
                          setShowInfoModal(true);
                        }}
                        className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-zinc-400 hover:text-white transition-all border border-white/5"
                      >
                        <Info size={18} />
                      </button>
                    </div>

                    <div className="space-y-5">
                      <div className="space-y-2">
                        <h2
                          className="text-3xl md:text-5xl font-[900] tracking-tighter italic text-white leading-tight uppercase cursor-pointer hover:text-[#9b5cff] transition-all flex items-center justify-center md:justify-start gap-2.5 group/title"
                          title="Click to copy name"
                          onClick={() => {
                            const titleText = activeSeason
                              ? `${selectedMedia.title || selectedMedia.name} - ${activeSeason.name}`
                              : (selectedMedia.title || selectedMedia.name);
                            if (titleText) {
                              navigator.clipboard.writeText(titleText);
                              toast.success(`Copied: "${titleText}"`);
                            }
                          }}
                        >
                          <span>
                            {activeSeason
                              ? `${selectedMedia.title || selectedMedia.name} - ${activeSeason.name}`
                              : (selectedMedia.title || selectedMedia.name)}
                          </span>
                          <Copy size={20} className="opacity-0 group-hover/title:opacity-100 text-[#9b5cff] transition-opacity shrink-0 hidden sm:inline" />
                        </h2>

                        {/* Elegant Metadata Row */}
                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-3.5 gap-y-2 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                          <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[8px] font-black">
                            {selectedMedia.media_type === 'tv' ? 'Series' : 'Movie'}
                          </span>

                          {/* Dynamic WATCHED Tag with rating color, date hover/click reveal & popover */}
                          {isAlreadyWatched && (
                            <WatchedTag entries={watchedEntries} />
                          )}
                          {(() => {
                            const dateInfo = formatReleaseDate(
                              activeSeason?.air_date || selectedMedia.release_date || selectedMedia.first_air_date
                            );
                            if (!dateInfo) return null;
                            return (
                              <span className="inline-flex items-center gap-1.5">
                                {dateInfo.dayMonth && <span className="text-zinc-400 font-semibold">{dateInfo.dayMonth}</span>}
                                <span
                                  onClick={() => {
                                    if (dateInfo.yearInt) {
                                      navigate(`/explore?tab=years&year=${dateInfo.yearInt}&mediaType=${selectedMedia.media_type || 'movie'}`);
                                    }
                                  }}
                                  className="text-zinc-300 hover:text-purple-400 cursor-pointer transition-colors duration-200 underline decoration-purple-500/40 underline-offset-2 font-bold"
                                  title={`Browse ${dateInfo.year} in Explore`}
                                >
                                  {dateInfo.year}
                                </span>
                              </span>
                            );
                          })()}
                          {extraDetails?.runtime ? (
                            <span>• {formatRuntimeHM(extraDetails.runtime)}</span>
                          ) : null}
                          {extraDetails?.director && extraDetails.director !== 'Unknown' ? (
                            <span>• Dir. {extraDetails.director}</span>
                          ) : null}

                          <button
                            type="button"
                            onClick={() => setIsFavorite(!isFavorite)}
                            title={isFavorite ? "Favorited (Click to remove)" : "Mark as Favorite"}
                            aria-label={isFavorite ? "Favorited" : "Mark as Favorite"}
                            className={`p-2.5 sm:p-3 rounded-2xl border transition-all duration-200 ml-1.5 flex items-center justify-center active:scale-95 hover:scale-105 shadow-md group/like
                              ${isFavorite
                                ? 'text-red-500 bg-red-500/15 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                                : 'text-zinc-400 hover:text-red-400 bg-white/5 hover:bg-white/10 border-white/10'}`}
                          >
                            <Heart
                              size={26}
                              className="transition-transform duration-200 group-hover/like:scale-110"
                              fill={isFavorite ? "currentColor" : "none"}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Studio / Production company */}
                      {extraDetails?.studios && extraDetails.studios.length > 0 && (
                        <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none pt-1">
                          Studio: <span className="text-zinc-300 font-black italic">{extraDetails.studios.slice(0, 2).join('  /  ')}</span>
                        </div>
                      )}

                      {/* Minimalism Overview */}
                      {(activeSeason?.overview || extraDetails?.overview) && (
                        <div className="space-y-1.5">
                          <p className="text-[8px] font-black text-zinc-600 uppercase tracking-[0.3em]">Brief Overview</p>
                          <p className="text-xs md:text-sm text-zinc-400 leading-relaxed font-medium italic line-clamp-3">
                            "{activeSeason?.overview || extraDetails?.overview}"
                          </p>
                        </div>
                      )}

                      {/* Genre Badges */}
                      {extraDetails?.genres && extraDetails.genres.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1 justify-center md:justify-start">
                          {extraDetails.genres.slice(0, 3).map((g) => (
                            <span key={g} className="text-[8px] font-black uppercase tracking-widest text-[#9b5cff] bg-[#9b5cff]/5 border border-[#9b5cff]/10 px-2 py-0.5 rounded">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}

                      {selectedMedia.media_type === 'tv' && extraDetails?.seasons && extraDetails.seasons.length > 0 && (
                        <div className="pt-2">
                          <label className="block text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-2">Select Season</label>
                          <select
                            value={selectedSeason || ''}
                            onChange={(e) => setSelectedSeason(e.target.value ? Number(e.target.value) : null)}
                            className="w-full bg-zinc-950/80 border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors uppercase tracking-widest font-black"
                          >
                            <option value="">Whole Series</option>
                            {extraDetails.seasons.filter(s => s.season_number > 0).map((season) => (
                              <option key={season.id} value={season.season_number}>
                                {season.name} {season.episode_count ? `(${season.episode_count} Episodes)` : ''}
                              </option>
                            ))}
                          </select>

                          {activeSeason && (
                            <div className="mt-3 p-4 bg-white/2 rounded-2xl border border-white/5 space-y-2">
                              <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                                {activeSeason.episode_count && (
                                  <span className="flex items-center gap-1.5"><Layers size={11} /> {activeSeason.episode_count} Episodes</span>
                                )}
                                {activeSeason.air_date && (
                                  <span className="flex items-center gap-1.5"><Calendar size={11} /> {activeSeason.air_date.split('-')[0]}</span>
                                )}
                              </div>
                              {activeSeason.overview && (
                                <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">
                                  {activeSeason.overview}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <button
                          type="button"
                          onClick={() => setShowFolderSelector(true)}
                          className={`flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] px-4 py-4 rounded-xl border transition-all
                            ${addedStatus || containingLists.length > 0
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/12'
                              : 'bg-white/3 text-zinc-400 border-white/5 hover:text-white hover:bg-white/5'}`}
                        >
                          {addedStatus || containingLists.length > 0 ? <CheckCircle2 size={13} /> : <Bookmark size={13} />}
                          {addedStatus ? `Saved` : (containingLists.length > 0 ? `In List` : 'Add to List')}
                        </button>

                        <button
                          type="button"
                          onClick={() => setShowStreamModal(true)}
                          className="flex items-center justify-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] px-4 py-4 rounded-xl border border-[#9b5cff]/20 bg-[#9b5cff]/5 text-[#9b5cff] hover:bg-[#9b5cff]/10 transition-all shadow-xl italic"
                        >
                          <Play size={13} fill="currentColor" /> Stream Now
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-12">
                <div className="space-y-6">
                  <div className="flex items-center gap-3 px-2">
                    <Star size={14} className="text-[#9b5cff]" />
                    <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400">Quality Assessment</h3>
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 px-2">
                      <Calendar size={12} className="text-[#9b5cff]" /> Watch Date
                    </label>
                    <CustomDatePicker
                      value={date}
                      onChange={setDate}
                    />
                  </div>
                  <div className="space-y-3">
                     <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 px-2">
                      <Clock size={12} className="text-[#9b5cff]" /> Brief Notes
                    </label>
                    <textarea
                      placeholder="Capture your immediate mood..."
                      className="w-full bg-[#111] border border-white/5 rounded-2xl p-6 text-white min-h-[140px] focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all resize-none font-medium text-sm leading-relaxed"
                      value={review}
                      onChange={(e) => setReview(e.target.value)}
                    />
                  </div>
                </div>

                <motion.button
                  type="submit"
                  whileHover={{ y: -4 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={isSubmitting || !rating}
                  className={`w-full bg-white text-black font-black py-7 rounded-[2.5rem] text-lg transition-all shadow-2xl uppercase tracking-[0.3em] italic ${(isSubmitting || !rating) ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? 'Syncing...' : (!rating ? 'Select a Rating' : 'Sync to Diary')}
                </motion.button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

      <StreamSourcesModal
        isOpen={showStreamModal}
        onClose={() => setShowStreamModal(false)}
        media={selectedMedia!}
      />

      <AnimatePresence>
        {showInfoModal && (
          <div className="fixed inset-0 z-[2500] flex items-center justify-center p-4 md:p-6">
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
                  <h3
                    className="text-2xl md:text-3xl font-[900] text-white italic uppercase tracking-tighter leading-tight cursor-pointer hover:text-[#9b5cff] transition-all flex items-center gap-2 group/title"
                    title="Click to copy name"
                    onClick={() => {
                      const titleText = activeSeason ? `${selectedMedia?.title || selectedMedia?.name} - ${activeSeason.name}` : (selectedMedia?.title || selectedMedia?.name);
                      if (titleText) {
                        navigator.clipboard.writeText(titleText);
                        toast.success(`Copied: "${titleText}"`);
                      }
                    }}
                  >
                    <span>
                      {activeSeason ? `${selectedMedia?.title || selectedMedia?.name} - ${activeSeason.name}` : (selectedMedia?.title || selectedMedia?.name)}
                    </span>
                    <Copy size={16} className="opacity-0 group-hover/title:opacity-100 text-[#9b5cff] transition-opacity shrink-0 hidden sm:inline" />
                  </h3>
                  {extraDetails?.tagline && !activeSeason && <p className="text-purple-500 font-black uppercase tracking-[0.3em] text-[10px] italic">{extraDetails.tagline}</p>}
                  {extraDetails?.studios && extraDetails.studios.length > 0 && (
                    <p className="text-[10px] font-black text-purple-400 bg-purple-500/5 px-2.5 py-1 rounded-md border border-purple-500/10 inline-block uppercase tracking-[0.2em] mt-1.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[280px] sm:max-w-md">
                      {extraDetails.studios.slice(0, 3).join(' • ')}
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
                      <p className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">{activeSeason ? 'Episodes' : 'Runtime'}</p>
                      <div className="flex items-center gap-2 text-white">
                        {activeSeason ? <Layers size={14} className="text-zinc-500" /> : <Clock size={14} className="text-zinc-500" />}
                        <p className="text-xl font-black italic">{activeSeason ? activeSeason.episode_count : (extraDetails?.runtime ? formatRuntimeHM(extraDetails.runtime) : 'N/A')}</p>
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
                        <Calendar size={14} className="text-zinc-500 shrink-0" />
                        {(() => {
                          const releaseInfo = formatReleaseDate(
                            activeSeason?.air_date || selectedMedia?.release_date || selectedMedia?.first_air_date
                          );
                          if (!releaseInfo) {
                            return <p className="text-base sm:text-lg md:text-xl font-black italic text-zinc-500">N/A</p>;
                          }
                          return (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {releaseInfo.dayMonth ? (
                                <span className="text-base sm:text-lg md:text-xl font-black italic text-zinc-200">
                                  {releaseInfo.dayMonth}
                                </span>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => {
                                  if (releaseInfo.yearInt) {
                                    navigate(`/explore?tab=years&year=${releaseInfo.yearInt}&mediaType=${selectedMedia?.media_type || 'movie'}`);
                                  }
                                }}
                                className="text-base sm:text-lg md:text-xl font-black italic text-purple-400 hover:text-purple-300 underline underline-offset-4 decoration-purple-500/50 hover:decoration-purple-400 cursor-pointer transition-colors duration-200 focus:outline-none"
                                title={`Browse ${releaseInfo.year} in Explore`}
                              >
                                {releaseInfo.year}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.4em]">Narrative Scope</p>
                    <p className="text-sm md:text-base text-zinc-400 leading-relaxed font-medium italic">
                      {activeSeason?.overview || extraDetails?.overview || "No transmission data found for this record."}
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
                                 setShowInfoModal(false);
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
                                 setShowInfoModal(false);
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

                    {(!selectedMedia || selectedMedia.media_type !== 'tv' || (!extraDetails?.creators?.length && !extraDetails?.showrunners?.length)) && (
                      <div className="space-y-1">
                         <div className="flex items-center gap-2 text-zinc-700">
                            <Video size={12} />
                            <p className="text-[8px] font-black uppercase tracking-[0.3em]">Director</p>
                         </div>
                         {extraDetails?.directorId ? (
                           <button
                             onClick={() => {
                               setShowInfoModal(false);
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
                        {selectedMedia?.media_type === 'tv' ? 'Series Cast' : 'Movie Cast'}
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
                              onClick={() => scrollInfoCast('left')}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors active:scale-95 border border-white/5"
                              title="Scroll Left"
                              aria-label="Scroll cast left"
                            >
                              <ChevronLeft size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => scrollInfoCast('right')}
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
                        ref={infoCastScrollRef}
                        className="flex gap-3 overflow-x-auto no-scrollbar pb-2 pt-1 -mx-1 px-1 scroll-smooth"
                      >
                        {extraDetails.cast.map((member, idx) => (
                          <button
                            key={`${member.id}-${idx}`}
                            type="button"
                            onClick={() => {
                              setShowInfoModal(false);
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

              <div className="shrink-0 flex gap-4">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="flex-1 py-5 bg-white text-black rounded-[2rem] font-black text-[10px] uppercase tracking-[0.5em] italic shadow-2xl hover:bg-zinc-200 transition-colors"
                >
                  Dismiss View
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFolderSelector && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowFolderSelector(false)} className="absolute inset-0 bg-black/95 backdrop-blur-3xl" />
            <motion.div initial={{ opacity: 0, scale: 0.9, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 40 }} className="relative w-full max-w-md bg-[#09090b] rounded-[3rem] border border-white/5 p-8 shadow-2xl flex flex-col gap-6 max-h-[80vh]">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Save to Folder</h3>
                <button onClick={() => setShowFolderSelector(false)} className="p-2 text-zinc-500"><X size={20} /></button>
              </div>

              {!isCreatingFolder ? (
                <>
                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-2">
                    {watchLists.map(list => {
                      const isInList = list.items?.some(i => i.tmdbId === selectedMedia?.id);
                      return (
                        <button key={list.id} onClick={() => handleAddToExistingList(list)} className={`w-full p-5 rounded-2xl flex items-center justify-between transition-all border ${isInList ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-white/5 border-white/5 text-zinc-400 hover:text-white hover:bg-white/10'}`}>
                          <span className="font-bold text-xs uppercase tracking-widest">{list.name}</span>
                          {isInList ? <CheckCircle2 size={16} /> : <Plus size={16} />}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setIsCreatingFolder(true)} className="w-full py-5 bg-white/5 border border-dashed border-white/10 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                    <FolderPlus size={16} /> Create New Folder
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <input autoFocus placeholder="Folder name..." value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="w-full h-14 bg-[#111] border border-white/10 rounded-xl px-5 text-white font-bold outline-none" />
                  <div className="flex gap-2">
                    <button onClick={() => setIsCreatingFolder(false)} className="flex-1 py-4 bg-white/5 text-zinc-500 rounded-xl font-black text-[9px] uppercase tracking-widest">Cancel</button>
                    <button onClick={handleCreateAndAdd} className="flex-1 py-4 bg-[#9b5cff] text-white rounded-xl font-black text-[9px] uppercase tracking-widest">Create & Save</button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Fullscreen Poster Modal - Mounted via Portal to document.body */}
      {createPortal(
        <AnimatePresence>
          {fullscreenPosterData && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setFullscreenPosterData(null)}
              className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-4 md:p-8 cursor-zoom-out select-none"
            >
              {/* Top Right Close Button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenPosterData(null);
                }}
                className="absolute top-6 right-6 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-md transition-all active:scale-95 shadow-2xl z-50 cursor-pointer"
                title="Close Full Screen (Esc)"
                aria-label="Close Full Screen"
              >
                <X size={24} />
              </button>

              {/* Fullscreen Centered Poster */}
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
                className="relative flex items-center justify-center cursor-default max-h-[92vh] max-w-[90vw]"
              >
                <img
                  src={fullscreenPosterData.url}
                  onError={(e) => {
                    if (fullscreenPosterData.fallbackUrl && (e.target as HTMLImageElement).src !== fullscreenPosterData.fallbackUrl) {
                      (e.target as HTMLImageElement).src = fullscreenPosterData.fallbackUrl;
                    }
                  }}
                  alt={fullscreenPosterData.title}
                  referrerPolicy="no-referrer"
                  loading="eager"
                  decoding="async"
                  className={`max-h-[90vh] max-w-[90vw] md:max-h-[93vh] w-auto aspect-[2/3] object-contain rounded-2xl md:rounded-3xl shadow-[0_30px_90px_rgba(0,0,0,0.95)] ring-1 ring-white/15 select-none transition-all duration-300 ${blurPosters ? 'blur-2xl' : 'blur-0'}`}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* Search History Modal (Available on mobile & PC) */}
      <SearchHistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        history={recentSearches}
        onSelectSearch={handleSelectRecentSearch}
        onRemoveItem={handleRemoveRecentSearch}
        onClearAll={handleClearAllRecentSearches}
      />
    </div>
  );
};

export default AddEntry;
