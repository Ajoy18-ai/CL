
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Award, Bookmark, Activity, Download, Upload,
  FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, X,
  ShieldAlert, Trash2, Search, ChevronDown, ChevronUp,
  Compass, Star, Sparkles, Database, RefreshCcw, Heart, Cloud,
  ShieldCheck, ShieldX, List as ListIcon, Film, Tv, ArrowRight, History
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { USER_AVATAR, TMDB_BASE_URL, TMDB_KEY, TMDB_IMAGE_BASE } from '../constants';
import { useStore } from '../store/useStore';
import { useToastStore } from '../store/useToastStore';
import { Rating, WatchEntry, WatchListItem } from '../types';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip
} from 'recharts';

const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxYfvcf-Xtjoen9HSMAtgQF3He3EQVJMHx7l5Ziz18w01pkQ2vE4DbWy3WYndz-fQtlfg/exec';

const Profile: React.FC = () => {
  const toast = useToastStore();
  const {
    watchLists, entries, addEntry, addWatchList,
    updateWatchList, removeEntry, refreshEntries, refreshWatchLists,
    migrateLegacyData, isCloudConnected, blockMediaId, blockedIds
  } = useStore();
  const navigate = useNavigate();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [purgeId, setPurgeId] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  // TMDB ID Search States
  const [showTmdbIdLookup, setShowTmdbIdLookup] = useState(false);
  const [tmdbIdInput, setTmdbIdInput] = useState('');
  const [tmdbMediaType, setTmdbMediaType] = useState<'movie' | 'tv'>('movie');
  const [tmdbSearchResult, setTmdbSearchResult] = useState<any | null>(null);
  const [isSearchingTmdbId, setIsSearchingTmdbId] = useState(false);
  const [tmdbSearchError, setTmdbSearchError] = useState<string | null>(null);

  const handleTmdbIdSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const id = tmdbIdInput.trim();
    if (!id) {
      toast.error('Please enter a valid numeric TMDB ID.');
      return;
    }

    if (isNaN(Number(id))) {
      setTmdbSearchError('The TMDB ID must be a numeric value.');
      setTmdbSearchResult(null);
      return;
    }

    setIsSearchingTmdbId(true);
    setTmdbSearchError(null);
    setTmdbSearchResult(null);

    try {
      const response = await fetch(`${TMDB_BASE_URL}/${tmdbMediaType}/${id}?api_key=${TMDB_KEY}&language=en-US`);
      if (!response.ok) {
        throw new Error('Could not find media item with this ID.');
      }
      const data = await response.json();
      setTmdbSearchResult(data);
    } catch (err: any) {
      setTmdbSearchError(err.message || 'Unable to resolve TMDB ID. Please verify the ID and selected media type.');
      toast.error('Unable to find any title matching this TMDB ID.');
    } finally {
      setIsSearchingTmdbId(false);
    }
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Google Sheets Configuration with default URL pre-set
  const [gasUrl, setGasUrl] = useState(localStorage.getItem('cinelog_gas_url') || DEFAULT_GAS_URL);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalItems = watchLists.reduce((acc, list) => acc + (list.items?.length || 0), 0);

  const hallOfFame = useMemo(() => {
    return entries.filter(e => e.isFavorite).sort((a, b) => new Date(b.watchDate).getTime() - new Date(a.watchDate).getTime());
  }, [entries]);

  const lifetimeStats = useMemo(() => {
    const genreMap: Record<string, number> = {};
    const monthMap: Record<string, number> = {};

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleString('default', { month: 'short' });
      monthMap[key] = 0;
    }

    entries.forEach(e => {
      if (e.genres) {
        e.genres.forEach(g => {
          genreMap[g] = (genreMap[g] || 0) + 1;
        });
      }
      const d = new Date(e.watchDate);
      const key = d.toLocaleString('default', { month: 'short' });
      if (monthMap.hasOwnProperty(key)) {
        monthMap[key]++;
      }
    });

    const radarData = Object.entries(genreMap)
      .map(([subject, A]) => ({ subject, A, fullMark: 50 }))
      .sort((a, b) => b.A - a.A)
      .slice(0, 6);

    const lineData = Object.entries(monthMap).map(([name, value]) => ({ name, value }));

    return { radarData, lineData };
  }, [entries]);

  const handleManualRecovery = async () => {
    setIsProcessing(true);
    migrateLegacyData();
    await refreshEntries();
    await refreshWatchLists();
    setIsProcessing(false);
    toast.success('Your legacy cinema diary data has been successfully restored and migrated to the local archive!');
  };

  const handleBackupToSheets = async () => {
    if (!gasUrl) {
      setShowAdvanced(true);
      toast.error('Cloud backup URL is missing. Please paste your custom Google Apps Script URL under "Cloud Sync Configuration" below to enable syncing.');
      return;
    }

    setIsSyncing(true);
    try {
      const payload = (entries || []).filter(Boolean).map(e => ({
        id: e.id,
        tmdbId: e.tmdbId || 0,
        type: e.type || 'movie',
        title: e.title || '',
        watchDate: e.watchDate || '',
        rating: e.rating || Rating.GOOD,
        year: e.year || 0,
        runtime: e.runtime || 0,
        genres: (e.genres || []).join(', '),
        isRewatch: e.isRewatch ? 'Yes' : 'No',
        isAbsoluteCinema: e.isAbsoluteCinema ? 'Yes' : 'No',
        isFavorite: e.isFavorite ? 'Yes' : 'No',
        review: e.review || '',
        createdAt: e.createdAt || ''
      }));

      const response = await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      toast.success('Cloud backup started successfully! Your cinema records are now syncing directly to your connected Google Sheet.');
    } catch (error) {
      toast.error('The cloud sync could not be completed. Please check your internet connection or verify that your Google Apps Script URL is correct.');
    } finally {
      setIsSyncing(false);
    }
  };

  const saveGasUrl = (url: string) => {
    setGasUrl(url);
    localStorage.setItem('cinelog_gas_url', url);
  };

  // Content Shield / Purge Logic
  const handlePurgeAndBlock = async () => {
    const q = purgeId.trim();
    if (!q || isProcessing) return;

    setIsProcessing(true);

    try {
      // If it's a numeric TMDB ID, block it from search results too
      const tmdbId = parseInt(q);
      if (!isNaN(tmdbId)) {
        await blockMediaId(tmdbId);
        toast.success(`TMDB ID ${tmdbId} has been added to your Content Shield. It is now blocked from search results and wiped from your diary.`);
      } else {
        // Text based purge (remove from diary only)
        const entriesToPurge = (entries || []).filter(Boolean).filter(e =>
          (e?.title || '').toLowerCase().includes(q.toLowerCase())
        );

        if (entriesToPurge.length === 0) {
          toast.error('No matching records were found in your watch diary to wipe. Please double-check the spelling of the movie or show title.');
        } else {
          for (const entry of entriesToPurge) {
            await removeEntry(entry.id);
          }
          toast.success(`Successfully removed ${entriesToPurge.length} diary records matching your search query.`);
        }
      }
      setPurgeId('');
    } catch (err) {
      toast.error('The action failed to execute. Please refresh the page or try again in a few moments.');
    } finally {
      setIsProcessing(false);
    }
  };

  const exportLibraryToCSV = () => {
    const headers = [
      'RecordType', 'ListName', 'tmdbId', 'MediaType', 'Title',
      'Date', 'Rating', 'IsVague', 'IsAbsoluteCinema', 'IsRewatch', 'IsFavorite',
      'Review', 'Genres', 'Runtime', 'PosterUrl'
    ];

    const rows: string[][] = [];

    (entries || []).forEach(e => {
      if (!e) return;
      rows.push([
        'DIARY_ENTRY',
        '',
        (e.tmdbId || 0).toString(),
        e.type || 'movie',
        `"${(e.title || '').replace(/"/g, '""')}"`,
        e.watchDate || '',
        e.rating || '',
        e.isVague ? 'TRUE' : 'FALSE',
        e.isAbsoluteCinema ? 'TRUE' : 'FALSE',
        e.isRewatch ? 'TRUE' : 'FALSE',
        e.isFavorite ? 'TRUE' : 'FALSE',
        `"${(e.review || '').replace(/"/g, '""')}"`,
        `"${(e.genres || []).join('|')}"`,
        (e.runtime || 0).toString(),
        `"${e.posterUrl || ''}"`
      ]);
    });

    (watchLists || []).forEach(list => {
      if (!list) return;
      (list.items || []).forEach(item => {
        if (!item) return;
        rows.push([
          'WATCHLIST_ITEM',
          `"${(list.name || '').replace(/"/g, '""')}"`,
          (item.tmdbId || 0).toString(),
          item.type || 'movie',
          `"${(item.title || '').replace(/"/g, '""')}"`,
          item.addedAt || '',
          '', '', '', '', '', '', '', '',
          `"${item.posterUrl || ''}"`
        ]);
      });
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `cinelog_full_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      try {
        await processCSVImport(content);
        toast.success('Your cinema library was imported successfully! We merged all diary entries and watchlists into your local archive.');
      } catch (err) {
        console.error(err);
        toast.error('Unable to parse the CSV file. Please make sure the file is a valid CineLog export and has not been altered or corrupted.');
      } finally {
        setIsProcessing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  const processCSVImport = async (csvText: string) => {
    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length < 2) return;

    const parseCSVLine = (line: string) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i+1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const headerMap = headers.reduce((acc, h, i) => ({ ...acc, [h]: i }), {} as Record<string, number>);

    const watchlistGroups: Record<string, WatchListItem[]> = {};

    for (let i = 1; i < lines.length; i++) {
      const v = parseCSVLine(lines[i]);
      const recordType = v[headerMap['RecordType']];

      if (recordType === 'DIARY_ENTRY') {
        const entry: Omit<WatchEntry, 'id'> = {
          tmdbId: parseInt(v[headerMap['tmdbId']]),
          type: v[headerMap['MediaType']] as 'movie' | 'tv',
          title: v[headerMap['Title']],
          watchDate: v[headerMap['Date']],
          rating: v[headerMap['Rating']] as Rating,
          isVague: v[headerMap['IsVague']] === 'TRUE',
          isAbsoluteCinema: v[headerMap['IsAbsoluteCinema']] === 'TRUE',
          isRewatch: v[headerMap['IsRewatch']] === 'TRUE',
          isFavorite: v[headerMap['IsFavorite']] === 'TRUE',
          review: v[headerMap['Review']],
          genres: v[headerMap['Genres']] ? v[headerMap['Genres']].split('|') : [],
          runtime: parseInt(v[headerMap['Runtime']] || '0'),
          year: new Date(v[headerMap['Date']]).getFullYear(),
          posterUrl: v[headerMap['PosterUrl']]
        };
        await addEntry(entry);
      } else if (recordType === 'WATCHLIST_ITEM') {
        const listName = v[headerMap['ListName']];
        const item: WatchListItem = {
          tmdbId: parseInt(v[headerMap['tmdbId']]),
          type: v[headerMap['MediaType']] as 'movie' | 'tv',
          title: v[headerMap['Title']],
          posterUrl: v[headerMap['PosterUrl']],
          addedAt: v[headerMap['Date']]
        };
        if (!watchlistGroups[listName]) watchlistGroups[listName] = [];
        watchlistGroups[listName].push(item);
      }
    }

    for (const [name, items] of Object.entries(watchlistGroups)) {
      const existing = (watchLists || []).find(l => l && l.name === name);
      if (existing) {
        const mergedItems = [...(existing.items || []).filter(Boolean)];
        items.forEach(newItem => {
          if (newItem && !mergedItems.some(mi => mi && mi.tmdbId === newItem.tmdbId)) {
            mergedItems.push(newItem);
          }
        });
        await updateWatchList(existing.id, { items: mergedItems });
      } else {
        await addWatchList(name, items.filter(Boolean));
      }
    }

    await refreshEntries();
    await refreshWatchLists();
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-black/90 backdrop-blur-md border border-white/10 p-2 rounded-lg shadow-xl">
          <p className="text-[8px] font-black text-purple-400 uppercase tracking-widest">{label}</p>
          <p className="text-sm font-black text-white italic">{payload[0].value} Titles</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-16 max-w-2xl mx-auto text-center p-6 md:p-8 pt-0 md:pt-4">
      {/* Top Bar with Backlog Stock Icon Entry Point in Top-Right */}
      <div className="flex items-center justify-end w-full -mb-8">
        <Link
          to="/backlog"
          aria-label="Backlog"
          title="Backlog"
          className="group relative w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-900/40 via-[#18181b]/90 to-black border border-purple-500/25 hover:border-purple-400/60 flex items-center justify-center transition-all duration-300 ease-out shadow-[0_4px_20px_rgba(155,92,255,0.18)] hover:shadow-[0_0_25px_rgba(155,92,255,0.45)] hover:scale-105 active:scale-95 z-20 backdrop-blur-md"
        >
          <History
            size={18}
            className="text-purple-300 group-hover:text-white transition-all duration-300 group-hover:rotate-[-25deg]"
          />
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#b88aff] shadow-[0_0_8px_#b88aff] animate-pulse pointer-events-none" />
        </Link>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".csv"
      />

      <div className="space-y-8 flex flex-col items-center">
        <div className="relative">
          <div className="w-40 h-40 md:w-52 md:h-52 rounded-full p-1 bg-[#9b5cff] shadow-[0_0_60px_rgba(155,92,255,0.3)]">
            <div className="w-full h-full rounded-full bg-[#09090b] border-[6px] border-[#09090b] overflow-hidden">
              <img
                src={USER_AVATAR}
                alt="AJOY SAHA"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
          <div className="absolute bottom-4 right-4 bg-[#9b5cff] text-white p-2.5 rounded-xl shadow-2xl border-[3px] border-[#09090b] z-10 flex items-center justify-center">
             <Award size={16} fill="white" strokeWidth={1.5} />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-display font-[900] italic tracking-[-0.05em] uppercase text-white leading-none">AJOY SAHA</h1>
          <p className="text-zinc-400 font-black uppercase tracking-[0.4em] text-caption">Platinum Member • Story Curator</p>
        </div>
      </div>

      <section className="space-y-6 text-left bg-purple-500/5 border border-purple-500/10 p-8 rounded-[3rem]">
        <div className="flex items-center gap-3">
          <Database size={14} className="text-[#b88aff]" />
          <h3 className="text-caption font-black uppercase tracking-[0.4em] text-[#b88aff]">System Integrity</h3>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-caption font-black text-zinc-400 uppercase tracking-widest">Active Records</p>
            <p className="text-h2 font-black text-white italic">{entries.length}</p>
          </div>
          <div className="space-y-1">
            <p className="text-caption font-black text-zinc-400 uppercase tracking-widest">Sync Status</p>
            <p className={`text-h2 font-black italic ${isCloudConnected ? 'text-emerald-500' : 'text-amber-500'}`}>
              {isCloudConnected ? 'Stable' : 'Local Only'}
            </p>
          </div>
        </div>

        <button
          onClick={handleManualRecovery}
          disabled={isProcessing}
          className="w-full py-5 bg-[#8b5cf6] text-white rounded-2xl font-black text-caption uppercase tracking-[0.3em] italic flex items-center justify-center gap-3 shadow-2xl shadow-purple-500/20 active:scale-95 transition-all"
        >
          {isProcessing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
          {isProcessing ? 'Recovering Archives...' : 'Force Data Recovery'}
        </button>
      </section>



      {/* Hall of Fame section */}
      <section className="space-y-8 text-left">
        <div className="flex items-center gap-3 px-2">
          <Heart size={14} className="text-[#9b5cff] fill-[#9b5cff]" />
          <h3 className="text-caption font-black uppercase tracking-[0.4em] text-zinc-400">The Hall of Fame</h3>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        {hallOfFame.length > 0 ? (
          <div className="flex overflow-x-auto no-scrollbar gap-5 px-2 -mx-2 pb-4">
            {hallOfFame.map((fav) => (
              <motion.button
                key={fav.id}
                whileHover={{ y: -8, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/?search=${encodeURIComponent(fav.title)}`)}
                className="shrink-0 group"
              >
                <div className="w-36 md:w-44 aspect-[2/3] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-2xl relative">
                  <img src={fav.posterUrl} referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={fav.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                    <p className="text-caption font-black text-white uppercase italic tracking-tighter truncate w-full">{fav.title}</p>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="bg-[#111114] border border-dashed border-white/5 p-12 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 text-center">
            <Heart size={32} className="text-zinc-800" />
            <p className="text-caption font-black text-zinc-500 uppercase tracking-widest max-w-[180px]">Love/Like logs to feature them here.</p>
          </div>
        )}
      </section>

      {/* Analytics */}
      <div className="space-y-6 text-left">
        <div className="flex items-center gap-3 px-2">
          <Activity size={14} className="text-purple-500" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-400">Lifetime Analytics</h3>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#111114] border border-white/[0.04] p-6 rounded-[2rem] shadow-xl space-y-4 min-h-[300px] flex flex-col">
            <p className="text-[9px] font-black text-zinc-400 uppercase tracking-widest text-center">Genre DNA Profile</p>
            <div className="flex-1 w-full min-h-[200px]">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={lifetimeStats.radarData}>
                    <PolarGrid stroke="#27272a" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 8, fontWeight: 800 }} />
                    <Radar
                      name="Ajoy"
                      dataKey="A"
                      stroke="#9b5cff"
                      fill="#9b5cff"
                      fillOpacity={0.4}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-[#111114] border border-white/[0.04] p-6 rounded-[2rem] shadow-xl space-y-4 min-h-[300px] flex flex-col">
            <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest text-center">Cinematic Velocity</p>
            <div className="flex-1 w-full min-h-[200px]">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <LineChart data={lifetimeStats.lineData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" hide />
                    <YAxis hide />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#00f5a0"
                      strokeWidth={4}
                      dot={{ r: 4, fill: '#00f5a0', strokeWidth: 0 }}
                      activeDot={{ r: 8, stroke: 'rgba(0, 245, 160, 0.2)', strokeWidth: 10 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="space-y-3 pt-4">
        <motion.div whileHover={{ y: -2 }} className="bg-[#111114] border border-white/[0.04] p-6 rounded-[2rem] flex items-center justify-between shadow-xl">
           <div className="flex items-center gap-5">
             <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
               <Compass size={20} className="text-purple-400" />
             </div>
             <div className="text-left">
               <h3 className="font-black text-sm text-white uppercase tracking-tight">Explore Discovery</h3>
               <p className="text-[10px] font-bold text-zinc-700 mt-0.5 uppercase tracking-widest">Talent, Studios & Origins</p>
             </div>
           </div>
           <Link to="/explore" className="text-[9px] font-black text-[#9b5cff] tracking-[0.2em] uppercase hover:text-white transition-colors">EXPLORE</Link>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="bg-[#111114] border border-white/[0.04] p-6 rounded-[2rem] flex items-center justify-between shadow-xl">
           <div className="flex items-center gap-5">
             <div className="w-12 h-12 rounded-2xl bg-[#9b5cff]/10 flex items-center justify-center">
               <ListIcon size={20} className="text-[#9b5cff]" />
             </div>
             <div className="text-left">
               <h3 className="font-black text-sm text-white uppercase tracking-tight">Cinematic Lists</h3>
               <p className="text-[10px] font-bold text-zinc-700 mt-0.5 uppercase tracking-widest">Custom Collections & Imports</p>
             </div>
           </div>
           <Link to="/lists" className="text-[9px] font-black text-[#9b5cff] tracking-[0.2em] uppercase hover:text-white transition-colors">MANAGE</Link>
        </motion.div>

        <motion.div whileHover={{ y: -2 }} className="bg-[#111114] border border-white/[0.04] p-6 rounded-[2rem] flex items-center justify-between shadow-xl">
           <div className="flex items-center gap-5">
             <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
               <Bookmark size={20} className="text-zinc-500" />
             </div>
             <div className="text-left">
               <h3 className="font-black text-sm text-white uppercase tracking-tight">Watch List</h3>
               <p className="text-[10px] font-bold text-zinc-700 mt-0.5 uppercase tracking-widest">{totalItems} Items Saved</p>
             </div>
           </div>
           <Link to="/watchlist" className="text-[9px] font-black text-[#9b5cff] tracking-[0.2em] uppercase hover:text-white transition-colors">VIEW ALL</Link>
         </motion.div>
      </div>

      {/* Archives & Backups */}
      <div className="space-y-8 pt-8 text-left">
        <div className="flex items-center gap-3 px-2">
          <FileSpreadsheet size={14} className="text-zinc-500" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">Archives & Backups</h3>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={exportLibraryToCSV}
            className="group flex items-center justify-between p-6 bg-[#111114] border border-white/[0.04] rounded-[2rem] shadow-xl hover:border-white/10 transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                <Download size={18} />
              </div>
              <div className="text-left">
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">CSV</p>
                <h4 className="font-black text-sm text-white uppercase tracking-tight">Export</h4>
              </div>
            </div>
          </button>

          <button
            onClick={handleImportClick}
            disabled={isProcessing}
            className="group flex items-center justify-between p-6 bg-[#111114] border border-white/[0.04] rounded-[2rem] shadow-xl hover:border-[#9b5cff]/30 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#9b5cff]/10 flex items-center justify-center text-[#9b5cff] group-hover:bg-[#9b5cff] group-hover:text-white transition-all">
                {isProcessing ? <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" /> : <Upload size={18} />}
              </div>
              <div className="text-left">
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Restore</p>
                <h4 className="font-black text-sm text-white uppercase tracking-tight">Import</h4>
              </div>
            </div>
          </button>

          <button
            onClick={handleBackupToSheets}
            disabled={isSyncing}
            className="group flex items-center justify-between p-6 bg-[#111114] border border-white/[0.04] rounded-[2rem] shadow-xl hover:border-emerald-500/30 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                {isSyncing ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} />}
              </div>
              <div className="text-left">
                <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Google Sheets</p>
                <h4 className="font-black text-sm text-white uppercase tracking-tight">Cloud Sync</h4>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* TMDB Direct ID Search Toggle */}
      <div className="pt-8 border-t border-white/5 text-left">
        <button
          onClick={() => setShowTmdbIdLookup(!showTmdbIdLookup)}
          className="group flex items-center justify-between w-full md:w-auto px-6 py-3.5 bg-[#111114]/40 border border-white/[0.04] hover:border-[#9b5cff]/30 hover:bg-purple-950/10 rounded-2xl shadow-md transition-all duration-300 active:scale-[0.98]"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#9b5cff]/10 flex items-center justify-center text-[#9b5cff] group-hover:bg-[#9b5cff] group-hover:text-white transition-all duration-300">
              <Sparkles size={14} className="animate-pulse" />
            </div>
            <div className="text-left">
              <p className="text-[9px] font-black text-zinc-500 group-hover:text-zinc-400 uppercase tracking-widest">Advanced Tools</p>
              <h4 className="font-black text-xs text-zinc-400 group-hover:text-white uppercase tracking-tight flex items-center gap-2">
                Direct TMDB ID Lookup
                <ChevronDown size={14} className={`transition-transform duration-300 ${showTmdbIdLookup ? 'rotate-180 text-purple-400' : 'text-zinc-600'}`} />
              </h4>
            </div>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {showTmdbIdLookup && (
            <motion.div
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 24 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div>
                <section className="space-y-6 text-left bg-gradient-to-br from-zinc-950/80 to-zinc-900/40 border border-white/5 p-8 rounded-[2.5rem] relative overflow-hidden shadow-2xl backdrop-blur-md">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-purple-500/5 rounded-full blur-[60px] pointer-events-none animate-pulse" />

                  <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                    <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-[#9b5cff]">
                      <Sparkles size={14} />
                    </div>
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-widest text-white">Direct ID Lookup</h3>
                      <p className="text-[10px] text-zinc-500 font-medium mt-0.5">Bypass keyword search indexing delay and fetch directly by ID.</p>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
                    If a newly released or obscure title is not appearing via general search query keywords, look up its numeric ID on <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300 underline transition-colors">The Movie Database (TMDB)</a> and fetch its raw metadata directly.
                  </p>

                  <form onSubmit={handleTmdbIdSearch} className="space-y-4">
                    {/* Media Type Toggle */}
                    <div className="relative flex bg-zinc-900/60 p-1 rounded-xl border border-white/5 gap-1 max-w-sm">
                      <button
                        type="button"
                        onClick={() => {
                          setTmdbMediaType('movie');
                          setTmdbSearchResult(null);
                          setTmdbSearchError(null);
                        }}
                        className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 ${
                          tmdbMediaType === 'movie'
                            ? 'bg-[#9b5cff] text-white shadow-lg shadow-purple-500/20'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <Film size={12} />
                        Movie
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTmdbMediaType('tv');
                          setTmdbSearchResult(null);
                          setTmdbSearchError(null);
                        }}
                        className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 ${
                          tmdbMediaType === 'tv'
                            ? 'bg-[#9b5cff] text-white shadow-lg shadow-purple-500/20'
                            : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                        }`}
                      >
                        <Tv size={12} />
                        TV Show
                      </button>
                    </div>

                    {/* Search Input */}
                    <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
                      <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 transition-colors" size={14} />
                        <input
                          type="text"
                          placeholder={`Enter TMDB ${tmdbMediaType === 'movie' ? 'Movie' : 'TV'} ID (e.g. ${tmdbMediaType === 'movie' ? '299534' : '1399'})...`}
                          value={tmdbIdInput}
                          onChange={(e) => setTmdbIdInput(e.target.value)}
                          className="w-full bg-zinc-950/60 border border-white/10 rounded-xl pl-11 pr-4 py-3.5 text-xs font-mono tracking-wider text-white outline-none focus:border-[#9b5cff]/50 focus:ring-1 focus:ring-[#9b5cff]/20 transition-all placeholder:text-zinc-700"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSearchingTmdbId || !tmdbIdInput.trim()}
                        className="px-8 py-3.5 bg-gradient-to-r from-purple-600 to-[#9b5cff] hover:from-purple-500 hover:to-purple-400 disabled:from-zinc-800 disabled:to-zinc-800 disabled:text-zinc-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg hover:shadow-purple-500/15 active:scale-95 shrink-0"
                      >
                        {isSearchingTmdbId ? (
                          <>
                            <Loader2 className="animate-spin" size={12} />
                            Fetching...
                          </>
                        ) : (
                          'Fetch Details'
                        )}
                      </button>
                    </div>
                  </form>

                  {/* Search Results Display */}
                  <AnimatePresence mode="wait">
                    {tmdbSearchResult && (
                      <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        className="mt-6 p-6 bg-zinc-900/30 border border-purple-500/10 rounded-[2rem] flex flex-col md:flex-row gap-6 items-start relative overflow-hidden"
                      >
                        <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/[0.02] to-transparent pointer-events-none" />

                        <div className="w-24 md:w-32 shrink-0 aspect-[2/3] rounded-2xl overflow-hidden border border-white/5 bg-zinc-950 shadow-2xl relative group">
                          <img
                            src={
                              tmdbSearchResult.poster_path
                                ? `${TMDB_IMAGE_BASE}${tmdbSearchResult.poster_path}`
                                : 'https://via.placeholder.com/500x750?text=No+Poster'
                            }
                            alt={tmdbSearchResult.title || tmdbSearchResult.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>

                        <div className="flex-1 space-y-3.5 min-w-0 text-left">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full bg-[#9b5cff]/10 text-[#9b5cff] border border-[#9b5cff]/15 text-[8px] font-black uppercase tracking-wider">
                              {tmdbMediaType === 'movie' ? 'Movie' : 'Series'}
                            </span>
                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                              {(tmdbSearchResult.release_date || tmdbSearchResult.first_air_date)?.split('-')[0] || 'Unknown Year'}
                            </span>
                            {tmdbSearchResult.vote_average && (
                              <span className="flex items-center gap-1 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                                <Star size={10} className="fill-amber-500" />
                                {Number(tmdbSearchResult.vote_average).toFixed(1)}
                              </span>
                            )}
                            {(tmdbSearchResult.runtime || tmdbSearchResult.number_of_seasons) && (
                              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                • {tmdbSearchResult.runtime ? `${tmdbSearchResult.runtime} min` : `${tmdbSearchResult.number_of_seasons} Season${tmdbSearchResult.number_of_seasons > 1 ? 's' : ''}`}
                              </span>
                            )}
                          </div>

                          <h4 className="font-black text-lg md:text-xl text-white leading-tight uppercase italic tracking-tight">
                            {tmdbSearchResult.title || tmdbSearchResult.name}
                          </h4>

                          {tmdbSearchResult.tagline && (
                            <p className="text-[10px] md:text-xs font-semibold text-[#9b5cff]/80 italic">
                              "{tmdbSearchResult.tagline}"
                            </p>
                          )}

                          <p className="text-[11px] text-zinc-400 leading-relaxed font-medium line-clamp-3">
                            {tmdbSearchResult.overview || 'No overview description available.'}
                          </p>

                          {/* Genres list */}
                          {tmdbSearchResult.genres && tmdbSearchResult.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {tmdbSearchResult.genres.map((g: any) => (
                                <span key={g.id} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-[8px] font-bold text-zinc-400 uppercase tracking-wide">
                                  {g.name}
                                </span>
                              ))}
                            </div>
                          )}

                          <button
                            onClick={() => navigate(`/add-entry?id=${tmdbSearchResult.id}&type=${tmdbMediaType}`)}
                            className="mt-4 w-full sm:w-auto px-6 py-3 bg-[#9b5cff] hover:bg-purple-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest italic flex items-center justify-center gap-2 shadow-lg shadow-purple-600/15 active:scale-95 transition-all"
                          >
                            Log & Record This Media
                            <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {tmdbSearchError && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="mt-4 p-4 bg-red-500/5 border border-red-500/15 rounded-2xl flex items-center gap-3 text-red-400"
                      >
                        <AlertCircle size={14} className="shrink-0" />
                        <p className="text-[10px] font-black uppercase tracking-wide leading-normal">
                          {tmdbSearchError}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content Shield & Advanced */}
      <div className="pt-8">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-zinc-700 hover:text-white transition-colors"
        >
          <ShieldAlert size={14} />
          <span className="text-[9px] font-black uppercase tracking-widest">Content Shield & Advanced</span>
          <ChevronDown size={14} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        </button>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-6 space-y-6">
                  {/* Google Apps Script URL Setting */}
                  <div className="space-y-3 p-6 bg-zinc-900/40 rounded-[2rem] border border-white/5">
                    <p className="text-[10px] font-black text-white uppercase tracking-widest">Cloud Sync Configuration</p>
                    <p className="text-[9px] text-zinc-600 leading-relaxed italic">Paste your Google Apps Script Web App URL to enable automatic sheet backups.</p>
                    <div className="relative">
                      <Cloud className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700" size={14} />
                      <input
                        type="text"
                        placeholder="https://script.google.com/macros/s/.../exec"
                        value={gasUrl}
                        onChange={(e) => saveGasUrl(e.target.value)}
                        className="w-full bg-black border border-white/10 rounded-xl pl-12 pr-4 py-3 text-[10px] font-bold text-zinc-300 outline-none focus:border-emerald-500/30 transition-all"
                      />
                    </div>
                  </div>

                  {/* Content Shield / Purge Repurposed */}
                  <div className="space-y-4 p-6 bg-emerald-500/5 rounded-[2rem] border border-emerald-500/10">
                    <div className="flex items-center gap-2">
                       <ShieldCheck size={14} className="text-emerald-500" />
                       <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Content Shield (Blocklist)</p>
                    </div>
                    <p className="text-[9px] text-zinc-600 leading-relaxed italic">Enter a **TMDB ID** to block it permanently from all searches, or a **Title** to wipe logs from your diary.</p>
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <ShieldX className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700" size={14} />
                        <input
                          type="text"
                          placeholder="Type tmdbId or Title..."
                          value={purgeId}
                          onChange={(e) => setPurgeId(e.target.value)}
                          className="w-full bg-black border border-white/10 rounded-xl pl-12 pr-4 py-3 text-[10px] font-bold text-zinc-300 outline-none focus:border-emerald-500/30 transition-all"
                        />
                      </div>
                      <button
                        onClick={handlePurgeAndBlock}
                        disabled={isProcessing || !purgeId.trim()}
                        className="px-6 py-3 bg-zinc-900 border border-white/10 text-emerald-500 rounded-xl font-black text-[10px] uppercase tracking-widest disabled:opacity-50 hover:bg-emerald-500 hover:text-white transition-all"
                      >
                        {parseInt(purgeId) ? 'Block ID' : 'Wipe Title'}
                      </button>
                    </div>
                    {blockedIds.length > 0 && (
                      <p className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest px-2">{blockedIds.length} IDs currently shielded from searches.</p>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
    </div>
  );
};

export default Profile;
