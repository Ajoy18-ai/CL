
import { create } from 'zustand';
import { WatchEntry, User, WatchList, CustomList, WatchListItem, RecentSearchItem, PinnedTalent } from '../types';
import * as api from '../services/api';

interface WatchPulseState {
  entries: WatchEntry[];
  watchLists: WatchList[];
  customLists: CustomList[];
  blockedIds: number[];
  recentSearches: RecentSearchItem[];
  pinnedTalents: PinnedTalent[];
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isCloudConnected: boolean;
  sortOrder: 'desc' | 'asc';
  blurPosters: boolean;
  isPosterModalOpen: boolean;

  setSortOrder: (order: 'desc' | 'asc') => void;
  toggleBlurPosters: () => void;
  setIsPosterModalOpen: (open: boolean) => void;
  refreshEntries: () => Promise<void>;
  addEntry: (entry: Omit<WatchEntry, 'id' | 'createdAt'>) => Promise<void>;
  updateEntry: (entry: WatchEntry) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  blockMediaId: (tmdbId: number) => Promise<void>;

  refreshWatchLists: () => Promise<void>;
  addWatchList: (name: string, items?: WatchListItem[]) => Promise<void>;
  updateWatchList: (id: string, data: Partial<WatchList>) => Promise<void>;
  removeWatchList: (id: string) => Promise<void>;

  refreshCustomLists: () => Promise<void>;
  addCustomList: (name: string, items?: WatchListItem[]) => Promise<void>;
  updateCustomList: (id: string, data: Partial<CustomList>) => Promise<void>;
  removeCustomList: (id: string) => Promise<void>;

  refreshRecentSearches: () => Promise<void>;
  addRecentSearch: (item: string | Partial<RecentSearchItem>) => Promise<void>;
  removeRecentSearch: (id: string) => Promise<void>;
  clearRecentSearches: () => Promise<void>;

  refreshPinnedTalents: () => Promise<void>;
  togglePinTalent: (talent: { id: number | string; name?: string; image?: string; subtitle?: string; type?: 'person' | 'company' }) => Promise<void>;
  removePinnedTalent: (id: number | string) => Promise<void>;
  clearPinnedTalents: () => Promise<void>;
  isTalentPinned: (id: number | string | undefined | null) => boolean;

  setLoading: (loading: boolean) => void;
  clearError: () => void;
  migrateLegacyData: () => void;
  initListeners: () => (() => void);
}

const LOCAL_STORAGE_ENTRIES_KEY = 'cinelog_local_entries';
const LOCAL_STORAGE_LISTS_KEY = 'cinelog_local_lists';
const LOCAL_STORAGE_CUSTOM_LISTS_KEY = 'cinelog_custom_lists';
const LOCAL_STORAGE_BLOCKLIST_KEY = 'cinelog_blocked_ids';
const LOCAL_STORAGE_SEARCH_HISTORY_KEY = 'cinelog_recent_searches';
const LOCAL_STORAGE_PINNED_TALENTS_KEY = 'cinelog_pinned_talents';
const SORT_ORDER_KEY = 'cinelog_sort_order';
const LOCAL_STORAGE_BLUR_KEY = 'cinelog_blur_posters';

const getLocalData = <T>(key: string): T[] => {
  try {
    const data = localStorage.getItem(key);
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean).map((item: any) => {
      if (item && typeof item === 'object' && Array.isArray(item.items)) {
        return { ...item, items: item.items.filter(Boolean) };
      }
      return item;
    });
  } catch (e) {
    return [];
  }
};

const safeClone = <T>(obj: T, seen = new WeakSet()): T => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (seen.has(obj as object)) {
    return undefined as any;
  }
  seen.add(obj as object);

  if (Array.isArray(obj)) {
    const arrCopy = obj.map(item => safeClone(item, seen)).filter(item => item !== undefined);
    return arrCopy as unknown as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }

  if (typeof (obj as any).toJSON === 'function' && !(obj instanceof Element)) {
    try {
      return safeClone((obj as any).toJSON(), seen);
    } catch (e) {}
  }

  const copy = {} as any;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key.startsWith('_') || key === 'firestore' || key === 'db' || key === '_firestore' || key === 'window') {
        continue;
      }
      try {
        const val = safeClone(obj[key], seen);
        if (val !== undefined) {
          copy[key] = val;
        }
      } catch (e) {}
    }
  }
  return copy as T;
};

