import { TMDB_BASE_URL, TMDB_KEY, TMDB_IMAGE_BASE } from '../constants';
import { TMDBResult, WatchEntry, BacklogCandidate, BacklogStatus, BacklogStats } from '../types';
import { fetchMediaDetails } from './api';

const CANDIDATES_STORAGE_KEY = 'cinelog_backlog_candidates';
const HISTORY_STORAGE_KEY = 'cinelog_backlog_history';
const LETTERBOXD_STORAGE_KEY = 'cinelog_backlog_letterboxd';

interface HistoryRecord {
  candidateId: string;
  status: BacklogStatus;
  timestamp: number;
  entryId?: string;
}

// Iconic cultural milestones & franchises to boost for historical recognition
const ICONIC_MILESTONES = [
  'shawshank redemption', 'godfather', 'dark knight', 'interstellar', 'pulp fiction',
  'fight club', 'forrest gump', 'matrix', 'goodfellas', 'lord of the rings', 'fellowship of the ring',
  'return of the king', 'two towers', 'harry potter', 'star wars', 'empire strikes back',
  'inception', 'spirited away', 'parasite', 'gladiator', 'saving private ryan',
  'schindler', 'silence of the lambs', 'se7en', 'seven', 'jurassic park', 'titanic',
  'back to the future', 'casablanca', 'citizen kane', '12 angry men', 'psycho',
  // Bollywood Classics & Milestones
  'sholay', '3 idiots', 'dangal', 'taare zameen par', 'lagaan', 'dilwale dulhania le jayenge',
  'gangs of wasseypur', 'andhadhun', 'pk', 'swades', 'rang de basanti', 'zindagi na milegi dobara',
  'barfi', 'tumbbad', 'bajrangi bhaijaan', 'chak de india', 'dil chahta hai', 'kahaani',
  'munna bhai', 'l максималь', 'queen', 'drishyam', 'haider', 'anand', 'deewaar', 'mughal-e-azam',
  // Top TV Series
  'breaking bad', 'game of thrones', 'friends', 'the wire', 'the sopranos', 'stranger things',
  'better call saul', 'chernobyl', 'sherlock', 'peaky blinders', 'succession', 'fargo',
  'true detective', 'the office', 'narcos', 'sacred games', 'mirzapur', 'panchayat',
  'scam 1992', 'the family man', 'paatal lok', 'kota factory', 'special ops', 'rocket boys'
];

/**
 * Calculates a balanced Historical Popularity Score (0-100)
 */
export const calculateHistoricalScore = (item: {
  title?: string;
  name?: string;
  vote_count?: number;
  vote_average?: number;
  popularity?: number;
  release_date?: string;
  first_air_date?: string;
  original_language?: string;
  media_type?: string;
}): number => {
  const title = (item.title || item.name || '').toLowerCase();
  const votes = item.vote_count || 0;
  const rating = item.vote_average || 0;
  const lang = item.original_language || 'en';
  const releaseYear = parseInt((item.release_date || item.first_air_date || '').split('-')[0]) || 2015;

  // 1. Vote Count Awareness (with fair normalized floor for Hindi & classic cinema)
  let voteTarget = 20000;
  if (lang === 'hi') {
    voteTarget = 1500; // TMDB has significantly fewer Hindi ratings than Western releases
  } else if (item.media_type === 'tv') {
    voteTarget = 5000;
  } else if (releaseYear < 1995) {
    voteTarget = 8000;
  }

  const voteScore = Math.min(1, Math.log10(votes + 1) / Math.log10(voteTarget));

  // 2. Rating Quality Score (anchored between 5.0 and 9.0)
  const ratingScore = Math.max(0, Math.min(1, (rating - 5.0) / 3.8));

  // 3. Pre-CineLog Era Boost (focuses on movies/shows released before 2025)
  let eraScore = 0.8;
  if (releaseYear >= 1970 && releaseYear <= 2024) {
    eraScore = 1.0;
  } else if (releaseYear < 1970) {
    eraScore = 0.95;
  } else {
    // 2025+ is already tracked in user's current diary
    eraScore = 0.5;
  }

  // 4. Cultural Milestone & Franchise Recognition Bonus
  const isIconic = ICONIC_MILESTONES.some(m => title.includes(m));
  const culturalBonus = isIconic ? 1.0 : 0.65;

  // Normalized weighted combination:
  // 35% vote recognition, 30% audience rating, 20% era focus, 15% cultural milestone
  const composite = (
    0.35 * voteScore +
    0.30 * ratingScore +
    0.20 * eraScore +
    0.15 * culturalBonus
  ) * 100;

  return Math.round(Math.min(100, Math.max(10, composite)));
};

