import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import {
    UserIcon,
    EnvelopeIcon,
    LockClosedIcon,
    ShieldCheckIcon,
    ArrowRightIcon,
    SparklesIcon
} from '@heroicons/react/24/outline';
import { auth } from "../firebase";
import { syncUser } from "../services/api";

const Signup: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
    const navigate = useNavigate();
    const isDark = theme === 'dark';

    const [formData, setFormData] = useState({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (formData.password !== formData.confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setIsLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
            await updateProfile(userCredential.user, {
                displayName: formData.fullName
            });

            // Sync with Supabase & Firestore via Flask Backend
            await syncUser({
                firebase_uid: userCredential.user.uid,
                email: userCredential.user.email || formData.email,
                name: formData.fullName,
                profile_pic_url: null,
                save_history: true
            });

            navigate('/login');
        } catch (err: any) {
            setError(err.message || 'Failed to create identity.');
        } finally {
            setIsLoading(false);
        }
    };

    const inputStyles = `w-full pl-12 pr-4 py-4 rounded-2xl border outline-none transition-all text-sm
    ${isDark
            ? 'bg-zinc-950/30 border-zinc-800 text-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
            : 'bg-white/50 border-slate-200 text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/5'}`;

    const labelStyles = `text-[10px] font-bold uppercase tracking-[0.2em] ml-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`;

    return (
        <div className={`min-h-screen w-full flex items-center justify-center p-4 sm:p-8 transition-colors duration-500 ${isDark ? 'bg-[#050505]' : 'bg-slate-50'}`}>

            {/* Dynamic Mesh Gradient Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        rotate: [0, 90, 0],
                    }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                    className={`absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full blur-[120px] opacity-20 ${isDark ? 'bg-blue-900' : 'bg-blue-100'}`}
                />
                <motion.div
                    animate={{
                        scale: [1, 1.3, 1],
                        rotate: [0, -90, 0],
                    }}
                    transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                    className={`absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[120px] opacity-15 ${isDark ? 'bg-indigo-900' : 'bg-indigo-100'}`}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] border backdrop-blur-2xl shadow-2xl 
          ${isDark ? 'bg-zinc-900/60 border-white/10' : 'bg-white/70 border-white shadow-slate-200/50'}`}
            >
                <div className="flex flex-col md:flex-row">
                    {/* Left Side: Branding/Value Prop */}
                    <div className={`hidden md:flex md:w-2/5 p-12 flex-col justify-between border-r ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/50'}`}>
                        <div className="space-y-4">
                            <img src="/src/assets/logo.svg" alt="Foresight Logo" className="w-7 h-7" />
                            <h1 className={`text-2xl font-bold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                Expose the synthetic. <br />Protect the truth.
                            </h1>
                            <p className={`text-sm leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                                Deploying Transformers to detect subtle artifacts in facial geometry and temporal inconsistencies that the human eye misses.
                            </p>

                            {/* Tech Specs List - Adds "Modern" flavor */}
                            <ul className={`text-[11px] space-y-2 font-mono ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>
                                <li className="flex items-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2" />
                                    Multi-Head Attention Analysis
                                </li>
                                <li className="flex items-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2" />
                                    Patch-level Forgery Detection
                                </li>
                                <li className="flex items-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2" />
                                    Real-time Inference Engine
                                </li>
                            </ul>
                        </div>

                        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
                            <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: "99.4%" }}
                                    transition={{ duration: 1.5, ease: "easeOut" }}
                                    className="h-full bg-gradient-to-r from-blue-600 to-emerald-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Form */}
                    <div className="flex-1 p-8 sm:p-12">
                        <header className="mb-8">
                            <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Create Account</h2>
                            <p className={`text-sm mt-1 ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>Start your 14-day clearance trial.</p>
                        </header>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className={`p-4 rounded-xl text-xs font-medium border ${isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'}`}
                                >
                                    {error}
                                </motion.div>
                            )}
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1.5">
                                    <label className={labelStyles}>Full Name</label>
                                    <div className="relative">
                                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                        <input
                                            type="text"
                                            required
                                            className={inputStyles}
                                            placeholder="John Doe"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className={labelStyles}>Work Email</label>
                                    <div className="relative">
                                        <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                        <input
                                            type="email"
                                            required
                                            className={inputStyles}
                                            placeholder="name@agency.gov"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className={labelStyles}>Password</label>
                                        <div className="relative">
                                            <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                            <input
                                                type="password"
                                                required
                                                className={inputStyles}
                                                placeholder="••••••••"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelStyles}>Confirm</label>
                                        <div className="relative">
                                            <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                                            <input
                                                type="password"
                                                required
                                                className={inputStyles}
                                                placeholder="••••••••"
                                                value={formData.confirmPassword}
                                                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                type="submit"
                                disabled={isLoading}
                                className={`w-full py-4 mt-6 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-blue-600/30 flex items-center justify-center space-x-2 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                <span>{isLoading ? 'Processing...' : 'Create Identity'}</span>
                                {!isLoading && <ArrowRightIcon className="w-4 h-4" />}
                            </motion.button>
                        </form>

                        <p className={`mt-8 text-center text-xs ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                            Already have an account?{'  '}
                            <Link to="/login" className="text-blue-500 font-bold hover:underline">Sign In</Link>
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Signup;