import { RecentSearchItem } from '../types';
import * as api from './api';
import { useStore } from '../store/useStore';

export const RECENT_SEARCHES_KEY = 'cinelog_recent_searches';

export const getStoredSearchHistory = (): RecentSearchItem[] => {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item: any, idx: number): RecentSearchItem | null => {
        if (!item) return null;
        if (typeof item === 'string') {
          return {
            id: `legacy-${idx}-${item}`,
            query: item,
            timestamp: Date.now() - idx * 60000,
            type: 'query'
          };
        }
        if (typeof item.query === 'string' && item.query.trim().length > 0) {
          return {
            id: item.id || `search-${idx}-${item.query}`,
            query: item.query.trim(),
            timestamp: typeof item.timestamp === 'number' ? item.timestamp : Date.now(),
            type: item.type || 'query',
            title: item.title,
            posterPath: item.posterPath,
            image: item.image,
            year: item.year,
            subtitle: item.subtitle,
            entityId: item.entityId
          };
        }
        return null;
      })
      .filter((item): item is RecentSearchItem => item !== null && item.query.length > 0);
  } catch (err) {
    console.warn('Failed to parse search history:', err);
    return [];
  }
};

export const saveSearchHistoryItem = (
  itemOrQuery: string | Partial<RecentSearchItem>
): RecentSearchItem[] => {
  const current = getStoredSearchHistory();
  const query = typeof itemOrQuery === 'string' ? itemOrQuery.trim() : (itemOrQuery.query || '').trim();
  if (query.length <= 1) return current;

  const type = typeof itemOrQuery === 'object' ? itemOrQuery.type : undefined;
  const entityId = typeof itemOrQuery === 'object' ? itemOrQuery.entityId : undefined;

  // Filter out existing matching items by query (or entityId + type if present)
  const filtered = current.filter(existing => {
    if (entityId && existing.entityId && existing.type === type && existing.entityId === entityId) {
      return false;
    }
    return existing.query.toLowerCase() !== query.toLowerCase();
  });

  const existingMatch = current.find(existing => {
    if (entityId && existing.entityId && existing.type === type && existing.entityId === entityId) {
      return true;
    }
    return existing.query.toLowerCase() === query.toLowerCase();
  });

  const isObj = typeof itemOrQuery === 'object' && itemOrQuery !== null;
  const obj = isObj ? (itemOrQuery as Partial<RecentSearchItem>) : null;

  const newItem: RecentSearchItem = {
    id: existingMatch?.id || `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    query,
    timestamp: Date.now(),
    type: obj?.type || existingMatch?.type || 'query',
    title: obj?.title || existingMatch?.title || query,
    posterPath: obj && obj.posterPath !== undefined ? obj.posterPath : existingMatch?.posterPath,
    image: obj && obj.image !== undefined ? obj.image : existingMatch?.image,
    year: obj?.year || existingMatch?.year,
    subtitle: obj?.subtitle || existingMatch?.subtitle,
    entityId: obj?.entityId || existingMatch?.entityId
  };

  const updated = [newItem, ...filtered].slice(0, 40);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save search history:', err);
  }

  // Update Zustand store reactive state
  try {
    useStore.setState({ recentSearches: updated });
  } catch (e) {}

  // Sync to Firestore Cloud in background
  try {
    api.saveRecentSearch(newItem);
  } catch (e) {}

  // Dispatch custom storage event for instant synchronization across tabs or components
  try {
    window.dispatchEvent(new CustomEvent('cinelog:search-history-updated', { detail: updated }));
  } catch (e) {}

  return updated;
};

export const removeSearchHistoryItem = (idOrQuery: string): RecentSearchItem[] => {
  const current = getStoredSearchHistory();
  const target = current.find(item => item.id === idOrQuery || item.query.toLowerCase() === idOrQuery.toLowerCase());
  const updated = current.filter(
    item => item.id !== idOrQuery && item.query.toLowerCase() !== idOrQuery.toLowerCase()
  );

  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to remove search history item:', err);
  }

  try {
    useStore.setState({ recentSearches: updated });
  } catch (e) {}

  if (target?.id || idOrQuery) {
    try {
      api.removeRecentSearch(target?.id || idOrQuery);
    } catch (e) {}
  }

  try {
    window.dispatchEvent(new CustomEvent('cinelog:search-history-updated', { detail: updated }));
  } catch (e) {}

  return updated;
};

export const clearAllSearchHistory = (): RecentSearchItem[] => {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([]));
  } catch (err) {
    console.warn('Failed to clear search history:', err);
  }

  try {
    useStore.setState({ recentSearches: [] });
  } catch (e) {}

  try {
    api.clearRecentSearches();
  } catch (e) {}

  try {
    window.dispatchEvent(new CustomEvent('cinelog:search-history-updated', { detail: [] }));
  } catch (e) {}

  return [];
};
