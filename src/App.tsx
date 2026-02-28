import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Product from './pages/Product';
import Compare from './pages/Compare';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Login from './pages/Login';
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

const Sidebar = ({ isCollapsed, setIsCollapsed, isMobileOpen, setMobileOpen, theme, toggleTheme, onLogout, isLoggedIn }: {
  isCollapsed: boolean,
  setIsCollapsed: (v: boolean) => void,
  isMobileOpen: boolean,
  setMobileOpen: (v: boolean) => void,
  theme: 'dark' | 'light',
  toggleTheme: () => void,
  onLogout: () => void,
  isLoggedIn: boolean
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
          <div className="flex items-center space-x-3">
            <div className="relative w-9 h-9 flex items-center justify-center">
              <img src="/src/assets/logo.svg" alt="Foresight Logo" className="w-full h-full object-contain" />
            </div>
            {!isCollapsed && (
              <span className={`text-xl font-extrabold tracking-tighter heading-font ${isDark ? 'text-white' : 'text-slate-900'}`}>Foresight</span>
            )}
          </div>
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
            <button
              onClick={onLogout}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 transition-all group rounded-lg ${isCollapsed && !isMobileOpen ? 'justify-center' : ''} ${isDark ? 'text-zinc-500 hover:text-rose-400 hover:bg-rose-500/5' : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50'}`}
            >
              <ArrowLeftOnRectangleIcon className="w-5 h-5 flex-shrink-0" />
              {(!isCollapsed || isMobileOpen) && <span className="text-[14px] font-medium">Logout</span>}
            </button>
          ) : (
            <Link
              to="/login"
              className={`flex items-center space-x-3 px-3 py-2.5 transition-all group rounded-lg ${isCollapsed && !isMobileOpen ? 'justify-center' : ''} ${isDark ? 'text-blue-500 hover:text-blue-400 hover:bg-blue-500/5' : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-medium'}`}
            >
              <UserCircleIcon className="w-5 h-5 flex-shrink-0" />
              {(!isCollapsed || isMobileOpen) && <span className="text-[14px] font-medium">Sign In</span>}
            </Link>
          )}
        </div>
      </aside >
    </>
  );
};

const NavHeader = ({ theme, isLoggedIn, isMobileOpen, setMobileOpen }: {
  theme: 'dark' | 'light',
  isLoggedIn: boolean,
  isMobileOpen: boolean,
  setMobileOpen: (v: boolean) => void
}) => {
  const isDark = theme === 'dark';
  return (
    <header className={`sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b px-6 md:px-8 backdrop-blur-xl transition-colors duration-500 ${isDark ? 'bg-[#09090b]/80 border-zinc-900/50' : 'bg-white/90 border-slate-200/60'}`}>
      <div className="flex items-center space-x-3">
        <img src="/src/assets/logo.svg" alt="Foresight Logo" className="w-8 h-8 object-contain" />
        <span className={`text-lg font-black tracking-tighter heading-font uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Foresight</span>
      </div>

      <div className="flex items-center space-x-4 md:space-x-6">
        <nav className={`hidden md:flex items-center space-x-6 text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <Link to="/product" className="hover:text-primary transition-colors">Analyze</Link>
          <Link to="/compare" className="hover:text-primary transition-colors">Models</Link>
        </nav>
        {!isLoggedIn && (
          <Link
            to="/login"
            className={`px-4 py-1.5 md:px-5 md:py-2 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all ${isDark ? 'bg-white text-black hover:bg-zinc-200' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
          >
            Sign In
          </Link>
        )}
        <button
          onClick={() => setMobileOpen(!isMobileOpen)}
          className={`p-2 rounded-lg transition-all border lg:hidden ${isDark ? 'bg-zinc-900 border-zinc-800 text-white/70' : 'bg-white border-slate-200 text-slate-600'}`}
        >
          {isMobileOpen ? <XMarkIcon className="w-5 h-5" /> : <Bars3Icon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
};

const App: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  const handleLogin = () => setIsLoggedIn(true);
  const handleLogout = () => setIsLoggedIn(false);

  const sidebarCollapsed = isCollapsed && !isHovered;

  return (
    <Router>
      <div className={`flex min-h-screen transition-colors duration-500 selection:bg-blue-500/30 overflow-x-hidden ${theme === 'dark' ? 'bg-[#09090b] text-[#fafafa]' : 'bg-[#fafafa] text-[#0f172a]'}`}>
        <main className={`flex-1 transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'}`}>
          <NavHeader theme={theme} isLoggedIn={isLoggedIn} isMobileOpen={isMobileOpen} setMobileOpen={setMobileOpen} />
          <div className="max-w-[1400px] mx-auto p-6 md:p-12 lg:p-16 lg:pt-8 lg:pb-0">
            <Routes>
              <Route path="/" element={<Landing theme={theme} isLoggedIn={isLoggedIn} />} />
              <Route path="/login" element={!isLoggedIn ? <Login theme={theme} onLogin={handleLogin} /> : <Navigate to="/product" />} />
              <Route path="/product" element={isLoggedIn ? <Product theme={theme} /> : <Navigate to="/login" />} />
              <Route path="/compare" element={isLoggedIn ? <Compare theme={theme} /> : <Navigate to="/login" />} />
              <Route path="/profile" element={isLoggedIn ? <Profile theme={theme} /> : <Navigate to="/login" />} />
              <Route path="/settings" element={isLoggedIn ? <Settings theme={theme} toggleTheme={toggleTheme} /> : <Navigate to="/login" />} />
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
            theme={theme}
            toggleTheme={toggleTheme}
            isLoggedIn={isLoggedIn}
            onLogout={handleLogout}
          />
        </div>
      </div>
    </Router>
  );
};

export default App;