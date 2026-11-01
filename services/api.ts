
import { TMDB_KEY, TMDB_BASE_URL, TMDB_IMAGE_BASE } from '../constants';
import { TMDBResult, WatchEntry, Rating, WatchList, CustomList, RecentSearchItem, PinnedTalent } from '../types';

declare global {
  interface Window {
    db: any;
    addMovie: (movie: any) => Promise<string>;
    loadMovies: () => Promise<any[]>;
    removeMovie: (id: string) => Promise<void>;
    updateMovie: (id: string, movie: Partial<WatchEntry>) => Promise<void>;
    loadWatchLists: () => Promise<any[]>;
    saveWatchList: (list: Partial<WatchList>) => Promise<string>;
    updateWatchList: (id: string, data: Partial<WatchList>) => Promise<void>;
    removeWatchList: (id: string) => Promise<void>;
    loadCustomLists: () => Promise<any[]>;
    saveCustomList: (list: Partial<CustomList>) => Promise<string>;
    updateCustomList: (id: string, data: Partial<CustomList>) => Promise<void>;
    removeCustomList: (id: string) => Promise<void>;
    subscribeToEntries: (callback: (entries: any[]) => void) => () => void;
    subscribeToWatchLists: (callback: (lists: any[]) => void) => () => void;
    subscribeToCustomLists: (callback: (lists: any[]) => void) => () => void;

    loadRecentSearches?: () => Promise<any[]>;
    saveRecentSearch?: (item: any) => Promise<string>;
    removeRecentSearch?: (id: string) => Promise<void>;
    clearRecentSearches?: () => Promise<void>;
    subscribeToRecentSearches?: (callback: (searches: any[]) => void) => () => void;

    loadPinnedTalents?: () => Promise<any[]>;
    savePinnedTalent?: (talent: any) => Promise<string>;
    removePinnedTalent?: (id: string) => Promise<void>;
    clearPinnedTalents?: () => Promise<void>;
    subscribeToPinnedTalents?: (callback: (talents: any[]) => void) => () => void;
  }
}

// Internal helper to get blocklist from localStorage
const getBlockedIds = (): number[] => {
  try {
    const data = localStorage.getItem('cinelog_blocked_ids');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

// Helper to recursively remove undefined values and strip circular references for Firebase safely
const clean = (obj: any, seen = new WeakSet()): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (seen.has(obj)) return undefined;
  seen.add(obj);

  if (Array.isArray(obj)) {
    return obj.map(item => clean(item, seen)).filter(item => item !== undefined);
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (typeof obj.toJSON === 'function' && !(obj instanceof Element)) {
    try {
      return clean(obj.toJSON(), seen);
    } catch (e) {}
  }

  const copy: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (key === 'firestore' || key === 'db' || key === '_firestore' || key === 'window') {
        continue;
      }
      try {
        const val = clean(obj[key], seen);
        if (val !== undefined) {
          copy[key] = val;
        }
      } catch (e) {}
    }
  }
  return copy;
};

export class APIError extends Error {
  status?: number;
  url?: string;
  data?: any;

  constructor(message: string, status?: number, url?: string, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.url = url;
    this.data = data;
  }
}

// Global concurrency limiter and rate-smoother for external TMDB API requests
class RequestQueue {
  private activeCount = 0;
  private maxConcurrent = 4;
  private queue: (() => void)[] = [];

  async schedule<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) {
          // Add a short breather between requests to smooth out bursts and prevent 429s
          setTimeout(next, 35);
        }
      }
    }
  }
}

const tmdbRequestQueue = new RequestQueue();

