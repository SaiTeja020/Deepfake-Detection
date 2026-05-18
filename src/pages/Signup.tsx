import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import {
    UserIcon,
    EnvelopeIcon,
    LockClosedIcon,
    ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { auth } from "../firebase";
import { syncUser } from "../services/api";
import NeuralMesh from '../components/NeuralMesh';

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
            try {
                await syncUser({
                    firebase_uid: userCredential.user.uid,
                    email: userCredential.user.email || formData.email,
                    name: formData.fullName,
                    profile_pic_url: null,
                    bio: null,
                    save_history: true
                });
                navigate('/login');
            } catch (syncErr: any) {
                console.error("Sync error:", syncErr);
                const backendError = syncErr.response?.data?.errors?.join(' | ') || syncErr.response?.data?.error || syncErr.message;
                setError(`Identity created, but sync failed: ${backendError}`);
                // Don't navigate if sync failed, so user can see the error
            }
        } catch (err: any) {
            setError(err.message || 'Failed to create identity.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="auth-container">

            {/* Animated Mesh Background */}
            <NeuralMesh isDark={isDark} />

            {/* Dynamic Mesh Gradient Background */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="auth-ambient-glow-1" />
                <div className="auth-ambient-glow-2" />
                <div className="auth-ambient-glow-3" />
            </div>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="auth-card auth-card-wide"
            >
                <div className="flex flex-col md:flex-row">
                    {/* Left Side: Branding/Value Prop */}
                    <div className="auth-split-left">
                        <div className="space-y-4">
                            <img src="/src/assets/logo.svg" alt="Foresight Logo" className="w-7 h-7" />
                            <h1 className="auth-split-title">
                                Expose the synthetic. <br />Protect the truth.
                            </h1>
                            <p className="auth-split-desc">
                                Deploying Transformers to detect subtle artifacts in facial geometry and temporal inconsistencies that the human eye misses.
                            </p>

                            {/* Tech Specs List - Adds "Modern" flavor */}
                            <ul className="auth-tech-list">
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

                        <div className="auth-progress-container">
                            <div className="h-1 w-full bg-zinc-800/20 dark:bg-zinc-800 rounded-full overflow-hidden">
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
                    <div className="auth-split-right">
                        <header className="mb-8">
                            <h2 className="auth-title">Create Account</h2>
                            <p className="auth-subtitle">Start your 14-day clearance trial.</p>
                        </header>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="auth-error"
                                >
                                    {error}
                                </motion.div>
                            )}
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1.5">
                                    <label className="auth-label">Full Name</label>
                                    <div className="auth-input-container">
                                        <UserIcon className="auth-input-icon" />
                                        <input
                                            type="text"
                                            required
                                            className="auth-input"
                                            placeholder="John Doe"
                                            value={formData.fullName}
                                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="auth-label">Work Email</label>
                                    <div className="auth-input-container">
                                        <EnvelopeIcon className="auth-input-icon" />
                                        <input
                                            type="email"
                                            required
                                            className="auth-input"
                                            placeholder="name@agency.gov"
                                            value={formData.email}
                                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <label className="auth-label">Password</label>
                                        <div className="auth-input-container">
                                            <LockClosedIcon className="auth-input-icon" />
                                            <input
                                                type="password"
                                                required
                                                className="auth-input"
                                                placeholder="••••••••"
                                                value={formData.password}
                                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="auth-label">Confirm</label>
                                        <div className="auth-input-container">
                                            <LockClosedIcon className="auth-input-icon" />
                                            <input
                                                type="password"
                                                required
                                                className="auth-input"
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
                                className={`auth-btn-primary ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                <span>{isLoading ? 'Processing...' : 'Create Identity'}</span>
                                {!isLoading && <ArrowRightIcon className="w-4 h-4" />}
                            </motion.button>
                        </form>

                        <p className="mt-8 text-center text-xs text-slate-500 dark:text-zinc-500">
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