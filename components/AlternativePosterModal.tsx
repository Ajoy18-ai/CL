import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Image as ImageIcon, Loader2, Check, SlidersHorizontal } from 'lucide-react';
import { useStore } from '../store/useStore';

interface Poster {
  url: string;
  source: string;
}

interface AlternativePosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  tmdbId: number;
  type: 'movie' | 'tv';
  onSelect: (url: string) => void;
  currentPosterUrl?: string;
  title?: string;
}

export const AlternativePosterModal: React.FC<AlternativePosterModalProps> = ({
  isOpen,
  onClose,
  tmdbId,
  type,
  onSelect,
  currentPosterUrl,
  title = "Alternative Posters"
}) => {
  const { setIsPosterModalOpen } = useStore();
  const [posters, setPosters] = useState<Poster[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all'); // 'all', 'tmdb', 'imdb'

  useEffect(() => {
    if (isOpen) {
      setIsPosterModalOpen(true);
    } else {
      setIsPosterModalOpen(false);
    }
    return () => {
      setIsPosterModalOpen(false);
    };
  }, [isOpen, setIsPosterModalOpen]);

  useEffect(() => {
    const root = document.getElementById('root');
    if (isOpen && root) {
      root.style.overflow = 'hidden';
    } else if (root) {
      root.style.overflow = 'auto';
    }
    return () => {
      if (root) root.style.overflow = 'auto';
    };
  }, [isOpen]);

  const fetchPostersClientSide = async (tmdbId: number, type: 'movie' | 'tv'): Promise<Poster[]> => {
    const list: Poster[] = [];

    // 1. Fetch TMDB Posters
    try {
      const tmdbUrl = `https://api.themoviedb.org/3/${type}/${tmdbId}/images?api_key=259cb917c8ad62d5bb68d8025e5badfd`;
      const tmdbResponse = await fetch(tmdbUrl);
      if (tmdbResponse.ok) {
        const tmdbData = await tmdbResponse.json();
        if (tmdbData.posters && Array.isArray(tmdbData.posters)) {
          tmdbData.posters.slice(0, 40).forEach((p: any) => {
            if (p.file_path) {
              list.push({
                url: `https://image.tmdb.org/t/p/w780${p.file_path}`,
                source: "TMDb Alternate"
              });
            }
          });
        }
      }
    } catch (tmdbErr) {
      console.error("Client-side TMDB posters fetch error:", tmdbErr);
    }

    // 2. Map TMDB ID to IMDb ID
    let imdbId = "";
    try {
      if (type === "movie") {
        const movieDetailUrl = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=259cb917c8ad62d5bb68d8025e5badfd`;
        const detailRes = await fetch(movieDetailUrl);
        if (detailRes.ok) {
          const detailData = await detailRes.json();
          imdbId = detailData.imdb_id || "";
        }
      } else {
        const externalIdsUrl = `https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=259cb917c8ad62d5bb68d8025e5badfd`;
        const extRes = await fetch(externalIdsUrl);
        if (extRes.ok) {
          const extData = await extRes.json();
          imdbId = extData.imdb_id || "";
        }
      }
    } catch (idErr) {
      console.error("Client-side IMDb ID retrieval error:", idErr);
    }

    // 3. Query IMDb High-Res Databases
    if (imdbId) {
      // Option A: imdb8 API (API-Dojo)
      try {
        const imdb8Url = `https://imdb8.p.rapidapi.com/title/get-images?tconst=${imdbId}&limit=40`;
        const response = await fetch(imdb8Url, {
          headers: {
            "x-rapidapi-key": "f91e3d503dmsh698c9a6917375fcp1c8dc5jsn40d873d2a23c",
            "x-rapidapi-host": "imdb8.p.rapidapi.com"
          }
        });
        if (response.ok) {
          const data = await response.json();
          if (data && Array.isArray(data.images)) {
            data.images.forEach((img: any) => {
              if (img.url) {
                list.push({
                  url: img.url,
                  source: "IMDb Movie Database"
                });
              }
            });
          }
        }
      } catch (imdb8Err) {
        console.warn("Client-side IMDb8 API fetch error:", imdb8Err);
      }

      // Option B: MoviesDatabase API (Failover)
      try {
        const moviesDbUrl = `https://moviesdatabase.p.rapidapi.com/titles/${imdbId}/images?limit=40`;
        const response = await fetch(moviesDbUrl, {
          headers: {
            "x-rapidapi-key": "f91e3d503dmsh698c9a6917375fcp1c8dc5jsn40d873d2a23c",
            "x-rapidapi-host": "moviesdatabase.p.rapidapi.com"
          }
        });
        if (response.ok) {
          const data = await response.json();
          if (data && data.results && Array.isArray(data.results)) {
            data.results.forEach((item: any) => {
              const imgUrl = item.image?.url || item.url;
              if (imgUrl) {
                list.push({
                  url: imgUrl,
                  source: "IMDb Database"
                });
              }
            });
          }
        }
      } catch (moviesDbErr) {
        console.warn("Client-side MoviesDatabase API fetch error:", moviesDbErr);
      }
    }

    // Deduplicate
    const seenUrls = new Set<string>();
    const uniquePosters = list.filter(p => {
      if (!p.url) return false;
      const urlKey = p.url.trim().toLowerCase();
      if (seenUrls.has(urlKey)) return false;
      seenUrls.add(urlKey);
      return true;
    });

    return uniquePosters;
  };

  const fetchPosters = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let data = null;
      try {
        const response = await fetch(`/api/media/posters?tmdbId=${tmdbId}&type=${type}`);
        if (response.ok) {
          data = await response.json();
        } else {
          console.warn("Backend API not found or error. Falling back to client-side TMDB/IMDb poster fetch.");
          data = await fetchPostersClientSide(tmdbId, type);
        }
      } catch (e) {
        console.warn("Backend API call failed. Falling back to client-side TMDB/IMDb poster fetch.", e);
        data = await fetchPostersClientSide(tmdbId, type);
      }

      setPosters(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while loading alternative posters.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && tmdbId) {
      fetchPosters();
    }
  }, [isOpen, tmdbId, type]);

  const filteredPosters = posters.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'tmdb') return p.source.toLowerCase().includes('tmdb');
    if (filter === 'imdb') return p.source.toLowerCase().includes('imdb');
    return true;
  });

  const sources = Array.from(new Set(posters.map(p => p.source)));

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/95 md:backdrop-blur-xl"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ transform: 'translateZ(0)' }}
            className="relative w-full max-w-4xl h-[85vh] bg-[#09090b] rounded-[2.5rem] border border-white/5 shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="h-[60px] flex justify-between items-center px-8 border-b border-white/5 shrink-0">
              <h3 className="text-sm font-bold tracking-tight text-white uppercase italic">
                Posters: {title.replace(/^Alternative Posters:\s*/i, '')}
              </h3>
              <button
                onClick={onClose}
                className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl transition-colors border border-white/5 active:scale-90"
              >
                <X size={14} />
              </button>
            </div>

            {/* Filter Source Tabs */}
            {!isLoading && posters.length > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-8 py-4 bg-black/30 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal size={12} className="text-zinc-600" />
                  <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mr-2">Filter Source:</span>
                  <div className="flex bg-black p-1 rounded-xl border border-white/5 shadow-inner">
                    <button
                      onClick={() => setFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${filter === 'all' ? 'bg-[#9b5cff]/20 text-white border border-[#9b5cff]/25' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      All ({posters.length})
                    </button>
                    {sources.some(s => s.toLowerCase().includes('tmdb')) && (
                      <button
                        onClick={() => setFilter('tmdb')}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${filter === 'tmdb' ? 'bg-purple-500/20 text-white border border-purple-500/25' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        TMDb
                      </button>
                    )}
                    {sources.some(s => s.toLowerCase().includes('imdb')) && (
                      <button
                        onClick={() => setFilter('imdb')}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${filter === 'imdb' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/25' : 'text-zinc-500 hover:text-zinc-300'}`}
                      >
                        IMDb
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Poster Grid Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar p-8">
              {isLoading ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 py-20">
                  <Loader2 className="animate-spin text-purple-500" size={36} />
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest italic animate-pulse">
                    Querying TMDb and scraping IMDb...
                  </p>
                </div>
              ) : error ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 py-20">
                  <p className="text-sm font-semibold text-red-500">{error}</p>
                </div>
              ) : posters.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 py-20 text-zinc-500">
                  <p className="text-sm font-semibold">No alternative posters found for this entry.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                  {filteredPosters.map((poster, index) => {
                    const isSelected = currentPosterUrl === poster.url;
                    const isIMDb = poster.source.toLowerCase().includes('imdb');

                    return (
                      <button
                        key={poster.url}
                        onClick={() => {
                          onSelect(poster.url);
                          onClose();
                        }}
                        className={`group relative flex flex-col gap-2 p-1 bg-white/2 rounded-2xl border text-left transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/5 ring-1 ring-purple-500/20'
                            : 'border-white/5 hover:border-white/20 hover:bg-white/5'
                        }`}
                      >
                        <div className="relative aspect-[2/3] w-full rounded-xl overflow-hidden bg-zinc-950">
                          <img
                            src={poster.url}
                            alt={`Poster Option ${index + 1}`}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <div className={`absolute top-2 left-2 px-2 py-1 rounded-md text-[7px] font-black uppercase tracking-widest select-none z-10 ${
                            isIMDb ? 'bg-amber-500/90 text-black border border-amber-400/30' : 'bg-black/80 text-zinc-400 border border-white/5'
                          }`}>
                            {isIMDb ? 'IMDb API' : 'TMDb'}
                          </div>
                          {isSelected && (
                            <div className="absolute inset-0 bg-purple-500/10 flex items-center justify-center backdrop-blur-[2px] z-20">
                              <div className="p-2.5 bg-purple-500 text-white rounded-full shadow-lg border border-purple-400">
                                <Check size={18} strokeWidth={3} />
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