async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, backoff = 1000): Promise<any> {
  return tmdbRequestQueue.schedule(async () => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        // Handle 429 Rate Limits and 5xx Server Errors with exponential backoff + jitter
        if ((response.status === 429 || response.status >= 500) && retries > 0) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const delay = retryAfterHeader
            ? Math.max(1000, parseInt(retryAfterHeader, 10) * 1000)
            : (response.status === 429 ? Math.max(1200, backoff * 1.5) : backoff);

          const jitter = Math.floor(Math.random() * 400);
          await new Promise(resolve => setTimeout(resolve, delay + jitter));
          return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }

        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          // Ignore JSON parse error
        }

        let errorMessage = `Request failed with status ${response.status}`;
        if (errorData?.status_message) errorMessage = errorData.status_message;
        else if (errorData?.message) errorMessage = errorData.message;
        else if (response.status === 401) errorMessage = "Invalid API Key.";
        else if (response.status === 404) errorMessage = "Media not found.";
        else if (response.status === 429) errorMessage = "Rate limit exceeded.";

        throw new APIError(errorMessage, response.status, url, errorData);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof APIError) {
        if (error.status === 429 && retries > 0) {
          await new Promise(resolve => setTimeout(resolve, backoff + Math.floor(Math.random() * 300)));
          return fetchWithRetry(url, options, retries - 1, backoff * 2);
        }
        throw error;
      }
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw new APIError(
        error instanceof Error ? error.message : "Network error occurred.",
        undefined,
        url
      );
    }
  });
}

interface CacheEntry<T> {
  data: T;
  expiry: number;
}

class QueryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private pending = new Map<string, Promise<any>>();

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlMs,
    });
  }

  async fetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const existingPromise = this.pending.get(key);
    if (existingPromise) {
      return existingPromise as Promise<T>;
    }

    const promise = fetcher().then((data) => {
      this.set(key, data, ttlMs);
      this.pending.delete(key);
      return data;
    }).catch((err) => {
      this.pending.delete(key);
      throw err;
    });

    this.pending.set(key, promise);
    return promise;
  }
}

export const apiCache = new QueryCache();

export const getMediaById = async (id: number, type: 'movie' | 'tv'): Promise<TMDBResult> => {
  const cacheKey = `media_by_id_${type}_${id}`;
  return apiCache.fetch(cacheKey, async () => {
    const data = await fetchWithRetry(
      `${TMDB_BASE_URL}/${type}/${id}?api_key=${TMDB_KEY}&language=en-US&include_adult=true`
    );
    return {
      id: data.id,
      title: data.title || data.original_title,
      name: data.name || data.original_name,
      poster_path: data.poster_path,
      media_type: type,
      release_date: data.release_date,
      first_air_date: data.first_air_date,
      genre_ids: data.genres?.map((g: any) => g.id) || []
    };
  }, 3600000); // Cache for 1 hour
};

export const getCollectionDetails = async (collectionId: number) => {
  const cacheKey = `collection_${collectionId}`;
  return apiCache.fetch(cacheKey, async () => {
    const data = await fetchWithRetry(
      `${TMDB_BASE_URL}/collection/${collectionId}?api_key=${TMDB_KEY}&language=en-US`
    );
    return data;
  }, 3600000); // Cache for 1 hour
};

