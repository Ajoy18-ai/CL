import React from 'react';
import { Clock, Search, X, ChevronRight, History, Film, Tv, User, Building2 } from 'lucide-react';
import { RecentSearchItem } from '../types';
import { TMDB_IMAGE_BASE } from '../constants';

interface RecentSearchesBarProps {
  recentSearches: RecentSearchItem[];
  onSelectSearch: (item: RecentSearchItem | string) => void;
  onRemoveSearch: (id: string, e: React.MouseEvent) => void;
  onOpenHistory: () => void;
}

const RecentSearchesBar: React.FC<RecentSearchesBarProps> = ({
  recentSearches,
  onSelectSearch,
  onRemoveSearch,
  onOpenHistory
}) => {
  if (recentSearches.length === 0) return null;

  const displayLimit = 7;
  const visibleSearches = recentSearches.slice(0, displayLimit);
  const remainingCount = recentSearches.length - displayLimit;

  return (
    <div className="flex items-center gap-2 px-2">
      <button
        type="button"
        onClick={onOpenHistory}
        className="p-2 rounded-full text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors cursor-pointer flex-shrink-0 flex items-center justify-center"
        title="Search History"
        aria-label="Search History"
      >
        <Clock size={16} className="text-zinc-500 hover:text-zinc-300 transition-colors" />
      </button>

      {/* Horizontal chip carousel */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1 pt-0.5 min-w-0 flex-1">
        {visibleSearches.map((item) => {
          const imageSrc = item.image || (item.posterPath ? `${TMDB_IMAGE_BASE}${item.posterPath}` : null);
          const isPerson = item.type === 'person';
          const isCompany = item.type === 'company';
          const isTV = item.type === 'tv';
          const isMovie = item.type === 'movie';

          return (
            <div
              key={item.id}
              className="flex-shrink-0 flex items-center rounded-full pl-1.5 pr-2 py-1 bg-[#18181b]/95 hover:bg-[#242429] border border-white/10 hover:border-white/25 text-zinc-300 hover:text-white transition-all duration-200 group shadow-sm active:scale-[0.98]"
            >
              <button
                type="button"
                onClick={() => onSelectSearch(item)}
                className="flex items-center gap-2 text-xs font-bold text-left cursor-pointer"
              >
                {/* Visual Thumbnail or Icon */}
                <div className={`w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-black/60 border border-white/10 flex items-center justify-center ${isPerson ? 'ring-1 ring-white/20' : ''}`}>
                  {imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={item.title || item.query}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : isPerson ? (
                    <User size={11} className="text-zinc-400" />
                  ) : isCompany ? (
                    <Building2 size={11} className="text-zinc-400" />
                  ) : isTV ? (
                    <Tv size={11} className="text-zinc-400" />
                  ) : isMovie ? (
                    <Film size={11} className="text-zinc-400" />
                  ) : (
                    <Search size={11} className="text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                  )}
                </div>

                <div className="flex flex-col min-w-0 pr-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="max-w-[120px] sm:max-w-[160px] truncate text-xs font-bold text-zinc-200 group-hover:text-white">
                      {item.title || item.query}
                    </span>
                    {item.year && (
                      <span className="text-[9px] text-zinc-500 font-mono hidden sm:inline">
                        ({item.year})
                      </span>
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={(e) => onRemoveSearch(item.id, e)}
                aria-label={`Remove "${item.query}" from recent searches`}
                className="ml-1.5 p-1 rounded-full text-zinc-500 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer flex-shrink-0"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}

        {remainingCount > 0 && (
          <button
            type="button"
            onClick={onOpenHistory}
            className="flex-shrink-0 px-3 py-1.5 rounded-full bg-zinc-800/80 hover:bg-zinc-700/80 border border-white/10 hover:border-white/20 text-zinc-300 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap"
          >
            +{remainingCount} More
          </button>
        )}
      </div>
    </div>
  );
};

export default RecentSearchesBar;
