
export enum Rating {
  BAD = 'BAD',
  MID = 'MID',
  GOOD = 'GOOD',
  PEAK = 'PEAK',
  VAGUE = 'VAGUE'
}

export interface User {
  id: string;
  email: string;
  themePreference: 'light' | 'dark' | 'system';
}

export interface WatchEntry {
  id: string;
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  posterUrl: string;
  watchDate: string;
  rating: Rating;
  isVague?: boolean;
  isAbsoluteCinema?: boolean;
  isRewatch?: boolean;
  isFavorite?: boolean;
  isBlurred?: boolean;
  review?: string;
  year: number;
  releaseYear?: string;
  genres: string[];
  runtime: number; // in minutes
  studios?: string[];
  createdAt?: string;
  episodeCount?: number;
  airDate?: string;
  seasonSynopsis?: string;
  seasonNumber?: number;
  seasonName?: string;
  datePrecision?: 'exact' | 'year' | 'unknown';
  approximateYear?: number;
  isBacklogRecovery?: boolean;
}

export type BacklogStatus = 'unseen' | 'skipped' | 'watched' | 'logged' | 'hidden';

export interface BacklogCandidate {
  id: string; // e.g. "movie_155" or "tv_1399_s1"
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  originalTitle?: string;
  posterUrl: string;
  releaseYear: string;
  overview: string;
  originalLanguage: string;
  genres: string[];
  voteAverage: number;
  voteCount: number;
  popularity: number;
  historicalScore: number;
  seasonNumber?: number;
  seasonName?: string;
  episodeCount?: number;
  airDate?: string;
  category: 'hollywood' | 'bollywood' | 'english_tv' | 'indian_tv' | 'classic' | 'imported';
  status?: BacklogStatus;
  processedAt?: number;
}

export interface BacklogStats {
  totalCandidates: number;
  processedCount: number;
  watchedCount: number;
  skippedCount: number;
  remainingCount: number;
}

export interface WatchListItem {
  tmdbId: number;
  type: 'movie' | 'tv';
  title: string;
  posterUrl: string;
  addedAt?: string;
  episodeCount?: number;
  airDate?: string;
  seasonSynopsis?: string;
}

export interface WatchList {
  id: string;
  name: string;
  items: WatchListItem[];
}

export interface CustomList {
  id: string;
  name: string;
  items: WatchListItem[];
  description?: string;
  createdAt?: string;
}

export interface TMDBResult {
  id: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  original_language?: string;
  poster_path: string;
  backdrop_path?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  media_type: 'movie' | 'tv';
  genre_ids: number[];
  adult?: boolean;
}

export interface YearStats {
  totalMovies: number;
  totalSeries: number;
  avgRating: string;
  topGenres: { name: string; count: number }[];
  ratingBreakdown: { name: string; value: number }[];
}

export interface RecentSearchItem {
  id: string;
  query: string;
  timestamp: number;
  type?: 'movie' | 'tv' | 'person' | 'company' | 'query';
  title?: string;
  posterPath?: string | null;
  image?: string | null;
  year?: string | number;
  subtitle?: string;
  entityId?: number;
}

export interface PinnedTalent {
  id: number;
  name: string;
  image?: string;
  type?: 'person' | 'company';
  subtitle?: string;
  pinnedAt?: number;
}