export const searchTMDB = async (rawQuery: string, page: number = 1): Promise<TMDBResult[]> => {
  if (!rawQuery) return [];
  const cleanQuery = rawQuery.trim().replace(/\s+/g, ' ');
  if (!cleanQuery) return [];

  const cacheKey = `search_${encodeURIComponent(cleanQuery)}_page_${page}`;
  return apiCache.fetch(cacheKey, async () => {
    const blocklist = getBlockedIds();

    // 1. Primary multi-search with include_adult=true (includes all international & mature cinema)
    const primaryUrl = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(cleanQuery)}&page=${page}&include_adult=true`;
    const primaryData = await fetchWithRetry(primaryUrl);
    let results = (primaryData.results || [])
      .filter((r: any) => (r.media_type === 'movie' || r.media_type === 'tv') && !blocklist.includes(r.id));

    // 2. On first page: if 0 results or query has obvious typos/redundancies, attempt smart fallbacks
    if (page === 1 && results.length === 0 && cleanQuery.length >= 3) {
      const candidates: string[] = [];

      // De-duplicate repeated adjacent words (e.g. "the The Voyeur" -> "The Voyeur")
      const dedupWords = cleanQuery.replace(/\b(\w+)\s+\1\b/gi, '$1');
      if (dedupWords.toLowerCase() !== cleanQuery.toLowerCase()) {
        candidates.push(dedupWords);
      }

      // Try removing leading "the " (e.g. "The Voyeur" -> "Voyeur")
      const withoutThe = cleanQuery.replace(/^the\s+/i, '');
      if (withoutThe.toLowerCase() !== cleanQuery.toLowerCase()) {
        candidates.push(withoutThe);
      }

      // Try single-character vowel deletion for common phonetic/typo queries (e.g. "paparika" -> "paprika")
      if (cleanQuery.length >= 5 && cleanQuery.length <= 25) {
        for (let i = 1; i < cleanQuery.length - 1; i++) {
          const char = cleanQuery[i].toLowerCase();
          if (['a', 'e', 'i', 'o', 'u', cleanQuery[i - 1].toLowerCase()].includes(char)) {
            const candidate = cleanQuery.slice(0, i) + cleanQuery.slice(i + 1);
            if (!candidates.includes(candidate)) {
              candidates.push(candidate);
            }
          }
        }
      }

      for (const candidate of candidates) {
        try {
          const fallbackUrl = `${TMDB_BASE_URL}/search/multi?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(candidate)}&page=1&include_adult=true`;
          const fallbackData = await fetchWithRetry(fallbackUrl);
          const fallbackResults = (fallbackData.results || [])
            .filter((r: any) => (r.media_type === 'movie' || r.media_type === 'tv') && !blocklist.includes(r.id));
          if (fallbackResults.length > 0) {
            results = fallbackResults;
            break;
          }
        } catch (e) {
          // Continue to next candidate
        }
      }
    }

    return results;
  }, 300000); // Cache for 5 minutes
};

export const getTrending = async (page: number = 1, type: 'movie' | 'tv' | 'all' = 'all', language: string = 'all'): Promise<TMDBResult[]> => {
  const cacheKey = `trending_${type}_lang_${language}_page_${page}`;
  return apiCache.fetch(cacheKey, async () => {
    let data;
    if (language === 'all') {
      const endpoint = type === 'all' ? 'all' : type;
      data = await fetchWithRetry(
        `${TMDB_BASE_URL}/trending/${endpoint}/day?api_key=${TMDB_KEY}&language=en-US&page=${page}&include_adult=true`
      );
    } else {
      if (type === 'all') {
        const [movieRes, tvRes] = await Promise.all([
          fetchWithRetry(`${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&page=${page}&sort_by=popularity.desc&with_original_language=${language}&include_adult=true`),
          fetchWithRetry(`${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_KEY}&language=en-US&page=${page}&sort_by=popularity.desc&with_original_language=${language}&include_adult=true`)
        ]);
        const movies = (movieRes.results || []).map((r: any) => ({ ...r, media_type: 'movie' }));
        const tv = (tvRes.results || []).map((r: any) => ({ ...r, media_type: 'tv' }));
        data = { results: [...movies, ...tv].sort((a, b) => (b.popularity || 0) - (a.popularity || 0)) };
      } else {
        data = await fetchWithRetry(
          `${TMDB_BASE_URL}/discover/${type}?api_key=${TMDB_KEY}&language=en-US&page=${page}&sort_by=popularity.desc&with_original_language=${language}&include_adult=true`
        );
      }
    }

    const blocklist = getBlockedIds();
    return (data.results || [])
      .filter((r: any) => (r.media_type === 'movie' || r.media_type === 'tv' || type !== 'all') && !blocklist.includes(r.id))
      .map((r: any) => ({ ...r, media_type: r.media_type || (type === 'all' ? 'movie' : type) }));
  }, 600000); // Cache for 10 minutes
};

export const getTopRated = async (page: number = 1, type: 'movie' | 'tv' | 'both' = 'both', language: string = 'all'): Promise<TMDBResult[]> => {
  const cacheKey = `top_rated_${type}_lang_${language}_page_${page}`;
  return apiCache.fetch(cacheKey, async () => {
    const blocklist = getBlockedIds();

    const getUrl = (mediaType: 'movie' | 'tv') => {
      if (language === 'all') {
        return `${TMDB_BASE_URL}/${mediaType}/top_rated?api_key=${TMDB_KEY}&language=en-US&page=${page}&include_adult=true`;
      } else {
        return `${TMDB_BASE_URL}/discover/${mediaType}?api_key=${TMDB_KEY}&language=en-US&page=${page}&sort_by=vote_average.desc&vote_count.gte=200&with_original_language=${language}&include_adult=true`;
      }
    };

    if (type === 'both') {
      const [movieRes, tvRes] = await Promise.all([
        fetchWithRetry(getUrl('movie')),
        fetchWithRetry(getUrl('tv'))
      ]);
      const movies = (movieRes.results || []).map((r: any) => ({ ...r, media_type: 'movie' }));
      const tv = (tvRes.results || []).map((r: any) => ({ ...r, media_type: 'tv' }));
      return [...movies, ...tv]
        .filter(r => !blocklist.includes(r.id))
        .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    } else {
      const data = await fetchWithRetry(getUrl(type as 'movie' | 'tv'));
      return (data.results || [])
        .map((r: any) => ({ ...r, media_type: type as 'movie' | 'tv' }))
        .filter(r => !blocklist.includes(r.id));
    }
  }, 1800000); // Cache for 30 minutes
};

export const fetchMediaDetails = async (id: number, type: 'movie' | 'tv') => {
  const cacheKey = `details_${type}_${id}`;
  return apiCache.fetch(cacheKey, async () => {
    const data = await fetchWithRetry(
      `${TMDB_BASE_URL}/${type}/${id}?api_key=${TMDB_KEY}&language=en-US&include_adult=true`
    );
    let runtime = 0;
    if (type === 'movie') {
      runtime = data.runtime || 0;
    } else {
      const epRunTimeArray = data.episode_run_time || [];
      const avgEpTime = epRunTimeArray.length > 0 ? (epRunTimeArray.reduce((a: number, b: number) => a + b, 0) / epRunTimeArray.length) : 45;
      runtime = data.number_of_episodes ? Math.round(avgEpTime * data.number_of_episodes) : Math.round(avgEpTime);
    }
    return {
      genres: data.genres?.map((g: any) => g.name) || [],
      runtime: runtime,
      overview: data.overview || '',
      tagline: data.tagline || '',
      vote_average: data.vote_average || 0,
      original_language: data.original_language || 'en',
      seasons: data.seasons || [],
      studios: data.production_companies?.map((c: any) => c.name) || [],
      created_by: data.created_by?.map((c: any) => ({
        id: c.id,
        name: c.name,
        profile_path: c.profile_path || null
      })) || [],
      releaseYear: (data.release_date || data.first_air_date || '').split('-')[0] || ''
    };
  }, 3600000); // Cache for 1 hour
};

// Helper to purge large transient cache entries from localStorage to prevent quota exceeded errors
export const purgeUnnecessaryLocalStorage = () => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('cinelog_credits_cache_') || key.startsWith('credits_') || key.startsWith('cache_'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => {
      try {
        localStorage.removeItem(k);
      } catch (e) {}
    });
  } catch (e) {
    // Ignore storage iteration error
  }
};

// Immediately purge any bloated historical credits keys on load
purgeUnnecessaryLocalStorage();

export const fetchMediaCredits = async (id: number, type: 'movie' | 'tv') => {
  const cacheKey = `credits_${type}_${id}`;
  return apiCache.fetch(cacheKey, async () => {
    try {
      const data = await fetchWithRetry(`${TMDB_BASE_URL}/${type}/${id}/credits?api_key=${TMDB_KEY}&language=en-US`);
      return data || { cast: [], crew: [] };
    } catch (e) {
      // Gracefully return empty cast/crew on persistent network or rate limits without interrupting UI
      return { cast: [], crew: [] };
    }
  }, 7200000); // Cache in memory for 2 hours
};

export const getEntries = async (): Promise<WatchEntry[]> => {
  if (!window.loadMovies) return [];
  try {
    const movies = await window.loadMovies();
    return (movies || []).map(m => ({
      ...m,
      id: m.id,
      tmdbId: m.tmdbId ? parseInt(String(m.tmdbId)) : 0,
      year: parseInt(m.year) || new Date(m.watchDate || m.watchedOn).getFullYear() || new Date().getFullYear(),
      releaseYear: m.releaseYear || undefined,
      genres: m.genres || [],
      runtime: m.runtime || (m.type === 'tv' ? 45 : 120),
      studios: m.studios || [],
      createdAt: m.createdAt || m.watchDate || m.watchedOn,
      watchDate: m.watchDate || m.watchedOn
    })).sort((a, b) => {
      const getTime = (entry: any) => {
        if (entry.watchDate && entry.watchDate !== '0000-00-00') {
          const t = new Date(entry.watchDate).getTime();
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
  } catch (e) {
    return [];
  }
};

export const saveEntry = async (entry: Omit<WatchEntry, 'id'>): Promise<void> => {
  if (window.addMovie) {
    await window.addMovie(clean(entry));
  }
};

export const deleteEntry = async (id: string): Promise<void> => {
  if (window.removeMovie) await window.removeMovie(id);
};

export const updateEntry = async (updated: WatchEntry): Promise<void> => {
  if (window.updateMovie) {
    const { id, ...data } = updated;
    await window.updateMovie(id, clean(data));
  }
};

export const getWatchLists = async (): Promise<WatchList[]> => {
  if (!window.loadWatchLists) return [];
  const data = await window.loadWatchLists();
  return data || [];
};

export const saveWatchList = async (list: Partial<WatchList>): Promise<string> => {
  return window.saveWatchList ? await window.saveWatchList(clean(list)) : "";
};

export const updateWatchList = async (id: string, data: Partial<WatchList>): Promise<void> => {
  if (window.updateWatchList) await window.updateWatchList(id, clean(data));
};

export const removeWatchList = async (id: string) => {
  if (window.removeWatchList) await window.removeWatchList(id);
};

// Custom Lists (Cinematic)
export const getCustomLists = async (): Promise<CustomList[]> => {
  if (!window.loadCustomLists) return [];
  const data = await window.loadCustomLists();
  return data || [];
};

export const saveCustomList = async (list: Partial<CustomList>): Promise<string> => {
  return window.saveCustomList ? await window.saveCustomList(clean(list)) : "";
};

export const updateCustomList = async (id: string, data: Partial<CustomList>): Promise<void> => {
  if (window.updateCustomList) await window.updateCustomList(id, clean(data));
};

export const removeCustomList = async (id: string) => {
  if (window.removeCustomList) await window.removeCustomList(id);
};

// Helper for waiting on window methods during bootstrap
const waitForWindowMethod = async (getter: () => any, maxWaitMs = 2000): Promise<any> => {
  if (typeof window === 'undefined') return undefined;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const fn = getter();
    if (typeof fn === 'function') return fn;
    await new Promise(r => setTimeout(r, 40));
  }
  return getter();
};

const createSubscription = (
  subscriberGetter: () => ((cb: any) => () => void) | undefined,
  callback: (data: any) => void,
  mapFn?: (raw: any[]) => any[]
): (() => void) => {
  if (typeof window === 'undefined') return () => {};

  let unsub: (() => void) | null = null;
  const invoke = (subFn: (cb: any) => () => void) => {
    unsub = subFn((raw: any[]) => {
      callback(mapFn ? mapFn(raw) : raw);
    });
  };

  const fn = subscriberGetter();
  if (typeof fn === 'function') {
    invoke(fn);
  } else {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const currentFn = subscriberGetter();
      if (typeof currentFn === 'function') {
        clearInterval(interval);
        invoke(currentFn);
      } else if (attempts > 50) {
        clearInterval(interval);
      }
    }, 80);

    return () => {
      clearInterval(interval);
      if (unsub) unsub();
    };
  }

  return () => {
    if (unsub) unsub();
  };
};

// Real-time Subscriptions
export const subscribeToEntries = (callback: (entries: WatchEntry[]) => void) => {
  return createSubscription(
    () => window.subscribeToEntries,
    callback,
    (rawEntries: any[]) => rawEntries.map(m => ({
      ...m,
      id: m.id,
      year: parseInt(m.year) || new Date(m.watchDate || m.watchedOn).getFullYear() || new Date().getFullYear(),
      genres: m.genres || [],
      runtime: m.runtime || (m.type === 'tv' ? 45 : 120),
      createdAt: m.createdAt || m.watchDate || m.watchedOn,
      watchDate: m.watchDate || m.watchedOn
    }))
  );
};

export const subscribeToWatchLists = (callback: (lists: WatchList[]) => void) => {
  return createSubscription(() => window.subscribeToWatchLists, callback);
};

export const subscribeToCustomLists = (callback: (lists: CustomList[]) => void) => {
  return createSubscription(() => window.subscribeToCustomLists, callback);
};

// Search History Cloud Sync
export const getRecentSearches = async (): Promise<RecentSearchItem[]> => {
  const loadFn = await waitForWindowMethod(() => window.loadRecentSearches);
  if (!loadFn) return [];
  try {
    const data = await loadFn();
    return (data || []).map((item: any) => ({
      id: String(item.id || item.query),
      query: String(item.query || ''),
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      type: item.type || 'query',
      title: item.title,
      posterPath: item.posterPath,
      image: item.image,
      year: item.year,
      subtitle: item.subtitle,
      entityId: item.entityId ? Number(item.entityId) : undefined
    }));
  } catch (e) {
    return [];
  }
};

export const saveRecentSearch = async (item: RecentSearchItem): Promise<string> => {
  const saveFn = await waitForWindowMethod(() => window.saveRecentSearch, 800);
  if (!saveFn) return item.id;
  try {
    return await saveFn(clean(item));
  } catch (e) {
    return item.id;
  }
};

export const removeRecentSearch = async (id: string): Promise<void> => {
  const removeFn = await waitForWindowMethod(() => window.removeRecentSearch, 800);
  if (removeFn) {
    await removeFn(id);
  }
};

export const clearRecentSearches = async (): Promise<void> => {
  const clearFn = await waitForWindowMethod(() => window.clearRecentSearches, 800);
  if (clearFn) {
    await clearFn();
  }
};

export const subscribeToRecentSearches = (callback: (searches: RecentSearchItem[]) => void) => {
  return createSubscription(
    () => window.subscribeToRecentSearches,
    callback,
    (rawSearches: any[]) => (rawSearches || []).map((item: any) => ({
      id: String(item.id || item.query),
      query: String(item.query || ''),
      timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
      type: item.type || 'query',
      title: item.title,
      posterPath: item.posterPath,
      image: item.image,
      year: item.year,
      subtitle: item.subtitle,
      entityId: item.entityId ? Number(item.entityId) : undefined
    }))
  );
};

// Pinned Talent Cloud Sync
export const getPinnedTalents = async (): Promise<PinnedTalent[]> => {
  const loadFn = await waitForWindowMethod(() => window.loadPinnedTalents);
  if (!loadFn) return [];
  try {
    const data = await loadFn();
    return (data || []).map((item: any) => ({
      id: Number(item.id),
      name: String(item.name || 'Talent'),
      image: item.image,
      type: item.type || 'person',
      subtitle: item.subtitle,
      pinnedAt: typeof item.pinnedAt === 'number' ? item.pinnedAt : Date.now()
    })).filter((t: any) => t.id && !isNaN(t.id));
  } catch (e) {
    return [];
  }
};

export const savePinnedTalent = async (talent: PinnedTalent): Promise<string> => {
  const saveFn = await waitForWindowMethod(() => window.savePinnedTalent, 800);
  if (!saveFn) return String(talent.id);
  try {
    return await saveFn(clean(talent));
  } catch (e) {
    return String(talent.id);
  }
};

export const removePinnedTalent = async (id: number | string): Promise<void> => {
  const removeFn = await waitForWindowMethod(() => window.removePinnedTalent, 800);
  if (removeFn) {
    await removeFn(String(id));
  }
};

export const clearPinnedTalents = async (): Promise<void> => {
  const clearFn = await waitForWindowMethod(() => window.clearPinnedTalents, 800);
  if (clearFn) {
    await clearFn();
  }
};

export const subscribeToPinnedTalents = (callback: (talents: PinnedTalent[]) => void) => {
  return createSubscription(
    () => window.subscribeToPinnedTalents,
    callback,
    (rawTalents: any[]) => (rawTalents || []).map((item: any) => ({
      id: Number(item.id),
      name: String(item.name || 'Talent'),
      image: item.image,
      type: item.type || 'person',
      subtitle: item.subtitle,
      pinnedAt: typeof item.pinnedAt === 'number' ? item.pinnedAt : Date.now()
    })).filter((t: any) => t.id && !isNaN(t.id))
  );
};

export const searchPeople = async (query: string): Promise<any[]> => {
  if (!query) return [];
  const cacheKey = `search_people_${encodeURIComponent(query)}`;
  return apiCache.fetch(cacheKey, async () => {
    const data = await fetchWithRetry(
      `${TMDB_BASE_URL}/search/person?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(query)}&include_adult=true`
    );
    return data.results || [];
  }, 600000); // Cache for 10 minutes
};

export const searchCompanies = async (query: string): Promise<any[]> => {
  if (!query) return [];
  const cacheKey = `search_companies_${encodeURIComponent(query)}`;
  return apiCache.fetch(cacheKey, async () => {
    const data = await fetchWithRetry(
      `${TMDB_BASE_URL}/search/company?api_key=${TMDB_KEY}&language=en-US&query=${encodeURIComponent(query)}`
    );
    return data.results || [];
  }, 600000); // Cache for 10 minutes
};

export const getPersonCredits = async (personId: number): Promise<any[]> => {
  const cacheKey = `person_credits_${personId}`;
  return apiCache.fetch(cacheKey, async () => {
    const data = await fetchWithRetry(
      `${TMDB_BASE_URL}/person/${personId}/combined_credits?api_key=${TMDB_KEY}&language=en-US`
    );
    const blocklist = getBlockedIds();
    const cast = (data.cast || []).map((c: any) => ({ ...c, credit_category: 'cast' }));
    const crew = (data.crew || []).map((c: any) => ({ ...c, credit_category: 'crew' }));
    return [...cast, ...crew].filter(m => !blocklist.includes(m.id));
  }, 3600000); // Cache for 1 hour
};

export const getCompanyMedia = async (companyId: number): Promise<any[]> => {
  const cacheKey = `company_media_${companyId}`;
  return apiCache.fetch(cacheKey, async () => {
    const [movieRes, tvRes] = await Promise.all([
      fetchWithRetry(`${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&with_companies=${companyId}&include_adult=true`),
      fetchWithRetry(`${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_KEY}&language=en-US&with_companies=${companyId}&include_adult=true`)
    ]);
    const blocklist = getBlockedIds();
    const movies = (movieRes.results || []).map((m: any) => ({ ...m, media_type: 'movie' }));
    const tv = (tvRes.results || []).map((t: any) => ({ ...t, media_type: 'tv' }));
    return [...movies, ...tv].filter(m => !blocklist.includes(m.id));
  }, 3600000); // Cache for 1 hour
};

export const getPopularPeople = async (page: number = 1): Promise<any[]> => {
  const cacheKey = `popular_people_page_${page}`;
  return apiCache.fetch(cacheKey, async () => {
    const data = await fetchWithRetry(
      `${TMDB_BASE_URL}/person/popular?api_key=${TMDB_KEY}&language=en-US&page=${page}`
    );
    return data.results || [];
  }, 1800000); // Cache for 30 minutes
};

export const getPersonDetails = async (personId: number): Promise<any> => {
  const cacheKey = `person_details_${personId}`;
  return apiCache.fetch(cacheKey, async () => {
    return await fetchWithRetry(
      `${TMDB_BASE_URL}/person/${personId}?api_key=${TMDB_KEY}&language=en-US`
    );
  }, 3600000); // Cache for 1 hour
};

export const getCompanyDetails = async (companyId: number): Promise<any> => {
  const cacheKey = `company_details_${companyId}`;
  return apiCache.fetch(cacheKey, async () => {
    return await fetchWithRetry(
      `${TMDB_BASE_URL}/company/${companyId}?api_key=${TMDB_KEY}&language=en-US`
    );
  }, 3600000); // Cache for 1 hour
};

export const discoverByYear = async (
  year: number,
  type: 'movie' | 'tv',
  page: number = 1,
  language: string = 'all'
): Promise<{ results: any[]; total_pages: number }> => {
  const cacheKey = `discover_${type}_year_${year}_page_${page}_lang_${language}`;
  return apiCache.fetch(cacheKey, async () => {
    const filterParam = type === 'movie'
      ? `primary_release_year=${year}`
      : `first_air_date_year=${year}`;
    let url = `${TMDB_BASE_URL}/discover/${type}?api_key=${TMDB_KEY}&language=en-US&sort_by=popularity.desc&page=${page}&${filterParam}&include_adult=true`;
    if (language && language !== 'all') {
      url += `&with_original_language=${language}`;
    }
    const data = await fetchWithRetry(url);
    const blocklist = getBlockedIds();
    const results = (data.results || [])
      .filter((r: any) => !blocklist.includes(r.id))
      .map((r: any) => ({
        ...r,
        media_type: type,
      }));
    return {
      results,
      total_pages: data.total_pages || 1,
    };
  }, 1800000); // Cache for 30 minutes
};
