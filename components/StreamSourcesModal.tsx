import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ExternalLink } from 'lucide-react';
import { TMDBResult, WatchEntry } from '../types';

interface StreamSourcesModalProps {
  media?: TMDBResult | WatchEntry | null;
  isOpen: boolean;
  onClose: () => void;
}

const StreamSourcesModal: React.FC<StreamSourcesModalProps> = ({ media, isOpen, onClose }) => {
  // Lock background scroll when modal is open
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

  if (!isOpen || !media) return null;

  const slugify = (text: string) => {
    return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
  };

  const getStreamLink = (service: string) => {
    if (!media) return '#';
    const id = 'tmdbId' in media ? media.tmdbId : media.id;
    const title = 'title' in media ? (media.title || (media as any).name) : (media as any).title;
    const name = slugify(title || '');
    // Fixed type error by using property check to distinguish between WatchEntry and TMDBResult
    const isTv = 'type' in media ? media.type === 'tv' : media.media_type === 'tv';

    switch (service) {
      case 'MULTMOVIES':
        return `https://multimovies.gripe/${isTv ? 'tvshows' : 'movies'}/${name}/`;
      case '1SHOW':
        return `https://www.1shows.nl/${isTv ? 'tv' : 'movies'}/${id}-${name}`;
      case 'TMOVIE':
        if (isTv) return `https://tmovie.tv/tv/${name}-${id}?watch=1&season=1&episode=1`;
        return `https://tmovie.tv/movie/${name}-${id}?watch=1`;
      case 'RGSHOWS':
        return `https://www.rgshows.ru/?p=${isTv ? 1 : 2}&m=${isTv ? 's' : 'm'}-${id}`;
      case 'STREMEX':
        return `https://streamex.net/watch/${isTv ? 'tv' : 'movie'}/${id}?server=streamx`;
      case '1FLEX':
        if (isTv) return `https://www.1flex.nl/play?tmdbid=${id}&season=1&episode=1&type=tv&token=oFM4hh7WtzpddHAL`;
        return `https://www.1flex.nl/play?tmdbid=${id}&type=movie&token=b20qH84VIGDKuxhp`;
      case 'ISHOWMOVIES':
        if (isTv) return `https://ishowmovies.org/watch/tv/${id}`;
        return `https://ishowmovies.org/movie/${id}`;
      case 'FLICKYSTREAM':
        return `https://flickystream.ru/${isTv ? 'tv' : 'movie'}/${id}`;
      case 'RIVESTREAM':
        return `https://rivestream.org/detail?type=${isTv ? 'tv' : 'movie'}&id=${id}`;
      case 'CINEMA.BZ':
        if (isTv) return `https://cinema.bz/watch?id=${id}&type=tv&season=1&episode=1&title=${encodeURIComponent(title || '')}`;
        return `https://cinema.bz/watch?id=${id}&type=movie&title=${encodeURIComponent(title || '')}`;
      case 'Spenflix':
        if (isTv) return `https://watch.spencerdevs.xyz/tv/${id}/watch/1/1`;
        return `https://watch.spencerdevs.xyz/movie/${id}/watch`;
      case 'FILMCAVE':
        return `https://filmcave.ru/${isTv ? 'tv' : 'movie'}/watch/${id}`;
      case 'CINEZO':
        return `https://www.cinezo.net/${isTv ? 'tv-shows' : 'movies'}/${name}-${id}`;
      case 'AUTOEMBED':
        return `https://watch-v2.autoembed.cc/${isTv ? 'tv' : 'movie'}/${id}`;
      default:
        return '#';
    }
  };

  const streamServices = [
    { id: 'MULTMOVIES', name: 'MULTMOVIES', logo: 'https://multimovies.gripe/wp-content/uploads/2023/04/multimovies.jpg' },
    { id: '1SHOW', name: '1SHOW', logo: 'https://tbcpl.lol/logo/movies_shows/1shows.png' },
    { id: 'TMOVIE', name: 'TMOVIE', logo: 'https://tmovietv.com/wp-content/uploads/2026/01/Tmovie.webp' },
    { id: 'RGSHOWS', name: 'RGSHOWS', logo: 'https://tbcpl.lol/logo/movies_shows/rgshows.png' },
    { id: 'STREMEX', name: 'STREMEX', logo: 'https://tbcpl.lol/logo/movies_shows/streamx.png' },
    { id: '1FLEX', name: '1FLEX', logo: 'https://tbcpl.lol/logo/movies_shows/1flex.png' },
    { id: 'ISHOWMOVIES', name: 'ISHOWMOVIES', logo: 'https://tbcpl.lol/logo/movies_shows/alienflix.png' },
    { id: 'FLICKYSTREAM', name: 'FLICKYSTREAM', logo: 'https://tbcpl.lol/logo/movies_shows/flickystream.png' },
    { id: 'RIVESTREAM', name: 'RIVESTREAM', logo: 'https://tbcpl.lol/logo/movies_shows/rivestream.png' },
    { id: 'CINEMA.BZ', name: 'CINEMA.BZ', logo: 'https://tbcpl.lol/logo/movies_shows/cinemabz.png' },
    { id: 'Spenflix', name: 'Spenflix', logo: 'https://tbcpl.lol/logo/movies_shows/spenflix.png' },
    { id: 'FILMCAVE', name: 'FILMCAVE', logo: 'https://tbcpl.lol/logo/movies_shows/filmcave.png' },
    { id: 'CINEZO', name: 'CINEZO', logo: 'https://tbcpl.lol/logo/movies_shows/cinezo.png' },
    { id: 'AUTOEMBED', name: 'AUTOEMBED', logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAMAAABEpIrGAAAARVBMVEVHcEwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABvb29iYmLo6Oj////W1tbGxsaAgIChoaGSkpIgICCxsbHz8/NMTEwAAABc+8W6AAAAF3RSTlMAT5TK6/8Rph3/////////////////y9C1RkEAAAEASURBVHgBdFEHEgMhCLziXhO75v9PzTFjwLS1K7ArTAPmZTWAWZd5+oFtx4B9+3xf8IHl3d3gC2YIcuAnDvHHH7xiGPyB+dR3XjhP7qL0ncBSh3sjkf97CpF7SuQlH7eBvntk7rwt6LjzKwQSeNzPIjFXqrajklWZa9/dxN6T9d4Sb0K/XiUJFzWAuX0FTmqSCuGlCFQPOAsUkms1qA6wMtTA6DfB3hyFqYTiAVGZmZ8fG0m2V/nmfRuYm7WwbceiiWLXyAaJ2TRRopIFJEKmwDJeGItVqEU6A6WL4lisTUUI8lhulZmvjucQCYZQkiOYaAkme8IZh3DWI5x5CWZ/AK/rFj92qebeAAAAAElFTkSuQmCC' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 md:p-12 overflow-hidden">
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
            className="relative w-full max-w-2xl bg-[#0c0c0e] rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="p-8 md:p-10 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="space-y-1">
                <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tighter italic leading-none">Stream Sources</h2>
                <p className="text-purple-500 font-black uppercase tracking-[0.3em] text-[10px]">Watch {('title' in media ? media.title : (media as any).name) || 'Media'}</p>
              </div>
              <button
                onClick={onClose}
                className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 text-zinc-600 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-4 overscroll-contain">
              <div className="grid grid-cols-1 gap-3">
                {streamServices.map((service) => (
                  <a
                    key={service.id}
                    href={getStreamLink(service.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full p-5 rounded-[2rem] bg-white/5 border border-white/5 hover:bg-white/10 hover:border-purple-500/20 transition-all group flex items-center justify-between shadow-xl active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-14 h-14 bg-black rounded-2xl p-1 overflow-hidden border border-white/5 shadow-inner flex items-center justify-center group-hover:border-purple-500/20 transition-colors">
                        <img src={service.logo} alt={service.name} className="w-full h-full object-contain rounded-lg" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-black text-sm uppercase tracking-tight italic text-zinc-300 group-hover:text-white transition-colors">
                          {service.name}
                        </h3>
                        <p className="text-[9px] font-black uppercase tracking-widest text-zinc-700">
                          Source Provider
                        </p>
                      </div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-zinc-700 group-hover:text-purple-400 group-hover:bg-purple-500/10 transition-all">
                      <ExternalLink size={16} />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default StreamSourcesModal;