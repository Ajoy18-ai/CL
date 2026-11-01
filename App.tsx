import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home, BarChart2, Search, X,
  Clapperboard, AlertCircle, CloudOff, ShieldCheck
} from 'lucide-react';
import { useStore } from './store/useStore';
import { USER_AVATAR, TMDB_IMAGE_BASE } from './constants';
import { WatchListItem } from './types';
import { ToastContainer } from './components/ToastContainer';
import ClickSpark from './components/ClickSpark';
import { useIsMobile } from './hooks/use-mobile';
import { ErrorBoundary } from './components/ErrorBoundary';
import GlassSurface from './components/GlassSurface';
import BinaryOrbits from './components/BinaryOrbits';

// Pages (Dashboard loaded directly, secondary pages code-split for peak mobile performance)
import Dashboard from './pages/Dashboard';
const RecapPage = React.lazy(() => import('./pages/RecapPage'));
const ProfilePage = React.lazy(() => import('./pages/Profile'));
const AddEntryPage = React.lazy(() => import('./pages/AddEntry'));
const WatchListPage = React.lazy(() => import('./pages/WatchListPage'));
const ExplorePage = React.lazy(() => import('./pages/ExplorePage'));
const CustomListsPage = React.lazy(() => import('./pages/CustomListsPage'));
const BacklogRecoveryPage = React.lazy(() => import('./pages/BacklogRecoveryPage'));

// Scroll to top on navigation helper
const ScrollToTop = () => {
  const { pathname, search } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const root = document.getElementById('root');
    if (root) {
      root.scrollTop = 0;
      root.scrollTo({ top: 0, behavior: 'instant' });
    }
    const main = document.querySelector('main');
    if (main) {
      main.scrollTop = 0;
    }
  }, [pathname, search]);
  return null;
};

