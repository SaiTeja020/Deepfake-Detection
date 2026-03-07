import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { auth } from '../firebase';
import { syncUser } from '../services/api';

const Login: React.FC<{ theme: 'dark' | 'light', onLogin?: () => void }> = ({ theme, onLogin }) => {
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      if (onLogin) onLogin();
      navigate('/product');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to initialize session.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 transition-colors duration-500 ${isDark ? 'bg-[#050505]' : 'bg-slate-50'}`}>

      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-20 ${isDark ? 'bg-blue-600' : 'bg-blue-200'}`} />
        <div className={`absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-10 ${isDark ? 'bg-purple-600' : 'bg-purple-200'}`} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`relative w-full max-w-lg overflow-hidden rounded-[2rem] border backdrop-blur-xl shadow-2xl 
          ${isDark ? 'bg-zinc-900/40 border-white/10 shadow-black' : 'bg-white/80 border-slate-200 shadow-slate-200/50'}`}
      >
        {/* Decorative Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />

        <div className="p-8 sm:p-12">
          <header className="flex flex-col items-center text-center mb-10">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className={`p-4 rounded-2xl mb-6 shadow-inner ${isDark ? 'bg-zinc-800/50' : 'bg-slate-100'}`}
            >
              <img src="/src/assets/logo.svg" alt="Logo" className="w-12 h-12 sm:w-16 sm:h-16" />
            </motion.div>
            <h2 className={`text-3xl font-extrabold tracking-tight mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Welcome to Foresight
            </h2>
            <p className={`text-sm font-medium ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              Sign in to access facial forensics terminal.
            </p>
          </header>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className={`mb-6 p-4 rounded-xl text-xs font-medium border ${isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'}`}
            >
              {error}
            </motion.div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-[0.2em] ml-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Identifier</label>
              <div className="relative">
                <EnvelopeIcon className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${isDark ? 'text-zinc-600' : 'text-slate-400'}`} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-12 pr-4 py-4 rounded-2xl border outline-none transition-all text-sm
                    ${isDark
                      ? 'bg-zinc-950/50 border-zinc-800 text-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                      : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5'}`}
                  placeholder="analyst@foresight.ai"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between ml-1">
                <label className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Security Key</label>
                <button type="button" className="text-[10px] font-bold text-blue-500 hover:text-blue-400 transition-colors uppercase tracking-wider">Reset</button>
              </div>
              <div className="relative">
                <LockClosedIcon className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${isDark ? 'text-zinc-600' : 'text-slate-400'}`} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-12 pr-4 py-4 rounded-2xl border outline-none transition-all text-sm
                    ${isDark
                      ? 'bg-zinc-950/50 border-zinc-800 text-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
                      : 'bg-white border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5'}`}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className={`w-full py-4 mt-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-3 group ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <span className="tracking-wide">
                {isLoading ? 'Processing...' : 'Initialize Session'}
              </span>
              {!isLoading && <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </motion.button>
          </form>

          <footer className="mt-6 pt-6 border-t border-zinc-500/10 flex justify-center">
            <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              Don't have an account?{"  "}
              <Link
                to="/signup"
                className="ml-1 text-xs font-bold text-blue-600 uppercase tracking-widest hover:text-blue-500 transition-colors"
              >
                Sign Up
              </Link>
            </p>
          </footer>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;