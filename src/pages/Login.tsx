import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { syncUser } from '../services/api';

const Login: React.FC<{ theme: 'dark' | 'light', onLogin: () => void }> = ({ theme, onLogin }) => {
  const navigate = useNavigate();
  const isDark = theme === 'dark';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      let userCredential;
      if (isSigningUp) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
      }

      const user = userCredential.user;

      // Sync with Supabase & Firestore via Flask Backend
      await syncUser({
        firebase_uid: user.uid,
        email: user.email,
        name: user.displayName || email.split('@')[0],
        profile_pic_url: user.photoURL,
        save_history: true
      });

      onLogin();
      navigate('/product');
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 fade-in">
      <div className={`w-full max-w-md p-8 md:p-12 rounded-2xl border shadow-xl ${isDark ? 'bg-zinc-950 border-zinc-900 shadow-black/20' : 'bg-white border-slate-200 shadow-slate-200/50'}`}>
        <div className="flex flex-col items-center text-center space-y-6 mb-10">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
            <div className="w-6 h-6 border-2 border-white rounded-sm rotate-45" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">{isSigningUp ? 'Create Analyst Account' : 'Welcome to Foresight'}</h2>
            <p className={`text-sm ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              {isSigningUp ? 'Register for access to facial forensics terminal.' : 'Sign in to access facial forensics terminal.'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-medium">
            {error}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>Email Address</label>
            <div className="relative group">
              <EnvelopeIcon className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${isDark ? 'text-zinc-600 group-focus-within:text-blue-500' : 'text-slate-400 group-focus-within:text-blue-600'}`} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full pl-12 pr-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-zinc-900 border-zinc-800 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10' : 'bg-slate-50 border-slate-200 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5'}`}
                placeholder="analyst@foresight.ai"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>Password</label>
              {!isSigningUp && <button type="button" className="text-xs font-semibold text-blue-600 hover:text-blue-500">Forgot password?</button>}
            </div>
            <div className="relative group">
              <LockClosedIcon className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${isDark ? 'text-zinc-600 group-focus-within:text-blue-500' : 'text-slate-400 group-focus-within:text-blue-600'}`} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full pl-12 pr-4 py-3 rounded-xl border outline-none transition-all ${isDark ? 'bg-zinc-900 border-zinc-800 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10' : 'bg-slate-50 border-slate-200 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5'}`}
                placeholder="••••••••"
              />
            </div>
          </div>

          {!isSigningUp && (
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="remember" className={`text-sm ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>Remember me</label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 hover:bg-blue-700 hover:shadow-blue-600/30 flex items-center justify-center space-x-2 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{isSigningUp ? 'Initialize Node' : 'Sign In'}</span>
                <ArrowRightIcon className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-zinc-900/10 flex flex-col items-center space-y-4">
          <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
            {isSigningUp ? 'Already have credentials?' : "Don't have an account?"}
          </p>
          <button
            type="button"
            onClick={() => setIsSigningUp(!isSigningUp)}
            className="text-xs font-bold text-blue-600 uppercase tracking-widest hover:blue-500"
          >
            {isSigningUp ? 'Access Terminal' : 'Request Access'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;