// Component to dynamically update document title and html lang, with an assistive screen reader announcer
const PageTitleAndLang: React.FC = () => {
  const location = useLocation();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    let pageName = 'Watch Diary';

    switch (location.pathname) {
      case '/':
        pageName = 'Watch Diary';
        break;
      case '/add-entry':
        pageName = 'Search & Add';
        break;
      case '/recap':
        pageName = 'Annual Recap';
        break;
      case '/explore':
        pageName = 'Explore & Discovery';
        break;
      case '/profile':
        pageName = 'Profile & Backup';
        break;
      case '/watchlist':
        pageName = 'Watch List';
        break;
      case '/lists':
        pageName = 'Custom Lists';
        break;
      case '/backlog':
        pageName = 'Backlog';
        break;
      default:
        pageName = 'Cinema Diary';
    }

    const fullTitle = `${pageName} — CineLog`;
    document.title = fullTitle;

    // Set standard HTML language attribute to English
    document.documentElement.setAttribute('lang', 'en');
    document.documentElement.classList.add('dark');

    // Live announcement for screen readers
    setAnnouncement(`Navigated to ${pageName}`);
  }, [location]);

  return (
    <div className="sr-only" aria-live="assertive" aria-atomic="true">
      {announcement}
    </div>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { isCloudConnected, isPosterModalOpen } = useStore();
  const isMobile = useIsMobile();

  const navItems = [
    { path: '/', label: 'WATCH DIARY', icon: <Home size={20} /> },
    { path: '/add-entry', label: 'SEARCH & ADD', icon: <Search size={20} /> },
    { path: '/recap', label: 'RECAP', icon: <BarChart2 size={20} /> },
  ];

  return (
    <div className="min-h-screen flex bg-[#09090b] relative overflow-x-hidden">
      {/* Background: Binary Orbits */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 bg-[#09090b]">
        <BinaryOrbits
          colors={["#600dca","#987fbb"]}
          mode={"ink"}
          starSize={1.7500000000000002}
          sparkle={0.56}
          twist={4.35}
          armStrength={0.7000000000000001}
          core={1.1500000000000001}
          coreSize={0.09000000000000001}
          scale={1.27}
          speed={0.9500000000000002}
          backgroundColor="#09090b"
          className="w-full h-full absolute inset-0"
        />
      </div>

      <PageTitleAndLang />

      {/* DESKTOP SIDEBAR */}
      <aside className={`hidden lg:flex w-72 flex-col border-r border-white/5 fixed left-0 top-0 bottom-0 h-screen p-8 md:p-10 space-y-12 bg-black/50 backdrop-blur-3xl z-40 transition-all duration-200 ${isPosterModalOpen ? '!hidden opacity-0 pointer-events-none' : ''}`}>
        <div className="flex items-center gap-4 px-2">
          <div className="w-10 h-10 overflow-hidden rounded-[1rem] border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)] bg-black flex items-center justify-center shrink-0">
             <img src="pwa-icon.png" alt="CINELOG Logo" className="w-full h-full object-cover" width="40" height="40" />
          </div>
          <span className="font-micuale text-2xl text-white leading-none">CINELOG</span>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto no-scrollbar">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-4 px-6 py-4 rounded-[1.5rem] font-black transition-all group ${
                location.pathname === item.path
                ? 'bg-white/5 text-white border border-white/5 shadow-lg'
                : 'text-zinc-400 hover:text-white'
              }`}
            >
              <div className={location.pathname === item.path ? 'text-[#b88aff]' : 'text-zinc-400 group-hover:text-zinc-200'}>
                {item.icon}
              </div>
              <span className="text-[10px] tracking-[0.3em] uppercase">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="px-2 space-y-6">
          <div className={`flex items-center gap-3 px-6 py-3 rounded-2xl border ${isCloudConnected ? 'border-emerald-500/10 bg-emerald-500/5 text-emerald-500' : 'border-zinc-800 bg-zinc-900/40 text-zinc-400'}`}>
            {isCloudConnected ? <ShieldCheck size={14} /> : <CloudOff size={14} />}
            <span className="text-[8px] font-black uppercase tracking-widest">{isCloudConnected ? 'Cloud Secure' : 'Local Archive'}</span>
          </div>

          <Link to="/profile" className={`flex items-center gap-4 py-4 transition-all group ${location.pathname === '/profile' ? 'text-white' : 'text-zinc-400 hover:text-white'}`}>
             <div className={`w-9 h-9 rounded-xl border border-white/10 overflow-hidden transition-all duration-500 ${location.pathname === '/profile' ? 'ring-2 ring-[#9b5cff]' : 'grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100'}`}>
               <img src={USER_AVATAR} alt="Profile" className="w-full h-full object-cover" width="36" height="36" />
             </div>
             <span className="font-black text-[10px] uppercase tracking-[0.2em] text-zinc-300 group-hover:text-white">AJOY SAHA</span>
          </Link>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden lg:pl-72 relative z-10">
        <div className={location.pathname === '/add-entry' ? "max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 pb-40 lg:pb-8" : "max-w-7xl mx-auto py-8 px-3 md:px-16 md:py-16 pb-40 lg:pb-16"}>
          <ErrorBoundary>
            <React.Suspense fallback={
              <div className="min-h-[50vh] flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={isMobile ? { opacity: 0 } : { opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={isMobile ? { opacity: 0 } : { opacity: 0, y: -5 }}
                  transition={{
                    duration: isMobile ? 0.1 : 0.18,
                    ease: [0.22, 1, 0.36, 1]
                  }}
                  style={{ transform: 'translateZ(0)' }}
                >
                  {children}
                </motion.div>
              </AnimatePresence>
            </React.Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <ToastContainer />

      {/* MOBILE FLOATING PILL DOCK */}
      <div className={`lg:hidden fixed bottom-4 left-1/2 -translate-x-1/2 z-[2000] w-[92%] max-w-[380px] pwa-bottom-nav transition-all duration-200 ${(isPosterModalOpen || location.pathname === '/backlog') ? '!hidden opacity-0 pointer-events-none' : ''}`}>
        <GlassSurface
          width="100%"
          height={72}
          borderRadius={36}
          borderWidth={0.07}
          brightness={50}
          opacity={0.93}
          blur={11}
          displace={0.5}
          backgroundOpacity={0.15}
          distortionScale={-180}
          className="shadow-[0_12px_36px_rgba(0,0,0,0.85)] border border-white/10"
        >
          <nav className="w-full h-full flex items-center justify-between px-1">
            {navItems.map(item => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="relative flex-1 h-full flex items-center justify-center transition-all group"
                >
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        layoutId="mobileNavIndicator"
                        className="absolute inset-y-2.5 inset-x-2.5 bg-white rounded-full z-0 shadow-[0_8px_16px_rgba(255,255,255,0.1)]"
                        initial={false}
                        transition={{ type: "spring", bounce: 0.1, duration: 0.22 }}
                      />
                    )}
                  </AnimatePresence>

                  <div className={`relative z-10 transition-colors duration-200 ${isActive ? 'text-black' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
                    {React.cloneElement(item.icon as React.ReactElement<any>, {
                      size: 20,
                      strokeWidth: isActive ? 2.5 : 2
                    })}
                  </div>
                </Link>
              );
            })}

            <Link
              to="/profile"
              className="relative flex-1 h-full flex items-center justify-center group"
            >
              <AnimatePresence>
                {location.pathname === '/profile' && (
                  <motion.div
                    layoutId="mobileNavIndicator"
                    className="absolute inset-y-2.5 inset-x-2.5 bg-white rounded-full z-0 shadow-[0_8px_16px_rgba(255,255,255,0.1)]"
                    initial={false}
                    transition={{ type: "spring", bounce: 0.1, duration: 0.22 }}
                  />
                )}
              </AnimatePresence>
              <div
                className={`relative z-10 w-8 h-8 rounded-full overflow-hidden border transition-all duration-200 ${
                  location.pathname === '/profile' ? 'border-black' : 'border-zinc-700 grayscale opacity-60 group-hover:opacity-100 group-hover:grayscale-0'
                }`}
              >
                <img src={USER_AVATAR} alt="AJOY" className="w-full h-full object-cover" width="32" height="32" />
              </div>
            </Link>
          </nav>
        </GlassSurface>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const {
    refreshEntries,
    refreshWatchLists,
    refreshCustomLists,
    refreshRecentSearches,
    refreshPinnedTalents,
    addWatchList,
    migrateLegacyData,
    initListeners
  } = useStore();

  useEffect(() => {
    const unsub = initListeners();

    const initializeData = async () => {
      // Step 1: Recover any older data
      migrateLegacyData();

      // Step 2: Fetch current archives and synced data
      await Promise.all([
        refreshEntries(),
        refreshWatchLists(),
        refreshCustomLists(),
        refreshRecentSearches(),
        refreshPinnedTalents()
      ]);

      const currentLists = useStore.getState().watchLists;
      if (currentLists.length === 0 || !currentLists.find(l => l.name === 'To Watch')) {
        await addWatchList('To Watch');
      }
    };
    initializeData();

    return () => unsub();
  }, []);

  return (
    <HashRouter>
      <ScrollToTop />
      <ClickSpark
        sparkColor="#b88aff"
        sparkSize={8}
        sparkRadius={20}
        sparkCount={10}
        duration={450}
        easing="ease-out"
      >
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard selectedYear={selectedYear} setSelectedYear={setSelectedYear} />} />
            <Route path="/add-entry" element={<AddEntryPage />} />
            <Route path="/recap" element={<RecapPage year={selectedYear} />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/watchlist" element={<WatchListPage />} />
            <Route path="/lists" element={<CustomListsPage />} />
            <Route path="/backlog" element={<BacklogRecoveryPage />} />
          </Routes>
        </Layout>
      </ClickSpark>
    </HashRouter>
  );
};

export default App;
