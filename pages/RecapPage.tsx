
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store/useStore';
import { Rating, WatchEntry } from '../types';
import {
  Download, Clock, Flame, Award, Calendar, Clapperboard, Loader2, Users,
  TrendingUp, X, ChevronRight, Star, Video, ArrowUpRight, Pencil
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList
} from 'recharts';
import { USER_AVATAR, TMDB_IMAGE_BASE, RATING_CONFIG } from '../constants';
import { fetchMediaCredits } from '../services/api';
import { useNavigate, useLocation } from 'react-router-dom';
import EditEntryModal from '../components/EditEntryModal';

import html2canvas from 'html2canvas';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '../components/ui/avatar';
import { Badge } from '../components/ui/badge';

interface RecapPageProps {
  year: number;
}

interface PersonStat {
  id: number;
  name: string;
  image: string;
  count: number;
  entryIds: string[];
}

const RecapPage: React.FC<RecapPageProps> = ({ year }) => {
  const { entries, updateEntry } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const exportTargetRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const [topActors, setTopActors] = useState<PersonStat[]>([]);
  const [topDirectors, setTopDirectors] = useState<PersonStat[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<PersonStat | null>(null);
  const [editingEntry, setEditingEntry] = useState<WatchEntry | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Background scroll lock targeting #root
  useEffect(() => {
    const root = document.getElementById('root');
    if (selectedPerson && root) {
      root.style.overflow = 'hidden';
    } else if (root) {
      root.style.overflow = 'auto';
    }
    return () => {
      if (root) root.style.overflow = 'auto';
    };
  }, [selectedPerson]);

  const yearEntries = useMemo(() =>
    (entries || []).filter(e => {
      if (!e || !e.title) return false;
      // Do not add unknown-dated watched movies and series in the annual recap counter
      if (e.datePrecision === 'unknown' || e.watchDate === '0000-00-00' || !e.year || e.year === 0) {
        return false;
      }
      return e.year === year;
    }),
  [entries, year]);

  useEffect(() => {
    const analyzeArchive = async () => {
      if (yearEntries.length === 0) return;
      setIsAnalyzing(true);

      const actorCounts: Record<number, { name: string; image: string; count: number; entryIds: string[] }> = {};
      const directorCounts: Record<number, { name: string; image: string; count: number; entryIds: string[] }> = {};

      try {
        const analysisList = [...yearEntries];

        // Process analysis list in small batches to respect rate limits smoothly
        const BATCH_SIZE = 4;
        for (let i = 0; i < analysisList.length; i += BATCH_SIZE) {
          const batch = analysisList.slice(i, i + BATCH_SIZE);
          await Promise.all(batch.map(async (entry) => {
            try {
              const credits = await fetchMediaCredits(entry.tmdbId, entry.type);

              credits.cast?.slice(0, 10).forEach((actor: any) => {
                if (!actor.id) return;
                if (!actorCounts[actor.id]) {
                  actorCounts[actor.id] = {
                    name: actor.name,
                    image: actor.profile_path ? `${TMDB_IMAGE_BASE}${actor.profile_path}` : '',
                    count: 0,
                    entryIds: []
                  };
                }
                actorCounts[actor.id].count += 1;
                const stringId = String(entry.id);
                if (!actorCounts[actor.id].entryIds.includes(stringId)) {
                  actorCounts[actor.id].entryIds.push(stringId);
                }
              });

              credits.crew?.forEach((member: any) => {
                if (member.job === 'Director' && member.id) {
                  if (!directorCounts[member.id]) {
                    directorCounts[member.id] = {
                      name: member.name,
                      image: member.profile_path ? `${TMDB_IMAGE_BASE}${member.profile_path}` : '',
                      count: 0,
                      entryIds: []
                    };
                  }
                  directorCounts[member.id].count += 1;
                  const stringId = String(entry.id);
                  if (!directorCounts[member.id].entryIds.includes(stringId)) {
                    directorCounts[member.id].entryIds.push(stringId);
                  }
                }
              });
            } catch (e) {
              // Ignore single entry credits failure and continue analysis
            }
          }));
        }

        const sortedActors = Object.entries(actorCounts)
          .map(([id, data]) => ({ id: Number(id), ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        const sortedDirectors = Object.entries(directorCounts)
          .map(([id, data]) => ({ id: Number(id), ...data }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3);

        setTopActors(sortedActors);
        setTopDirectors(sortedDirectors);
      } catch (e) {
        console.error("Recap analysis failed:", e);
      } finally {
        setIsAnalyzing(false);
      }
    };

    analyzeArchive();
  }, [yearEntries]);

  const stats = useMemo(() => {
    const movies = yearEntries.filter(e => e.type === 'movie');
    const series = yearEntries.filter(e => e.type === 'tv');
    const anime = yearEntries.filter(e => e.genres?.some(g => g.toLowerCase().includes('animation') || g.toLowerCase().includes('anime')));

    const monthlyData = [
      { name: 'Jan', count: 0 }, { name: 'Feb', count: 0 }, { name: 'Mar', count: 0 },
      { name: 'Apr', count: 0 }, { name: 'May', count: 0 }, { name: 'Jun', count: 0 },
      { name: 'Jul', count: 0 }, { name: 'Aug', count: 0 }, { name: 'Sep', count: 0 },
      { name: 'Oct', count: 0 }, { name: 'Nov', count: 0 }, { name: 'Dec', count: 0 }
    ];

    const genreCount: Record<string, number> = {};
    let totalMinutes = 0;

    yearEntries.forEach(e => {
      const month = new Date(e.watchDate).getMonth();
      if (month >= 0 && month < 12) {
        monthlyData[month].count++;
      }

      // Calculate realistic watch time in minutes depending on media type (Movie vs TV)
      if (e.type === 'tv') {
        const isAnime = e.genres?.some(g => {
          const lower = g.toLowerCase();
          return lower.includes('animation') || lower.includes('anime');
        });
        const isComedy = !isAnime && e.genres?.some(g => g.toLowerCase().includes('comedy'));

        // Define representative episode duration
        const avgEpTime = isAnime ? 24 : (isComedy ? 25 : 45);

        if (e.episodeCount && e.episodeCount > 0) {
          totalMinutes += e.episodeCount * avgEpTime;
        } else {
          // Fallback if no specific season's episode count is recorded
          if (e.runtime && e.runtime > 0 && e.runtime < 200) {
            totalMinutes += e.runtime;
          } else {
            totalMinutes += 10 * avgEpTime; // Estimate standard 10 episodes season
          }
        }
      } else {
        // Movie: Use recorded runtime or standard 120 minutes fallback
        totalMinutes += (e.runtime || 120);
      }

      if (e.genres) {
        e.genres.forEach(g => {
          genreCount[g] = (genreCount[g] || 0) + 1;
        });
      }
    });

    const ratingBreakdown = [
      { name: 'PEAK', value: yearEntries.filter(e => e.rating === Rating.PEAK).length, color: '#9b5cff' },
      { name: 'GOOD', value: yearEntries.filter(e => e.rating === Rating.GOOD).length, color: '#00f5a0' },
      { name: 'MID', value: yearEntries.filter(e => e.rating === Rating.MID).length, color: '#ffb703' },
      { name: 'BAD', value: yearEntries.filter(e => e.rating === Rating.BAD).length, color: '#ff4d6d' },
    ];

    // Uppercase genre names in data to avoid using invalid SVG 'textTransform' attribute
    const sortedGenres = Object.entries(genreCount)
      .map(([name, count]) => ({ name: name.toUpperCase(), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total: yearEntries.length,
      moviesCount: movies.length,
      seriesCount: series.length,
      animeCount: anime.length,
      hours: totalMinutes / 60,
      streak: Math.min(yearEntries.length, 12),
      peakRatings: yearEntries.filter(e => e.rating === Rating.PEAK).length,
      monthlyData,
      ratingBreakdown,
      topGenres: sortedGenres
    };
  }, [yearEntries]);

  const handleExport = async () => {
    if (!exportTargetRef.current || isExporting || isAnalyzing) return;
    try {
      setIsExporting(true);
      const element = exportTargetRef.current;
      await new Promise(resolve => setTimeout(resolve, 50));

      const canvas = await html2canvas(element, {
        backgroundColor: '#050507',
        scale: 2,
        useCORS: true,
        logging: false,
        width: 1200,
        height: element.scrollHeight,
      });

      const imageData = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `CineLog-${year}-Archive.png`;
      link.href = imageData;
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-zinc-950/90 backdrop-blur-xl border border-white/10 p-2.5 rounded-xl shadow-2xl">
          <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-1">{label}</p>
          <p className="text-sm font-black text-white italic">{payload[0].value} <span className="not-italic text-zinc-600 text-[8px] uppercase tracking-widest ml-1">Entries</span></p>
        </div>
      );
    }
    return null;
  };

  const RecapContent = ({ isForExport = false }: { isForExport?: boolean }) => (
    <div
      className={`
        dark bg-background text-foreground relative overflow-hidden flex flex-col gap-6
        ${isForExport ? 'w-[1200px] p-20 space-y-12' : 'w-full p-4 md:p-8 space-y-8'}
      `}
    >
      {/* Background Subtle Gradient Decors */}
      {!isForExport && (
        <>
          <div className="absolute top-0 right-0 w-2/3 h-2/3 bg-gradient-to-br from-purple-500/[0.03] via-transparent to-transparent pointer-events-none blur-[120px] z-0" />
          <div className="absolute bottom-0 left-0 w-1/2 h-1/2 bg-gradient-to-tr from-emerald-500/[0.02] via-transparent to-transparent pointer-events-none blur-[140px] z-0" />
        </>
      )}

      {/* Header Section */}
      <header className="flex justify-between items-center relative z-10 pb-6 border-b border-border/40">
         <div className="space-y-1.5">
           <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500 animate-pulse" />
              <p className="text-muted-foreground font-semibold tracking-wider text-[10px]">CINELOG ANNUAL ARCHIVE</p>
           </div>
           <h2 className="font-black text-foreground italic tracking-tight uppercase leading-none text-4xl sm:text-6xl">
             {year}<span className="text-purple-500">.</span>
           </h2>
         </div>
         <div className="bg-muted border border-border/40 p-3 rounded-xl flex items-center justify-center shrink-0">
            <Clapperboard size={24} className="text-purple-500" />
         </div>
      </header>

      {/* Stats Cards Section */}
      <div className={`grid gap-4 relative z-10 ${isForExport ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
        {/* Total Entries Card */}
        <Card className="col-span-1 sm:col-span-2 shadow-none border-0 ring-1 ring-foreground/10 bg-card">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-xs text-muted-foreground font-normal tracking-wider uppercase">Volume Analysis</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col justify-between h-[120px]">
            <div className="flex items-baseline gap-2">
              <span className="font-black text-5xl text-foreground italic leading-none">{stats.total}</span>
              <span className="text-xs font-black text-purple-400 uppercase tracking-widest italic">Entries</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-4 border-t border-border/40">
              <div>
                <span className="block text-lg font-black text-foreground italic leading-none">{stats.moviesCount}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mt-1">Movies</span>
              </div>
              <div>
                <span className="block text-lg font-black text-foreground italic leading-none">{stats.seriesCount}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mt-1">Series</span>
              </div>
              <div>
                <span className="block text-lg font-black text-foreground italic leading-none">{stats.animeCount}</span>
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider block mt-1">Anime</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Other bento stat cards */}
        {[
          { icon: <Clock className="text-emerald-400" size={16} />, value: `${Math.round(stats.hours)}h`, label: 'Watch Time' },
          { icon: <Flame className="text-orange-400" size={16} />, value: `${stats.streak}d`, label: 'Streak' },
          { icon: <Award className="text-purple-400" size={16} />, value: stats.peakRatings, label: 'Awards' },
          { icon: <TrendingUp className="text-blue-400" size={16} />, value: 'Sat', label: 'Prime Day' }
        ].map((item, i) => (
          <Card key={i} className="shadow-none border-0 ring-1 ring-foreground/10 bg-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs text-muted-foreground font-normal tracking-wider uppercase">{item.label}</CardTitle>
                <div className="bg-muted/60 p-1.5 rounded-lg border border-border/40">{item.icon}</div>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <p className="font-black text-3xl text-foreground italic tracking-tight">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lists Section */}
      <div className={`grid gap-4 relative z-10 ${isForExport ? 'grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {/* Top Acting Talent */}
        <Card className="shadow-none border-0 ring-1 ring-foreground/10 bg-card">
          <CardHeader className="border-b border-border/40 pb-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-purple-400" />
              <CardTitle className="text-sm font-semibold text-foreground uppercase tracking-wider">Top Acting Talent</CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">Most watched screen performers of {year}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isAnalyzing ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-purple-500" size={20} />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Analyzing logs...</p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border/40">
                {topActors.map((actor, idx) => (
                  <li
                    key={actor.id}
                    onClick={() => setSelectedPerson(actor)}
                    className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="size-10 rounded-lg">
                        <AvatarImage src={actor.image || 'https://via.placeholder.com/150?text=None'} alt={actor.name} className="object-cover rounded-lg" />
                        <AvatarFallback>{actor.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-purple-600 text-white rounded-md flex items-center justify-center font-black text-[9px] italic border border-purple-400/30">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground text-sm hover:text-purple-400 transition-colors">
                        {actor.name}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        {actor.count} titles watched
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/60" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Top Directors */}
        <Card className="shadow-none border-0 ring-1 ring-foreground/10 bg-card">
          <CardHeader className="border-b border-border/40 pb-4">
            <div className="flex items-center gap-2">
              <Video size={16} className="text-emerald-400" />
              <CardTitle className="text-sm font-semibold text-foreground uppercase tracking-wider">Top Directors</CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">Most watched film and show makers of {year}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isAnalyzing ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <Loader2 className="animate-spin text-emerald-500" size={20} />
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Processing crew...</p>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-border/40">
                {topDirectors.map((director, idx) => (
                  <li
                    key={director.id}
                    onClick={() => setSelectedPerson(director)}
                    className="flex items-center gap-3 p-4 hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="size-10 rounded-lg">
                        <AvatarImage src={director.image || 'https://via.placeholder.com/150?text=None'} alt={director.name} className="object-cover rounded-lg" />
                        <AvatarFallback>{director.name.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-emerald-600 text-white rounded-md flex items-center justify-center font-black text-[9px] italic border border-emerald-400/30">
                        #{idx + 1}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground text-sm hover:text-emerald-400 transition-colors">
                        {director.name}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                        {director.count} titles watched
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground/60" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className={`grid gap-4 relative z-10 ${isForExport ? 'grid-cols-2' : 'grid-cols-1 lg:grid-cols-2'}`}>
        {/* Genre Bar Chart Card */}
        <Card className="shadow-none border-0 ring-1 ring-foreground/10 bg-card">
          <CardHeader className="border-b border-border/40 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs text-muted-foreground font-normal tracking-wider uppercase">Genre Distribution</CardTitle>
              <Badge variant="secondary" className="text-[8px] tracking-wider uppercase font-bold px-2 py-0.5">DNA PROFILE</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="w-full h-36 md:h-48 min-h-[140px]">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={stats.topGenres} layout="vertical" margin={{ left: -15, right: 30 }}>
                    <defs>
                      <linearGradient id="genreGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#c084fc" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#a855f7" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <XAxis type="number" hide />
                    <YAxis
                      dataKey="name"
                      type="category"
                      axisLine={false}
                      tickLine={false}
                      width={60}
                      tick={{ fill: 'var(--muted-foreground)', fontSize: 7, fontWeight: 900 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="url(#genreGrad)" radius={[0, 4, 4, 0]} barSize={8}>
                      <LabelList dataKey="count" position="right" style={{ fill: 'var(--muted-foreground)', fontSize: 7, fontWeight: 900 }} offset={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Activity Velocity Chart Card */}
        <Card className="shadow-none border-0 ring-1 ring-foreground/10 bg-card">
          <CardHeader className="border-b border-border/40 pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs text-muted-foreground font-normal tracking-wider uppercase">Activity Velocity</CardTitle>
              <Badge variant="secondary" className="text-[8px] tracking-wider uppercase font-bold px-2 py-0.5">MONTHLY METRICS</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="w-full h-36 md:h-48 min-h-[140px]">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={stats.monthlyData}>
                    <defs>
                      <linearGradient id="activityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity={1} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted-foreground)', fontSize: 7, fontWeight: 800 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" fill="url(#activityGrad)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Rating spectrum */}
      <Card className="shadow-none border-0 ring-1 ring-foreground/10 bg-card relative z-10 w-full">
        <CardHeader className="border-b border-border/40 pb-4">
          <CardTitle className="text-xs text-muted-foreground font-normal tracking-wider uppercase">Critical Distribution</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">Spectrum of your logged entries from masterworks to guilty pleasures</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6 md:gap-10">
            <div className="space-y-2 lg:w-1/3 text-center lg:text-left">
              <h3 className="text-lg font-black text-foreground italic uppercase tracking-tighter leading-none">Rating Spectrum</h3>
              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-xs pt-1 mx-auto lg:mx-0">
                Visualizing how your year matches artistic tiers. Are you a demanding critic or easily pleased?
              </p>
            </div>

            <div className="w-full lg:w-1/3 aspect-square max-w-[150px] md:max-w-[185px] min-h-[150px] flex items-center justify-center relative">
              <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
                 <span className="text-3xl font-black text-foreground italic tracking-tighter leading-none">{stats.total}</span>
                 <span className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mt-1">Entries</span>
              </div>
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <PieChart>
                    <Pie data={stats.ratingBreakdown} innerRadius="78%" outerRadius="98%" paddingAngle={4} dataKey="value" stroke="none" isAnimationActive={!isForExport}>
                      {stats.ratingBreakdown.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:w-1/3 w-full">
               {stats.ratingBreakdown.map((r, i) => (
                 <div key={i} className="flex flex-col gap-1 p-3 bg-muted/40 border border-border/40 rounded-xl hover:bg-muted/70 transition-colors">
                   <div className="flex items-center gap-1.5">
                     <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ backgroundColor: r.color, color: r.color }} />
                     <span className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">{r.name}</span>
                   </div>
                   <span className="text-xl font-black text-foreground italic ml-3.5 leading-none tabular-nums">{r.value}</span>
                 </div>
               ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <footer className="pt-6 border-t border-border/40 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-10">
        <div className="flex flex-col items-center sm:items-start text-center sm:text-left">
          <span className="font-sans text-xl font-black tracking-widest text-foreground">CINELOG</span>
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">Annual Narrative Summary</span>
        </div>
        <div className="sm:text-right flex flex-col items-center sm:items-end space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-right">
              <span className="block text-[10px] font-semibold text-foreground uppercase tracking-wider">Ajoy Saha</span>
              <span className="block text-[8px] font-medium text-muted-foreground tracking-wider uppercase">COLLECTOR & ARCHIVIST</span>
            </div>
            <Avatar className="size-8 rounded-lg">
              <AvatarImage src={USER_AVATAR} alt="Ajoy Saha" className="object-cover rounded-lg" />
              <AvatarFallback>AS</AvatarFallback>
            </Avatar>
          </div>
          <span className="block text-[8px] font-medium text-muted-foreground/80 tracking-widest uppercase">DOCUMENT COMPILED • {new Date().toLocaleDateString('en-GB')}</span>
        </div>
      </footer>
    </div>
  );

  return (
    <div className="space-y-6 md:space-y-12 pb-32 max-w-5xl mx-auto px-0 sm:px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 px-4 md:px-0">
        <div className="space-y-0.5 md:space-y-1">
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter italic text-white uppercase leading-none">Your Recap</h1>
          <p className="text-zinc-600 font-black uppercase tracking-[0.4em] text-[8px] md:text-[10px]">Cinematic Fingerprint</p>
        </div>
        <button
          onClick={handleExport}
          disabled={isExporting || isAnalyzing}
          className="bg-white text-black px-5 py-3 rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2.5 disabled:opacity-50"
        >
          {isExporting ? <Loader2 className="animate-spin" size={14} /> : (isAnalyzing ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />)}
          {isExporting ? 'Generating...' : (isAnalyzing ? 'Analyzing...' : 'Save Image')}
        </button>
      </div>

      <RecapContent />

      {/* Hidden Export Container */}
      <div className="fixed left-[-9999px] top-0 overflow-hidden pointer-events-none" aria-hidden="true" style={{ width: '1200px' }}>
        <div ref={exportTargetRef} style={{ width: '1200px', backgroundColor: '#050507' }}>
          <RecapContent isForExport={true} />
        </div>
      </div>

      {/* PERSON DETAILS MODAL - Restored Scrollable Version with Background Lock */}
      <AnimatePresence>
        {selectedPerson && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none overflow-hidden">
            {/* Backdrop Layer */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPerson(null)}
              className="absolute inset-0 bg-black/98 backdrop-blur-[40px] z-0 pointer-events-auto"
            />

            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", damping: 32, stiffness: 280 }}
              className="relative w-full max-w-xl bg-[#0c0c0e] rounded-[3.5rem] border border-white/10 shadow-[0_80px_160px_rgba(0,0,0,1)] flex flex-col z-10 pointer-events-auto overflow-hidden"
              style={{ maxHeight: 'calc(100dvh - 40px)' }}
            >
              {/* Modal Header */}
              <div className="px-6 py-6 md:px-10 md:py-8 border-b border-white/5 flex items-center justify-between shrink-0 bg-[#0c0c0e]">
                <div className="flex items-center gap-4 md:gap-6 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <img
                      src={selectedPerson.image || 'https://via.placeholder.com/150?text=None'}
                      className="w-14 h-14 md:w-20 md:h-20 rounded-2xl md:rounded-[2rem] object-cover border border-white/10 shadow-2xl"
                      alt={selectedPerson.name}
                    />
                    <div className="absolute -bottom-1 -right-1 p-1 bg-purple-600 rounded-lg shadow-lg">
                      <Star size={10} className="text-white fill-white" />
                    </div>
                  </div>
                  <div className="space-y-1 md:space-y-2 min-w-0 flex-1">
                    <button
                      onClick={() => {
                        const root = document.getElementById('root');
                        if (root) root.style.overflow = 'auto';
                        setSelectedPerson(null);
                        navigate(`/explore?personId=${selectedPerson.id}`, { state: { from: location.pathname + location.search } });
                      }}
                      className="text-lg md:text-3xl font-black text-white hover:text-purple-400 uppercase tracking-tighter italic leading-none truncate pr-4 transition-colors text-left focus:outline-none block w-full"
                    >
                      {selectedPerson.name}
                    </button>
                    <p className="text-zinc-600 font-black uppercase tracking-[0.4em] text-[7px] md:text-[9px]">
                      Archive Discovery • {year} Summary
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPerson(null)}
                  className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 text-zinc-500 hover:text-white transition-colors shrink-0"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable Content Area */}
              <div className="p-4 md:p-10 space-y-4 bg-[#0c0c0e] overflow-y-auto no-scrollbar overscroll-contain">
                <div className="flex items-center gap-2 mb-2">
                   <div className="h-px flex-1 bg-white/5" />
                   <span className="text-[7px] font-black text-zinc-800 uppercase tracking-widest">Matched Titles ({selectedPerson.count})</span>
                   <div className="h-px flex-1 bg-white/5" />
                </div>

                {yearEntries
                  .filter(e => selectedPerson.entryIds.includes(String(e.id)))
                  .sort((a, b) => new Date(b.watchDate).getTime() - new Date(a.watchDate).getTime())
                  .map((entry) => {
                    const ratingCfg = RATING_CONFIG[entry.rating] || RATING_CONFIG[Rating.GOOD];
                    return (
                      <div
                        key={entry.id}
                        onClick={() => setEditingEntry(entry)}
                        className="flex items-center gap-4 p-3 rounded-[1.5rem] bg-[#16161a] border border-white/[0.03] hover:border-purple-500/30 group relative shadow-2xl transition-all hover:bg-white/[0.04] cursor-pointer"
                        title={`Click to edit ${entry.title}`}
                      >
                        {/* Film Poster */}
                        <div className="relative shrink-0 w-12 h-18 md:w-16 md:h-24 rounded-xl overflow-hidden shadow-xl border border-white/5">
                          <img
                            src={entry.posterUrl}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            alt=""
                          />
                        </div>

                        {/* Film Content */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <h4 className="font-black text-sm md:text-lg text-white uppercase tracking-tight italic truncate pr-4 leading-none group-hover:text-purple-300 transition-colors">
                            {entry.title}
                          </h4>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className={`px-2 py-0.5 rounded-lg ${ratingCfg.bg} shrink-0`}>
                              <span className={`text-[7px] md:text-[9px] font-black uppercase tracking-[0.2em] ${ratingCfg.text}`}>
                                {ratingCfg.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-zinc-600 shrink-0">
                               <Calendar size={9} />
                               <p className="text-[7px] md:text-[9px] font-black uppercase tracking-widest tabular-nums">
                                 {new Date(entry.watchDate).toLocaleDateString('en-GB')}
                               </p>
                            </div>
                          </div>
                        </div>

                        {/* Action Edit Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEntry(entry);
                          }}
                          className="px-3.5 py-2.5 rounded-2xl bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/30 hover:border-purple-500/50 text-purple-300 hover:text-white transition-all transform hover:scale-105 active:scale-95 flex items-center gap-1.5 shrink-0 shadow-lg"
                          title={`Edit ${entry.title}`}
                        >
                          <Pencil size={13} className="text-purple-400 group-hover:text-white" />
                          <span className="text-[9px] md:text-[10px] font-black uppercase tracking-wider">Edit</span>
                        </button>
                      </div>
                    );
                })}
              </div>

              {/* Bottom Dismiss */}
              <div className="p-6 md:p-10 border-t border-white/5 bg-[#0c0c0e] shrink-0">
                <button
                  onClick={() => setSelectedPerson(null)}
                  className="w-full py-5 bg-white text-black rounded-[2rem] font-black text-[10px] uppercase tracking-[0.4em] shadow-2xl transition-transform active:scale-95"
                >
                  Dismiss Focus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Direct Entry Edit Modal from Recap */}
      {editingEntry && (
        <EditEntryModal
          entry={editingEntry}
          isOpen={!!editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={async (updated) => {
            await updateEntry(updated);
            setEditingEntry(null);
          }}
        />
      )}
    </div>
  );
};

export default RecapPage;
