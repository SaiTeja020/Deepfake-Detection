import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence, useSpring} from 'framer-motion';
import { signInWithEmailAndPassword } from 'firebase/auth';
import {
  EnvelopeIcon,
  LockClosedIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import { auth } from '../firebase';
import { syncUser } from '../services/api';
import NeuralMesh from '../components/NeuralMesh';

const useMousePosition = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const updateMousePosition = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', updateMousePosition);
    return () => window.removeEventListener('mousemove', updateMousePosition);
  }, []);

  return mousePosition;
};

const CustomCursor = ({ isDark }: { isDark: boolean }) => {
  const { x, y } = useMousePosition();
  const cursorX = useSpring(0, { damping: 25, stiffness: 300 });
  const cursorY = useSpring(0, { damping: 25, stiffness: 300 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [cursorX, cursorY]);

  return (
    <motion.div
      className="fixed top-0 left-0 z-[9999] pointer-events-none hidden lg:block"
      style={{
        x: cursorX,
        y: cursorY,
        translateX: '-50%',
        translateY: '-50%',
      }}
    >
      <div className="relative flex items-center justify-center">
        {/* Crosshair lines */}
        <div className="absolute h-8 w-[1px] bg-blue-500/40" />
        <div className="absolute w-8 h-[1px] bg-blue-500/40" />

        {/* Corner brackets */}
        <div className="absolute -top-4 -left-4 h-2 w-2 border-t border-l border-blue-500" />
        <div className="absolute -top-4 -right-4 h-2 w-2 border-t border-r border-blue-500" />
        <div className="absolute -bottom-4 -left-4 h-2 w-2 border-b border-l border-blue-500" />
        <div className="absolute -bottom-4 -right-4 h-2 w-2 border-b border-r border-blue-500" />

        {/* Center dot */}
        <div className="h-1 w-1 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.8)]" />

        {/* Scanning ring */}
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute h-10 w-10 rounded-full border border-blue-500/20"
        />

        {/* Coordinates */}
        <div className="absolute top-6 left-6 flex flex-col font-mono text-[7px] uppercase tracking-[0.2em] text-blue-500/60">
          <span>LAT: {((y / window.innerHeight) * 180 - 90).toFixed(4)}</span>
          <span>LNG: {((x / window.innerWidth) * 360 - 180).toFixed(4)}</span>
          <span className="mt-1 text-blue-500/30">SCANNING_ACTIVE</span>
        </div>
      </div>
    </motion.div>
  );
};

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
      await signInWithEmailAndPassword(auth, email, password);
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
    <div>
    <CustomCursor isDark={isDark} />
    <div className="auth-container">

      {/* Animated Mesh Background */}
      <NeuralMesh isDark={isDark} />

      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="auth-ambient-glow-1" />
        <div className="auth-ambient-glow-2" />
        <div className="auth-ambient-glow-3" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="auth-card"
      >
        {/* Decorative Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />

        <div className="p-8 sm:p-12">
          <header className="flex flex-col items-center text-center mb-10">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="auth-logo-container"
            >
              <img src="/src/assets/logo.svg" alt="Logo" className="w-12 h-12 sm:w-16 sm:h-16" />
            </motion.div>
            <h2 className="auth-title">
              Welcome to Foresight
            </h2>
            <p className="auth-subtitle">
              Sign in to access facial forensics terminal.
            </p>
          </header>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="auth-error"
            >
              {error}
            </motion.div>
          )}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label className="auth-label ml-1">Identifier</label>
              <div className="auth-input-container">
                <EnvelopeIcon className="auth-input-icon" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="auth-input"
                  placeholder="analyst@foresight.ai"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between ml-1">
                <label className="auth-label">Security Key</label>
                <button type="button" className="text-[10px] font-bold text-blue-500 hover:text-blue-400 transition-colors uppercase tracking-wider">Reset</button>
              </div>
              <div className="auth-input-container">
                <LockClosedIcon className="auth-input-icon" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="auth-input"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isLoading}
              className={`auth-btn-primary group ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <span className="tracking-wide">
                {isLoading ? 'Processing...' : 'Initialize Session'}
              </span>
              {!isLoading && <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
            </motion.button>
          </form>

          <footer className="auth-footer">
            <p className="auth-footer-text">
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
    </div>
  );
};

export default Login;