/**
 * Fetch discovery titles from TMDB for a specific decade / criteria
 */
const fetchTMDBDiscovery = async (url: string): Promise<any[]> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.warn("Backlog TMDB fetch error:", e);
    return [];
  }
};

/**
 * Curated discovery queries that cover Hollywood decades, Bollywood all-time hits,
 * and premier English & Indian TV series.
 */
export const buildCandidatePoolFromTMDB = async (): Promise<BacklogCandidate[]> => {
  const candidates: BacklogCandidate[] = [];
  const seenIds = new Set<string>();

  const addMovieCandidate = (m: any, category: BacklogCandidate['category']) => {
    if (!m || !m.id || !m.poster_path) return;
    const id = `movie_${m.id}`;
    if (seenIds.has(id)) return;
    seenIds.add(id);

    const title = m.title || m.original_title || 'Untitled';
    const releaseYear = (m.release_date || '').split('-')[0] || '';
    const score = calculateHistoricalScore({ ...m, media_type: 'movie' });

    candidates.push({
      id,
      tmdbId: m.id,
      type: 'movie',
      title,
      originalTitle: m.original_title,
      posterUrl: `${TMDB_IMAGE_BASE}${m.poster_path}`,
      releaseYear,
      overview: m.overview || '',
      originalLanguage: m.original_language || 'en',
      genres: [],
      voteAverage: m.vote_average || 0,
      voteCount: m.vote_count || 0,
      popularity: m.popularity || 0,
      historicalScore: score,
      category,
      status: 'unseen'
    });
  };

  // Queries to collect deep historical pool:
  const queryConfigs = [
    // 1. Hollywood Classics (1970 - 1999)
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&primary_release_date.gte=1970-01-01&primary_release_date.lte=1999-12-31&vote_count.gte=3000&with_original_language=en&page=1`,
      cat: 'classic' as const
    },
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&primary_release_date.gte=1970-01-01&primary_release_date.lte=1999-12-31&vote_count.gte=3000&with_original_language=en&page=2`,
      cat: 'classic' as const
    },
    // 2. Hollywood Golden 2000s (2000 - 2009)
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&primary_release_date.gte=2000-01-01&primary_release_date.lte=2009-12-31&vote_count.gte=5000&with_original_language=en&page=1`,
      cat: 'hollywood' as const
    },
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&primary_release_date.gte=2000-01-01&primary_release_date.lte=2009-12-31&vote_count.gte=5000&with_original_language=en&page=2`,
      cat: 'hollywood' as const
    },
    // 3. Hollywood 2010s Blockbusters & Acclaimed (2010 - 2019)
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&primary_release_date.gte=2010-01-01&primary_release_date.lte=2019-12-31&vote_count.gte=8000&with_original_language=en&page=1`,
      cat: 'hollywood' as const
    },
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&primary_release_date.gte=2010-01-01&primary_release_date.lte=2019-12-31&vote_count.gte=8000&with_original_language=en&page=2`,
      cat: 'hollywood' as const
    },
    // 4. Pre-CineLog Modern Movies (2020 - 2024)
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&primary_release_date.gte=2020-01-01&primary_release_date.lte=2024-12-31&vote_count.gte=4000&with_original_language=en&page=1`,
      cat: 'hollywood' as const
    },
    // 5. Bollywood / Hindi Cinema Top Rated & Recognized (1970 - 2024)
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&with_original_language=hi&vote_count.gte=100&page=1`,
      cat: 'bollywood' as const
    },
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&with_original_language=hi&vote_count.gte=100&page=2`,
      cat: 'bollywood' as const
    },
    {
      url: `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_average.desc&with_original_language=hi&vote_count.gte=150&page=1`,
      cat: 'bollywood' as const
    }
  ];

  // Fetch movie batches in parallel
  const results = await Promise.all(queryConfigs.map(c => fetchTMDBDiscovery(c.url)));
  results.forEach((items, idx) => {
    const cat = queryConfigs[idx].cat;
    items.forEach(item => addMovieCandidate(item, cat));
  });

  // 6. Fetch Popular English TV Series and expand their seasons!
  const englishTvShows = await fetchTMDBDiscovery(
    `${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&with_original_language=en&vote_count.gte=2000&page=1`
  );

  // 7. Fetch Top Indian / Hindi TV & Web Series
  const indianTvShows = await fetchTMDBDiscovery(
    `${TMDB_BASE_URL}/discover/tv?api_key=${TMDB_KEY}&language=en-US&sort_by=vote_count.desc&with_original_language=hi&vote_count.gte=30&page=1`
  );

  // Expand top TV series into season-level discovery
  const tvSeriesToExpand = [
    ...englishTvShows.slice(0, 10).map((s: any) => ({ ...s, cat: 'english_tv' as const })),
    ...indianTvShows.slice(0, 8).map((s: any) => ({ ...s, cat: 'indian_tv' as const }))
  ];

  for (const show of tvSeriesToExpand) {
    try {
      const details = await fetchMediaDetails(show.id, 'tv');
      const seasons = (details.seasons || []).filter((s: any) => s.season_number > 0); // Ignore specials (season 0)

      if (seasons.length > 0) {
        seasons.forEach((season: any) => {
          const seasonId = `tv_${show.id}_s${season.season_number}`;
          if (seenIds.has(seasonId)) return;
          seenIds.add(seasonId);

          const seasonPoster = season.poster_path
            ? `${TMDB_IMAGE_BASE}${season.poster_path}`
            : (show.poster_path ? `${TMDB_IMAGE_BASE}${show.poster_path}` : '');

          if (!seasonPoster) return;

          const seasonTitle = `${show.name || show.original_name} — ${season.name || `Season ${season.season_number}`}`;
          const seasonYear = (season.air_date || show.first_air_date || '').split('-')[0] || '';
          const score = calculateHistoricalScore({
            name: seasonTitle,
            vote_count: show.vote_count,
            vote_average: season.vote_average || show.vote_average,
            first_air_date: season.air_date || show.first_air_date,
            original_language: show.original_language,
            media_type: 'tv'
          });

          candidates.push({
            id: seasonId,
            tmdbId: show.id,
            type: 'tv',
            title: seasonTitle,
            originalTitle: show.original_name,
            posterUrl: seasonPoster,
            releaseYear: seasonYear,
            overview: season.overview || show.overview || '',
            originalLanguage: show.original_language || 'en',
            genres: details.genres || [],
            voteAverage: season.vote_average || show.vote_average || 0,
            voteCount: show.vote_count || 0,
            popularity: show.popularity || 0,
            historicalScore: score,
            seasonNumber: season.season_number,
            seasonName: season.name || `Season ${season.season_number}`,
            episodeCount: season.episode_count,
            airDate: season.air_date,
            category: show.cat,
            status: 'unseen'
          });
        });
      } else {
        // Fallback to series level if no seasons returned
        const id = `tv_${show.id}`;
        if (!seenIds.has(id) && show.poster_path) {
          seenIds.add(id);
          candidates.push({
            id,
            tmdbId: show.id,
            type: 'tv',
            title: show.name || show.original_name || 'Untitled Series',
            posterUrl: `${TMDB_IMAGE_BASE}${show.poster_path}`,
            releaseYear: (show.first_air_date || '').split('-')[0] || '',
            overview: show.overview || '',
            originalLanguage: show.original_language || 'en',
            genres: [],
            voteAverage: show.vote_average || 0,
            voteCount: show.vote_count || 0,
            popularity: show.popularity || 0,
            historicalScore: calculateHistoricalScore({ ...show, media_type: 'tv' }),
            category: show.cat,
            status: 'unseen'
          });
        }
      }
    } catch (err) {
      console.warn(`Failed to expand seasons for TV show ${show.id}:`, err);
    }
  }

  // Sort overall candidate pool by Historical Popularity Score descending
  candidates.sort((a, b) => b.historicalScore - a.historicalScore);

  return candidates;
};

/**
 * Retrieve candidates from localStorage, or initialize from TMDB if empty
 */
export const getStoredCandidates = (): BacklogCandidate[] => {
  try {
    const raw = localStorage.getItem(CANDIDATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

export const saveStoredCandidates = (candidates: BacklogCandidate[]): void => {
  try {
    localStorage.setItem(CANDIDATES_STORAGE_KEY, JSON.stringify(candidates));
  } catch (e) {
    console.warn("Storage quota warning while caching candidates:", e);
  }
};

/**
 * Retrieve user actions history map (candidateId -> record)
 */
export const getStoredHistory = (): Record<string, HistoryRecord> => {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
};

export const saveStoredHistory = (history: Record<string, HistoryRecord>): void => {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.warn("Failed to store backlog history:", e);
  }
};

/**
 * Check if a candidate matches an existing WatchEntry in CineLog
 */
export const isCandidateAlreadyLogged = (candidate: BacklogCandidate, entries: WatchEntry[]): boolean => {
  if (!candidate || !entries) return false;
  return entries.some(entry => {
    if (!entry) return false;
    if (entry.tmdbId && entry.tmdbId === candidate.tmdbId && entry.type === candidate.type) {
      // If candidate is a specific TV season:
      if (candidate.type === 'tv' && candidate.seasonNumber !== undefined) {
        if (entry.seasonNumber !== undefined) {
          return entry.seasonNumber === candidate.seasonNumber;
        }
        // Check if title mentions this season name or number
        const normEntryTitle = (entry.title || '').toLowerCase();
        const normSeasonName = (candidate.seasonName || `Season ${candidate.seasonNumber}`).toLowerCase();
        return normEntryTitle.includes(normSeasonName);
      }
      return true;
    }
    return false;
  });
};

/**
 * Get the current discovery session batch
 * Balances categories (Hollywood, Bollywood, TV Seasons, Classics) so each session is rich and varied
 */
export const getBacklogSessionBatch = (
  allCandidates: BacklogCandidate[],
  entries: WatchEntry[],
  categoryFilter: string = 'all',
  batchSize: number = 20
): { batch: BacklogCandidate[]; stats: BacklogStats } => {
  const history = getStoredHistory();

  // Annotate candidates with current status and filter out processed/logged
  const annotated = allCandidates.map(c => {
    const historyItem = history[c.id];
    const isLogged = isCandidateAlreadyLogged(c, entries);

    let status: BacklogStatus = 'unseen';
    if (isLogged) {
      status = 'logged';
    } else if (historyItem) {
      status = historyItem.status;
    }

    return { ...c, status };
  });

  // Calculate statistics accurately
  const totalCandidates = annotated.length;
  const loggedCount = annotated.filter(c => c.status === 'logged').length;
  const watchedInBacklog = annotated.filter(c => c.status === 'watched').length;
  const totalWatched = loggedCount + watchedInBacklog;
  const skippedCount = annotated.filter(c => c.status === 'skipped').length;
  const processedCount = totalWatched + skippedCount;
  const remainingCount = Math.max(0, totalCandidates - processedCount);

  const stats: BacklogStats = {
    totalCandidates,
    processedCount,
    watchedCount: totalWatched,
    skippedCount,
    remainingCount
  };

  // Filter available unseen candidates
  let available = annotated.filter(c => c.status === 'unseen');

  if (categoryFilter !== 'all') {
    available = available.filter(c => c.category === categoryFilter);
  } else {
    // Interleave diversity: Hollywood, Bollywood, TV, Classic
    const hollywood = available.filter(c => c.category === 'hollywood');
    const bollywood = available.filter(c => c.category === 'bollywood');
    const englishTv = available.filter(c => c.category === 'english_tv');
    const indianTv = available.filter(c => c.category === 'indian_tv');
    const classics = available.filter(c => c.category === 'classic');
    const imported = available.filter(c => c.category === 'imported');

    const interleaved: typeof available = [];
    const maxLen = Math.max(hollywood.length, bollywood.length, englishTv.length, classics.length, indianTv.length, imported.length);

    for (let i = 0; i < maxLen; i++) {
      if (imported[i]) interleaved.push(imported[i]);
      if (hollywood[i]) interleaved.push(hollywood[i]);
      if (bollywood[i]) interleaved.push(bollywood[i]);
      if (englishTv[i]) interleaved.push(englishTv[i]);
      if (classics[i]) interleaved.push(classics[i]);
      if (indianTv[i]) interleaved.push(indianTv[i]);
      if (interleaved.length >= batchSize * 2) break;
    }

    if (interleaved.length > 0) {
      available = interleaved;
    }
  }

  const batch = available.slice(0, batchSize);

  return { batch, stats };
};

/**
 * Mark a candidate as skipped
 */
export const recordBacklogSkip = (candidateId: string): void => {
  const history = getStoredHistory();
  history[candidateId] = {
    candidateId,
    status: 'skipped',
    timestamp: Date.now()
  };
  saveStoredHistory(history);
};

/**
 * Mark a candidate as watched and link to created diary entry ID
 */
export const recordBacklogWatched = (candidateId: string, entryId: string): void => {
  const history = getStoredHistory();
  history[candidateId] = {
    candidateId,
    status: 'watched',
    timestamp: Date.now(),
    entryId
  };
  saveStoredHistory(history);
};

/**
 * Undo last action (reverts the most recently skipped or watched candidate)
 */
export const undoLastBacklogAction = (): string | null => {
  const history = getStoredHistory();
  const entries = Object.values(history);
  if (entries.length === 0) return null;

  // Find the record with newest timestamp
  entries.sort((a, b) => b.timestamp - a.timestamp);
  const lastAction = entries[0];

  if (lastAction) {
    delete history[lastAction.candidateId];
    saveStoredHistory(history);
    return lastAction.candidateId;
  }
  return null;
};

/**
 * Reset all skipped titles so user can revisit them
 */
export const restoreSkippedCandidates = (): number => {
  const history = getStoredHistory();
  let count = 0;
  for (const [id, item] of Object.entries(history)) {
    if (item.status === 'skipped') {
      delete history[id];
      count++;
    }
  }
  saveStoredHistory(history);
  return count;
};

/**
 * Match and import a list of films (e.g. exported from Letterboxd)
 */
export const importLetterboxdTitles = async (
  titles: { title: string; year?: number | string }[]
): Promise<{ added: number; matched: number }> => {
  const existing = getStoredCandidates();
  const existingIds = new Set(existing.map(c => c.id));
  let added = 0;
  let matched = 0;

  for (const item of titles.slice(0, 30)) { // Process batch up to 30
    if (!item.title) continue;
    try {
      const yearQuery = item.year ? `&year=${item.year}` : '';
      const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_KEY}&query=${encodeURIComponent(item.title)}${yearQuery}&language=en-US`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const first = (data.results || [])[0];
      if (first && first.poster_path) {
        matched++;
        const id = `movie_${first.id}`;
        if (!existingIds.has(id)) {
          const score = calculateHistoricalScore({ ...first, media_type: 'movie' }) + 10; // Boost Letterboxd favorite signal
          existing.unshift({
            id,
            tmdbId: first.id,
            type: 'movie',
            title: first.title || item.title,
            originalTitle: first.original_title,
            posterUrl: `${TMDB_IMAGE_BASE}${first.poster_path}`,
            releaseYear: (first.release_date || '').split('-')[0] || String(item.year || ''),
            overview: first.overview || '',
            originalLanguage: first.original_language || 'en',
            genres: [],
            voteAverage: first.vote_average || 0,
            voteCount: first.vote_count || 0,
            popularity: first.popularity || 0,
            historicalScore: Math.min(100, score),
            category: 'imported',
            status: 'unseen'
          });
          existingIds.add(id);
          added++;
        }
      }
    } catch (e) {
      console.warn("Letterboxd matching error for title:", item.title, e);
    }
  }

  if (added > 0) {
    saveStoredCandidates(existing);
  }
  return { added, matched };
};