const setLocalData = <T>(key: string, data: T[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(safeClone(data)));
  } catch (e) {
    try {
      // Clear non-essential cached keys to reclaim storage
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('cinelog_credits_cache_') || k.startsWith('credits_') || k.startsWith('cache_'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => {
        try {
          localStorage.removeItem(k);
        } catch (err) {}
      });
      localStorage.setItem(key, JSON.stringify(safeClone(data)));
    } catch (retryErr) {
      console.warn(`Local storage quota reached while writing ${key}:`, retryErr);
    }
  }
};

export const useStore = create<WatchPulseState>((set, get) => ({
  entries: getLocalData<WatchEntry>(LOCAL_STORAGE_ENTRIES_KEY),
  watchLists: getLocalData<WatchList>(LOCAL_STORAGE_LISTS_KEY),
  customLists: getLocalData<CustomList>(LOCAL_STORAGE_CUSTOM_LISTS_KEY),
  blockedIds: getLocalData<number>(LOCAL_STORAGE_BLOCKLIST_KEY),
  recentSearches: getLocalData<RecentSearchItem>(LOCAL_STORAGE_SEARCH_HISTORY_KEY),
  pinnedTalents: getLocalData<PinnedTalent>(LOCAL_STORAGE_PINNED_TALENTS_KEY),
  sortOrder: (localStorage.getItem(SORT_ORDER_KEY) as 'desc' | 'asc') || 'desc',
  blurPosters: localStorage.getItem(LOCAL_STORAGE_BLUR_KEY) === 'true',
  user: { id: '1', email: 'user@watchpulse.com', themePreference: 'dark' },
  isLoading: false,
  error: null,
  isCloudConnected: true,
  isPosterModalOpen: false,

  setSortOrder: (order) => {
    localStorage.setItem(SORT_ORDER_KEY, order);
    set({ sortOrder: order });
  },

  toggleBlurPosters: () => {
    const newValue = !get().blurPosters;
    localStorage.setItem(LOCAL_STORAGE_BLUR_KEY, String(newValue));
    set({ blurPosters: newValue });
  },

  setIsPosterModalOpen: (open: boolean) => {
    if (typeof document !== 'undefined') {
      if (open) {
        document.body.classList.add('poster-modal-active');
      } else {
        document.body.classList.remove('poster-modal-active');
      }
    }
    set({ isPosterModalOpen: open });
  },

  migrateLegacyData: () => {
    const LEGACY_KEYS = ['entries', 'watchpulse_entries', 'cinelog_entries', 'watchpulse_local_entries', 'watchpulse_data'];
    const currentEntries = [...get().entries];
    let migratedEntries: WatchEntry[] = [...currentEntries];
    let hasChanges = false;

    LEGACY_KEYS.forEach(key => {
      const oldData = getLocalData<any>(key);
      if (oldData && oldData.length > 0) {
        oldData.forEach((oldEntry: any) => {
          if (!oldEntry) return;
          const normalized: WatchEntry = {
            ...oldEntry,
            id: oldEntry.id || `migrated-${Date.now()}-${Math.random()}`,
            year: (oldEntry.datePrecision === 'unknown' || oldEntry.watchDate === '0000-00-00' || oldEntry.year === 0)
              ? 0
              : (oldEntry.year || new Date(oldEntry.watchDate || Date.now()).getFullYear()),
            genres: oldEntry.genres || [],
            runtime: oldEntry.runtime || 120,
            createdAt: oldEntry.createdAt || oldEntry.watchDate || new Date().toISOString()
          };
          const exists = migratedEntries.some(e => e && ((e.id === normalized.id) || (e.tmdbId === normalized.tmdbId && e.watchDate === normalized.watchDate)));
          if (!exists) {
            migratedEntries.push(normalized);
            hasChanges = true;
          }
        });
      }
    });

    if (hasChanges) {
      set({ entries: migratedEntries });
      setLocalData(LOCAL_STORAGE_ENTRIES_KEY, migratedEntries);
    }
  },

  refreshEntries: async () => {
    set({ isLoading: true });
    try {
      const cloudEntries = await api.getEntries();
      const currentEntries = (get().entries || []).filter(Boolean);

      if (cloudEntries && cloudEntries.length >= 0) {
        // Merge strategy: Keep local-only entries (those starting with 'local-')
        // that are not yet in the cloud.
        const localOnly = currentEntries.filter(e => e && e.id && e.id.startsWith('local-'));
        const merged = [...cloudEntries.filter(Boolean)];

        localOnly.forEach(local => {
          if (local && !merged.some(m => m && m.tmdbId === local.tmdbId && m.watchDate === local.watchDate)) {
            merged.push(local);
          }
        });

        // Sort merged entries safely with unknown date support
        merged.sort((a, b) => {
          if (!a || !b) return 0;
          const getTime = (e: WatchEntry) => {
            if (e.watchDate && e.watchDate !== '0000-00-00') {
              const t = new Date(e.watchDate).getTime();
              if (!isNaN(t) && t > 0) return t;
            }
            return 0;
          };
          const dateA = getTime(a);
          const dateB = getTime(b);
          if (dateB !== dateA) return dateB - dateA;
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        });

        setLocalData(LOCAL_STORAGE_ENTRIES_KEY, merged);
        set({ entries: merged, isCloudConnected: true });
      } else {
        set({ isCloudConnected: true });
      }
    } catch (e: any) {
      set({ isCloudConnected: false });
    } finally {
      set({ isLoading: false });
    }
  },

  addEntry: async (entry) => {
    const creationTime = new Date().toISOString();
    const tempId = 'local-' + Date.now();
    const entryWithId = { ...entry, id: tempId, createdAt: creationTime } as WatchEntry;
    const newEntries = [entryWithId, ...get().entries];
    set({ entries: newEntries });
    setLocalData(LOCAL_STORAGE_ENTRIES_KEY, newEntries);
    try {
      await api.saveEntry(safeClone({ ...entry, createdAt: creationTime }));
    } catch (e) {}
  },

  updateEntry: async (entry) => {
    const updatedEntries = get().entries.map(e => (e && e.id === entry.id) ? entry : e).filter(Boolean);
    set({ entries: updatedEntries });
    setLocalData(LOCAL_STORAGE_ENTRIES_KEY, updatedEntries);
    try {
      await api.updateEntry(safeClone(entry));
    } catch (e) {}
  },

  removeEntry: async (id) => {
    const filtered = (get().entries || []).filter(e => e && e.id !== id);
    set({ entries: filtered });
    setLocalData(LOCAL_STORAGE_ENTRIES_KEY, filtered);
    try {
      await api.deleteEntry(id);
    } catch (e) {}
  },

  blockMediaId: async (tmdbId: number) => {
    const currentBlocks = get().blockedIds || [];
    if (!currentBlocks.includes(tmdbId)) {
      const newBlocks = [...currentBlocks, tmdbId];
      set({ blockedIds: newBlocks });
      setLocalData(LOCAL_STORAGE_BLOCKLIST_KEY, newBlocks);
    }
    const matchingEntries = (get().entries || []).filter(e => e && e.tmdbId === tmdbId);
    for (const entry of matchingEntries) {
      if (entry && entry.id) {
        await get().removeEntry(entry.id);
      }
    }
  },

  refreshWatchLists: async () => {
    try {
      const cloudLists = await api.getWatchLists();
      if (cloudLists && cloudLists.length >= 0) {
        const currentLists = (get().watchLists || []).filter(Boolean);
        const localOnly = currentLists.filter(l => l && l.id && l.id.startsWith('local-'));

        // Merge cloud lists with local-only ones
        const merged = [...cloudLists.filter(Boolean)];
        localOnly.forEach(local => {
          if (local && !merged.some(m => m && m.id === local.id)) {
            merged.push(local);
          }
        });

        setLocalData(LOCAL_STORAGE_LISTS_KEY, merged);
        set({ watchLists: merged, isCloudConnected: true });
      }
    } catch (e) {}
  },

  addWatchList: async (name, items = []) => {
    const newList: WatchList = { id: 'local-list-' + Date.now(), name, items };
    const updatedLists = [newList, ...get().watchLists];
    set({ watchLists: updatedLists });
    setLocalData(LOCAL_STORAGE_LISTS_KEY, updatedLists);
    try {
      const realId = await api.saveWatchList(safeClone({ name, items }));
      if (realId && !realId.startsWith('local-')) {
        const listsWithRealId = get().watchLists.map(l => l.id === newList.id ? { ...l, id: realId } : l);
        set({ watchLists: listsWithRealId });
        setLocalData(LOCAL_STORAGE_LISTS_KEY, listsWithRealId);
      }
    } catch (e) {}
  },

  updateWatchList: async (id, data) => {
    const updated = get().watchLists.map(l => l.id === id ? { ...l, ...data } : l);
    set({ watchLists: updated });
    setLocalData(LOCAL_STORAGE_LISTS_KEY, updated);
    try {
      await api.updateWatchList(id, safeClone(data));
    } catch (e) {}
  },

  removeWatchList: async (id) => {
    const filtered = get().watchLists.filter(l => l.id !== id);
    set({ watchLists: filtered });
    setLocalData(LOCAL_STORAGE_LISTS_KEY, filtered);
    try {
      await api.removeWatchList(id);
    } catch (e) {}
  },

  refreshCustomLists: async () => {
    try {
      const cloudLists = await api.getCustomLists();
      if (cloudLists && cloudLists.length >= 0) {
        const currentLists = get().customLists;
        const localOnly = currentLists.filter(l => l.id.startsWith('local-'));

        const merged = [...cloudLists];
        localOnly.forEach(local => {
          if (!merged.some(m => m.id === local.id)) {
            merged.push(local);
          }
        });

        setLocalData(LOCAL_STORAGE_CUSTOM_LISTS_KEY, merged);
        set({ customLists: merged, isCloudConnected: true });
      }
    } catch (e) {}
  },

  addCustomList: async (name, items = []) => {
    const newList: CustomList = { id: 'local-custom-' + Date.now(), name, items, createdAt: new Date().toISOString() };
    const updatedLists = [newList, ...get().customLists];
    set({ customLists: updatedLists });
    setLocalData(LOCAL_STORAGE_CUSTOM_LISTS_KEY, updatedLists);
    try {
      const realId = await api.saveCustomList(safeClone({ name, items }));
      if (realId && !realId.startsWith('local-')) {
        const listsWithRealId = get().customLists.map(l => l.id === newList.id ? { ...l, id: realId } : l);
        set({ customLists: listsWithRealId });
        setLocalData(LOCAL_STORAGE_CUSTOM_LISTS_KEY, listsWithRealId);
      }
    } catch (e) {}
  },

  updateCustomList: async (id, data) => {
    const updated = (get().customLists || []).map(l => (l && l.id === id) ? { ...l, ...data } : l).filter(Boolean);
    set({ customLists: updated });
    setLocalData(LOCAL_STORAGE_CUSTOM_LISTS_KEY, updated);
    try {
      await api.updateCustomList(id, safeClone(data));
    } catch (e) {}
  },

  removeCustomList: async (id) => {
    const filtered = (get().customLists || []).filter(l => l && l.id !== id);
    set({ customLists: filtered });
    setLocalData(LOCAL_STORAGE_CUSTOM_LISTS_KEY, filtered);
    try {
      await api.removeCustomList(id);
    } catch (e) {}
  },

  refreshRecentSearches: async () => {
    try {
      const cloudSearches = await api.getRecentSearches();
      if (cloudSearches && cloudSearches.length >= 0) {
        const current = get().recentSearches || [];
        const map = new Map<string, RecentSearchItem>();
        [...cloudSearches, ...current].forEach(item => {
          if (!item || !item.query) return;
          const key = (item.id || item.query).toLowerCase();
          if (!map.has(key) || (item.timestamp > (map.get(key)?.timestamp || 0))) {
            map.set(key, item);
          }
        });
        const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 40);
        setLocalData(LOCAL_STORAGE_SEARCH_HISTORY_KEY, merged);
        set({ recentSearches: merged });
        window.dispatchEvent(new CustomEvent('cinelog:search-history-updated'));
      }
    } catch (e) {}
  },

  addRecentSearch: async (itemOrQuery) => {
    const query = typeof itemOrQuery === 'string' ? itemOrQuery.trim() : (itemOrQuery.query || '').trim();
    if (query.length <= 1) return;

    const current = get().recentSearches || [];
    const type = typeof itemOrQuery === 'object' ? itemOrQuery.type : undefined;
    const entityId = typeof itemOrQuery === 'object' ? itemOrQuery.entityId : undefined;

    const filtered = current.filter(existing => {
      if (entityId && existing.entityId && existing.type === type && existing.entityId === entityId) {
        return false;
      }
      return existing.query.toLowerCase() !== query.toLowerCase();
    });

    const isObj = typeof itemOrQuery === 'object' && itemOrQuery !== null;
    const obj = isObj ? (itemOrQuery as Partial<RecentSearchItem>) : null;

    const newItem: RecentSearchItem = {
      id: obj?.id || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      query,
      timestamp: Date.now(),
      type: obj?.type || 'query',
      title: obj?.title || query,
      posterPath: obj?.posterPath,
      image: obj?.image,
      year: obj?.year,
      subtitle: obj?.subtitle,
      entityId: obj?.entityId
    };

    const updated = [newItem, ...filtered].slice(0, 40);
    set({ recentSearches: updated });
    setLocalData(LOCAL_STORAGE_SEARCH_HISTORY_KEY, updated);
    window.dispatchEvent(new CustomEvent('cinelog:search-history-updated'));
    try {
      await api.saveRecentSearch(safeClone(newItem));
    } catch (e) {}
  },

  removeRecentSearch: async (id) => {
    const current = get().recentSearches || [];
    const updated = current.filter(item => item.id !== id && item.query.toLowerCase() !== id.toLowerCase());
    set({ recentSearches: updated });
    setLocalData(LOCAL_STORAGE_SEARCH_HISTORY_KEY, updated);
    window.dispatchEvent(new CustomEvent('cinelog:search-history-updated'));
    try {
      await api.removeRecentSearch(id);
    } catch (e) {}
  },

  clearRecentSearches: async () => {
    set({ recentSearches: [] });
    setLocalData(LOCAL_STORAGE_SEARCH_HISTORY_KEY, []);
    window.dispatchEvent(new CustomEvent('cinelog:search-history-updated'));
    try {
      await api.clearRecentSearches();
    } catch (e) {}
  },

  refreshPinnedTalents: async () => {
    try {
      const cloudTalents = await api.getPinnedTalents();
      if (cloudTalents && cloudTalents.length >= 0) {
        const current = get().pinnedTalents || [];
        const map = new Map<number, PinnedTalent>();
        [...cloudTalents, ...current].forEach(item => {
          if (!item || !item.id) return;
          const id = Number(item.id);
          if (!isNaN(id)) {
            if (!map.has(id) || ((item.pinnedAt || 0) > (map.get(id)?.pinnedAt || 0))) {
              map.set(id, { ...item, id });
            }
          }
        });
        const merged = Array.from(map.values()).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
        setLocalData(LOCAL_STORAGE_PINNED_TALENTS_KEY, merged);
        set({ pinnedTalents: merged });
      }
    } catch (e) {}
  },

  togglePinTalent: async (talent) => {
    const talentId = typeof talent.id === 'string' ? parseInt(talent.id, 10) : talent.id;
    if (!talentId || isNaN(talentId)) return;

    const current = (get().pinnedTalents || []).filter(Boolean);
    const isPinned = current.some(t => t && t.id === talentId);

    if (isPinned) {
      const updated = current.filter(t => t && t.id !== talentId);
      set({ pinnedTalents: updated });
      setLocalData(LOCAL_STORAGE_PINNED_TALENTS_KEY, updated);
      try {
        await api.removePinnedTalent(talentId);
      } catch (e) {}
    } else {
      const newPin: PinnedTalent = {
        id: talentId,
        name: talent.name || 'Talent',
        image: talent.image,
        type: 'person',
        subtitle: talent.subtitle || 'CREATIVE',
        pinnedAt: Date.now()
      };
      const updated = [newPin, ...current.filter(t => t && t.id !== talentId)];
      set({ pinnedTalents: updated });
      setLocalData(LOCAL_STORAGE_PINNED_TALENTS_KEY, updated);
      try {
        await api.savePinnedTalent(safeClone(newPin));
      } catch (e) {}
    }
  },

  removePinnedTalent: async (id) => {
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    const current = (get().pinnedTalents || []).filter(Boolean);
    const updated = current.filter(t => t && t.id !== numId);
    set({ pinnedTalents: updated });
    setLocalData(LOCAL_STORAGE_PINNED_TALENTS_KEY, updated);
    try {
      await api.removePinnedTalent(numId);
    } catch (e) {}
  },

  clearPinnedTalents: async () => {
    set({ pinnedTalents: [] });
    setLocalData(LOCAL_STORAGE_PINNED_TALENTS_KEY, []);
    try {
      await api.clearPinnedTalents();
    } catch (e) {}
  },

  isTalentPinned: (id) => {
    if (!id) return false;
    const numId = typeof id === 'string' ? parseInt(id, 10) : id;
    if (isNaN(numId)) return false;
    return (get().pinnedTalents || []).filter(Boolean).some(t => t && t.id === numId);
  },

  setLoading: (loading) => set({ isLoading: loading }),
  clearError: () => set({ error: null }),

  initListeners: () => {
    const unsubEntries = api.subscribeToEntries((cloudEntries = []) => {
      const currentEntries = (get().entries || []).filter(Boolean);
      const localOnly = currentEntries.filter(e => e && e.id && e.id.startsWith('local-'));
      const merged = [...(cloudEntries || []).filter(Boolean)];

      localOnly.forEach(local => {
        if (local && !merged.some(m => m && m.tmdbId === local.tmdbId && m.watchDate === local.watchDate)) {
          merged.push(local);
        }
      });

      merged.sort((a, b) => {
        if (!a || !b) return 0;
        const dateA = new Date(a.watchDate || 0).getTime();
        const dateB = new Date(b.watchDate || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      setLocalData(LOCAL_STORAGE_ENTRIES_KEY, merged);
      set({ entries: merged, isCloudConnected: true });
    });

    const unsubWatchLists = api.subscribeToWatchLists((cloudLists = []) => {
      const currentLists = (get().watchLists || []).filter(Boolean);
      const localOnly = currentLists.filter(l => l && l.id && l.id.startsWith('local-'));
      const merged = [...(cloudLists || []).filter(Boolean)];
      localOnly.forEach(local => {
        if (local && !merged.some(m => m && m.id === local.id)) {
          merged.push(local);
        }
      });
      setLocalData(LOCAL_STORAGE_LISTS_KEY, merged);
      set({ watchLists: merged, isCloudConnected: true });
    });

    const unsubCustomLists = api.subscribeToCustomLists((cloudLists = []) => {
      const currentLists = (get().customLists || []).filter(Boolean);
      const localOnly = currentLists.filter(l => l && l.id && l.id.startsWith('local-'));
      const merged = [...(cloudLists || []).filter(Boolean)];
      localOnly.forEach(local => {
        if (local && !merged.some(m => m && m.id === local.id)) {
          merged.push(local);
        }
      });
      setLocalData(LOCAL_STORAGE_CUSTOM_LISTS_KEY, merged);
      set({ customLists: merged, isCloudConnected: true });
    });

    const unsubRecentSearches = api.subscribeToRecentSearches((cloudSearches = []) => {
      if (!Array.isArray(cloudSearches)) return;
      const current = get().recentSearches || [];
      const map = new Map<string, RecentSearchItem>();
      [...cloudSearches, ...current].forEach(item => {
        if (!item || !item.query) return;
        const key = (item.id || item.query).toLowerCase();
        if (!map.has(key) || (item.timestamp > (map.get(key)?.timestamp || 0))) {
          map.set(key, item);
        }
      });
      const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 40);
      setLocalData(LOCAL_STORAGE_SEARCH_HISTORY_KEY, merged);
      set({ recentSearches: merged });
      window.dispatchEvent(new CustomEvent('cinelog:search-history-updated'));
    });

    const unsubPinnedTalents = api.subscribeToPinnedTalents((cloudTalents = []) => {
      if (!Array.isArray(cloudTalents)) return;
      const current = get().pinnedTalents || [];
      const map = new Map<number, PinnedTalent>();
      [...cloudTalents, ...current].forEach(item => {
        if (!item || !item.id) return;
        const id = Number(item.id);
        if (!isNaN(id)) {
          if (!map.has(id) || ((item.pinnedAt || 0) > (map.get(id)?.pinnedAt || 0))) {
            map.set(id, { ...item, id });
          }
        }
      });
      const merged = Array.from(map.values()).sort((a, b) => (b.pinnedAt || 0) - (a.pinnedAt || 0));
      setLocalData(LOCAL_STORAGE_PINNED_TALENTS_KEY, merged);
      set({ pinnedTalents: merged });
    });

    return () => {
      unsubEntries();
      unsubWatchLists();
      unsubCustomLists();
      unsubRecentSearches();
      unsubPinnedTalents();
    };
  }
}));
