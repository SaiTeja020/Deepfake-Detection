import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Product from './pages/Product';
import Compare from './pages/Compare';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { useAuth } from './context/AuthContext';
import { auth } from './firebase';
import { signOut } from 'firebase/auth';
import {
  HomeIcon,
  BeakerIcon,
  ArrowsRightLeftIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Bars3Icon,
  XMarkIcon,
  SunIcon,
  MoonIcon
} from '@heroicons/react/24/outline';

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setMobileOpen, theme, toggleTheme, onLogout, isLoggedIn, profile }: {
  isCollapsed: boolean,
  setIsCollapsed: (v: boolean) => void,
  isMobileOpen: boolean,
  setMobileOpen: (v: boolean) => void,
  theme: 'dark' | 'light',
  toggleTheme: () => void,
  onLogout: () => void,
  isLoggedIn: boolean,
  profile: any
}) => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;
  const isDark = theme === 'dark';

  const menuItems = [
    { name: 'Home', path: '/', icon: HomeIcon, public: true },
    { name: 'Analyze', path: '/product', icon: BeakerIcon, public: false },
    { name: 'Compare', path: '/compare', icon: ArrowsRightLeftIcon, public: false },
    { name: 'Profile', path: '/profile', icon: UserCircleIcon, public: false },
    { name: 'Settings', path: '/settings', icon: Cog6ToothIcon, public: false },
  ];

  return (
    <>
      <button
        onClick={() => setMobileOpen(!isMobileOpen)}
        className={`fixed top-8 right-8 z-50 p-3 rounded-full lg:hidden transition-all border shadow-lg ${isDark ? 'bg-zinc-900 border-zinc-800 text-white/70' : 'bg-white border-slate-200 text-slate-600'}`}
      >
        {isMobileOpen ? <XMarkIcon className="w-5 h-5" /> : <Bars3Icon className="w-5 h-5" />}
      </button>

      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm transition-opacity duration-500"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 bottom-0 z-40
          flex flex-col
          sidebar-transition
          border-r
          ${isDark ? 'bg-[#09090b]/80 border-zinc-900/50' : 'bg-white/90 border-slate-200/60'}
          ${isCollapsed ? 'w-20' : 'w-64'}
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          backdrop-blur-xl
        `}
      >
        <div className="p-6 flex items-center justify-between border-b border-zinc-900/50">
          {(!isCollapsed || isMobileOpen) && (
            <div className="flex items-center space-x-3">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg blur opacity-40 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                <div className="relative w-9 h-9 flex items-center justify-center">
                  <img src="/src/assets/logo.svg" alt="Foresight Logo" className="w-full h-full object-contain" />
                </div>
              </div>
              <span className={`text-xl font-extrabold tracking-tighter heading-font ${isDark ? 'text-white' : 'text-slate-900'}`}>Foresight</span>
            </div>
          )}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className={`hidden lg:flex p-1.5 rounded-lg hover:bg-zinc-800/10 transition-colors ${isDark ? 'text-zinc-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}
          >
            {isCollapsed ? <ChevronRightIcon className="w-4 h-4" /> : <ChevronLeftIcon className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {menuItems.map((item) => {
            if (!item.public && !isLoggedIn) return null;
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={`
                  relative flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all group
                  ${active
                    ? (isDark ? 'bg-blue-600/10 text-white shadow-sm' : 'bg-blue-50 text-blue-600')
                    : (isDark ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100')
                  }
                  ${isCollapsed && !isMobileOpen ? 'justify-center' : ''}
                `}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 transition-colors ${active ? (isDark ? 'text-blue-500' : 'text-blue-600') : 'group-hover:text-blue-500'}`} />
                {(!isCollapsed || isMobileOpen) && (
                  <span className="text-[14px] font-medium">{item.name}</span>
                )}
                {active && !isCollapsed && (
                  <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(37,99,235,0.6)]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 space-y-1 border-t border-zinc-900/50">
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center space-x-3 px-3 py-2.5 transition-all group rounded-lg ${isCollapsed && !isMobileOpen ? 'justify-center' : ''} ${isDark ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            {(!isCollapsed || isMobileOpen) && <span className="text-[14px] font-medium">Theme</span>}
          </button>

          {isLoggedIn ? (
            <div className="space-y-1">
              <Link
                to="/profile"
                className={`w-full flex items-center space-x-3 px-3 py-2.5 transition-all group rounded-lg ${isCollapsed && !isMobileOpen ? 'justify-center' : ''} ${isDark ? 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900/50' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
              >
                {profile?.profile_pic_url ? (
                  <img src={profile.profile_pic_url} alt="Avatar" className="w-5 h-5 rounded-full object-cover border border-blue-500/20" />
                ) : (
                  <UserCircleIcon className="w-5 h-5 flex-shrink-0" />
                )}
                {(!isCollapsed || isMobileOpen) && <span className="text-[14px] font-medium truncate">{profile?.name || 'Profile'}</span>}
              </Link>
              <button
                onClick={onLogout}
                className={`w-full flex items-center space-x-3 px-3 py-2.5 transition-all group rounded-lg ${isCollapsed && !isMobileOpen ? 'justify-center' : ''} ${isDark ? 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/5' : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'}`}
              >
                <ArrowLeftOnRectangleIcon className="w-5 h-5 flex-shrink-0" />
                {(!isCollapsed || isMobileOpen) && <span className="text-[14px] font-medium">Logout</span>}
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center space-x-3 px-3 py-2.5 transition-all group rounded-lg ${isCollapsed && !isMobileOpen ? 'justify-center' : ''} ${isDark ? 'text-blue-500 hover:text-blue-400 hover:bg-blue-500/5' : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium'}`}
            >
              <UserCircleIcon className="w-5 h-5 flex-shrink-0" />
              {(!isCollapsed || isMobileOpen) && <span className="text-[14px] font-medium">Sign In</span>}
            </Link>
          )}
        </div>
      </aside>
    </>
  );
};

const App: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<'dark' | 'light' | 'system'>('system');
  const [activeTheme, setActiveTheme] = useState<'dark' | 'light'>('dark');
  const { user, profile, loading } = useAuth();

  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = (mode: 'dark' | 'light' | 'system') => {
      let resolvedTheme: 'dark' | 'light' = 'dark';
      if (mode === 'system') {
        resolvedTheme = mediaQuery.matches ? 'dark' : 'light';
      } else {
        resolvedTheme = mode;
      }

      setActiveTheme(resolvedTheme);
      root.setAttribute('data-theme', resolvedTheme);
    };

    applyTheme(themeMode);

    const listener = (e: MediaQueryListEvent) => {
      if (themeMode === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, [themeMode]);

  const toggleTheme = () => {
    setThemeMode(prev => {
      if (prev === 'dark') return 'light';
      if (prev === 'light') return 'system';
      return 'dark'; // system -> dark
    });
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  if (loading) {
    return (
      <div className={`min-h-screen flex items-center justify-center transition-colors duration-500 ${activeTheme === 'dark' ? 'bg-[#09090b]' : 'bg-[#fafafa]'}`}>
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className={`text-sm font-medium tracking-widest uppercase opacity-50 ${activeTheme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Initializing Terminal</p>
        </div>
      </div>
    );
  }

  const sidebarCollapsed = isCollapsed && !isHovered;

  return (
    <Router>
      <div className={`flex min-h-screen transition-colors duration-500 selection:bg-blue-500/30 overflow-x-hidden ${activeTheme === 'dark' ? 'bg-[#09090b] text-[#fafafa]' : 'bg-[#fafafa] text-[#0f172a]'}`}>
        <main className={`flex-1 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
          <div className="max-w-[1400px] mx-auto p-6 md:p-12 lg:p-16 lg:pb-0">
            <Routes>
              <Route path="/" element={<Landing theme={activeTheme} isLoggedIn={!!user} />} />
              <Route path="/login" element={!user ? <Login theme={activeTheme} /> : <Navigate to="/product" />} />
              <Route path="/signup" element={!user ? <Signup theme={activeTheme} /> : <Navigate to="/product" />} />
              <Route path="/product" element={user ? <Product theme={activeTheme} /> : <Navigate to="/login" />} />
              <Route path="/compare" element={user ? <Compare theme={activeTheme} /> : <Navigate to="/login" />} />
              <Route path="/profile" element={user ? <Profile theme={activeTheme} /> : <Navigate to="/login" />} />
              {/* Note: Settings now consumes themeMode directly instead of activeTheme to track the system explicitly */}
              <Route path="/settings" element={user ? <Settings theme={themeMode} setTheme={setThemeMode} activeTheme={activeTheme} /> : <Navigate to="/login" />} />
            </Routes>
          </div>
        </main>
        <div
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Sidebar
            isCollapsed={sidebarCollapsed}
            setIsCollapsed={setIsCollapsed}
            isMobileOpen={isMobileOpen}
            setMobileOpen={setMobileOpen}
            theme={activeTheme}
            toggleTheme={toggleTheme}
            isLoggedIn={!!user}
            onLogout={handleLogout}
            profile={profile}
          />
        </div>
      </div>
    </Router>
  );
};

export default App;