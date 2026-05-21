import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    KeyIcon,
    ArrowRightOnRectangleIcon,
    ExclamationTriangleIcon,
    MoonIcon,
    SunIcon,
    ComputerDesktopIcon,
    EyeIcon,
    EyeSlashIcon,
    CheckCircleIcon,
    XCircleIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';
import {
    signOut,
    updatePassword,
    deleteUser,
    EmailAuthProvider,
    reauthenticateWithCredential
} from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { syncUser } from "../services/api";
import NeuralMesh from "../components/NeuralMesh";

interface SettingsProps {
    theme: 'dark' | 'light' | 'system';
    setTheme: React.Dispatch<React.SetStateAction<'dark' | 'light' | 'system'>>;
    activeTheme: 'dark' | 'light';
}

const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    activeTheme,
}: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    activeTheme: 'dark' | 'light';
}) => {
    if (!isOpen) return null;

    return (
        <div
            className="settings-modal-overlay"
            onClick={onClose}
        >
            <div
                className="settings-modal-content"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="settings-modal-header">
                    <h3 className="settings-modal-title">{title}</h3>
                    <button
                        onClick={onClose}
                        className="settings-modal-close"
                    >
                        <span className="sr-only">Close</span>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="settings-modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
};

const Settings: React.FC<SettingsProps> = ({ theme, setTheme, activeTheme }) => {
    const navigate = useNavigate();
    const { user: firebaseUser, profile, refreshProfile } = useAuth();
    // Toggles state
    const [saveImages, setSaveImages] = useState(profile?.save_history ?? false);
    const [allowData, setAllowData] = useState(() => {
        return localStorage.getItem('foresight_allow_data') !== 'false';
    });

    const handleToggleAllowData = () => {
        const newValue = !allowData;
        setAllowData(newValue);
        localStorage.setItem('foresight_allow_data', newValue.toString());
        showToast('✓ Privacy preferences updated', 'success');
    };

    useEffect(() => {
        if (profile) {
            setSaveImages(profile.save_history);
        }
    }, [profile]);

    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const [newPassword, setNewPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);

    // Password Strength
    const calculateStrength = (pass: string) => {
        let score = 0;
        if (!pass) return { label: '', score: 0, color: '', text: '' };
        if (pass.length >= 8) score += 1;
        if (/[A-Z]/.test(pass)) score += 1;
        if (/[a-z]/.test(pass)) score += 1;
        if (/[0-9]/.test(pass)) score += 1;
        if (/[^A-Za-z0-9]/.test(pass)) score += 1;

        if (score <= 1) return { label: 'Very Weak', score, color: 'bg-rose-500', text: 'text-rose-500' };
        if (score === 2) return { label: 'Weak', score, color: 'bg-orange-500', text: 'text-orange-500' };
        if (score === 3) return { label: 'Medium', score, color: 'bg-yellow-500', text: 'text-yellow-500' };
        if (score === 4) return { label: 'Strong', score, color: 'bg-emerald-400', text: 'text-emerald-400' };
        return { label: 'Very Strong', score, color: 'bg-emerald-600', text: 'text-emerald-600' };
    };
    const strength = calculateStrength(newPassword);

    // Modals
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [deleteInput, setDeleteInput] = useState('');

    return (
        <>
            <NeuralMesh isDark={activeTheme === 'dark'} noLines={true} />

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.95 }}
                        className={`fixed top-8 right-8 z-[9999] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border ${activeTheme === 'dark' ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}`}
                    >
                        {toast.type === 'success' ? (
                            <CheckCircleIcon className="w-6 h-6 text-emerald-500" />
                        ) : (
                            <XCircleIcon className="w-6 h-6 text-rose-500" />
                        )}
                        <span className={`text-sm font-bold tracking-wide ${activeTheme === 'dark' ? 'text-zinc-100' : 'text-slate-900'}`}>{toast.message}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="settings-container fade-in">
                <header className="settings-header-section">
                    <h1 className="settings-title">Settings</h1>
                    <p className="settings-subtitle">Manage your account and platform preferences.</p>
                </header>

                <div className="space-y-16">

                    {/* 1. ACCOUNT */}
                    <section>
                        <h2 className="settings-section-title">
                            Account
                        </h2>

                        <div className="space-y-4">
                            {/* Account Information Card */}
                            {firebaseUser && (
                                <div className="settings-card group mb-4">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-4">Account Overview</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Status</p>
                                            <p className={`text-sm font-medium ${firebaseUser.emailVerified ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500'}`}>
                                                {firebaseUser.emailVerified ? '✓ Verified Account' : 'Verification Pending'}
                                            </p>
                                        </div>
                                        {firebaseUser.metadata.creationTime && (
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Account Created</p>
                                                <p className="text-sm font-medium dark:text-zinc-300">{new Date(firebaseUser.metadata.creationTime).toLocaleDateString()}</p>
                                            </div>
                                        )}
                                        {firebaseUser.metadata.lastSignInTime && (
                                            <div>
                                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Last Login</p>
                                                <p className="text-sm font-medium dark:text-zinc-300">{new Date(firebaseUser.metadata.lastSignInTime).toLocaleDateString()}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Email Field container */}
                            <div className="settings-card group">
                                <div className="settings-flex-col-sm-row">
                                    <div>
                                        <label htmlFor="email" className="settings-label">Email Address</label>
                                        <p className="settings-description">Must be verified to receive security alerts.</p>
                                    </div>
                                    <div className="settings-flex-center">
                                        <input
                                            type="email"
                                            id="email"
                                            defaultValue={profile?.email || firebaseUser?.email || "admin@foresight.io"}
                                            readOnly
                                            className="settings-input settings-input-readonly"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Logout & Password */}
                            <div className="settings-flex-col-sm-row">
                                <button
                                    onClick={() => setIsPasswordModalOpen(true)}
                                    className="settings-btn"
                                >
                                    <KeyIcon className="w-4 h-4 opacity-70" />
                                    Change Password
                                </button>
                                <button
                                    onClick={async () => {
                                        try {
                                            await signOut(auth);
                                            navigate('/login');
                                        } catch (error: any) {
                                            showToast(error.message || "Failed to logout. Please try again.", 'error');
                                        }
                                    }}
                                    className="settings-btn"
                                >
                                    <ArrowRightOnRectangleIcon className="w-4 h-4 opacity-70" />
                                    Logout
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* 2. APPEARANCE */}
                    <section>
                        <h2 className="settings-section-title">
                            Appearance
                        </h2>

                        <div className="settings-card">
                            <div className="settings-flex-col-sm-row">
                                <div>
                                    <p className="settings-label">Color Theme</p>
                                    <p className="settings-description">Select or customize your UI workspace.</p>
                                </div>

                                <div className="settings-theme-selector">
                                    {[
                                        { id: 'light', label: 'Light', icon: SunIcon },
                                        { id: 'dark', label: 'Dark', icon: MoonIcon },
                                        { id: 'system', label: 'System', icon: ComputerDesktopIcon }
                                    ].map((t) => (
                                        <button
                                            key={t.id}
                                            onClick={() => setTheme(t.id as any)}
                                            className={`settings-theme-btn ${theme === t.id ? 'active' : ''}`}
                                        >
                                            <t.icon className="w-3.5 h-3.5" />
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* 3. PRIVACY */}
                    <section>
                        <h2 className="settings-section-title">
                            Privacy
                        </h2>

                        <div className="settings-toggle-group">
                            {/* Toggle 1 */}
                            <div className="settings-toggle-item group"
                                onClick={async () => {
                                    const newValue = !saveImages;
                                    setSaveImages(newValue);
                                    if (firebaseUser) {
                                        try {
                                            await syncUser({
                                                firebase_uid: firebaseUser.uid,
                                                email: firebaseUser.email || profile?.email || '',
                                                save_history: newValue
                                            });
                                            await refreshProfile();
                                            showToast('✓ Privacy preferences updated', 'success');
                                        } catch (err) {
                                            console.error("Failed to update save history preference:", err);
                                            // Revert on error
                                            setSaveImages(!newValue);
                                            showToast('Failed to update privacy preferences', 'error');
                                        }
                                    }
                                }}>
                                <div className="pr-4">
                                    <p className="settings-label group-hover:text-slate-900 dark:group-hover:text-blue-200 transition-colors">Save Analysis History</p>
                                    <p className="settings-description">Store uploaded images securely for 30 days.</p>
                                </div>
                                <button
                                    role="switch"
                                    aria-checked={saveImages}
                                    className="settings-switch"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="settings-switch-thumb"
                                    />
                                </button>
                            </div>
                            {/* Toggle 2 */}
                            <div className="settings-toggle-item group" onClick={handleToggleAllowData}>
                                <div className="pr-4">
                                    <p className="settings-label group-hover:text-slate-900 dark:group-hover:text-blue-200 transition-colors">Anonymous Usage Data</p>
                                    <p className="settings-description">Help improve forensic models by sharing telemetry.</p>
                                </div>
                                <button
                                    role="switch"
                                    aria-checked={allowData}
                                    className="settings-switch"
                                >
                                    <span
                                        aria-hidden="true"
                                        className="settings-switch-thumb"
                                    />
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* 4. SECURITY */}
                    <section>
                        <h2 className="settings-section-title">
                            Security
                        </h2>

                        <div className="settings-card group">
                            <div className="settings-flex-col-sm-row">
                                <div>
                                    <p className="settings-label">Account Password</p>
                                    <p className="settings-description">Last changed 4 months ago.</p>
                                </div>
                                <button
                                    onClick={() => setIsPasswordModalOpen(true)}
                                    className="settings-btn-outline"
                                >
                                    Update Password
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* 5. DANGER ZONE */}
                    <section className="settings-danger-zone">
                        <div className="settings-danger-card group">
                            <div className="settings-flex-col-sm-row" style={{ width: '100%' }}>
                                <div>
                                    <h3 className="text-sm font-medium text-rose-700 dark:text-rose-500 mb-1">Delete Account</h3>
                                    <p className="text-xs text-rose-600/70 dark:text-rose-400/80 max-w-sm mb-2">
                                        Permanently remove your account and all associated forensic data.
                                    </p>
                                    <p className="text-xs font-bold text-rose-600 dark:text-rose-400 max-w-sm">
                                        This action cannot be undone. All scans, reports, account settings, and stored forensic history will be permanently removed.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setIsDeleteModalOpen(true)}
                                    className="settings-btn-danger"
                                >
                                    Delete Account
                                </button>
                            </div>
                        </div>
                    </section>

                </div>

                {/* MODALS */}

                {/* Change Password Modal */}
                <Modal
                    activeTheme={activeTheme}
                    isOpen={isPasswordModalOpen}
                    onClose={() => setIsPasswordModalOpen(false)}
                    title="Change Password"
                >
                    <div className="space-y-4">
                        <div>
                            <label className="settings-label">Current Password</label>
                            <div className="relative">
                                <input
                                    type={showCurrentPassword ? "text" : "password"}
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    className="settings-input pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                                >
                                    {showCurrentPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="settings-label">New Password</label>
                            <div className="relative">
                                <input
                                    type={showNewPassword ? "text" : "password"}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="settings-input pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                                >
                                    {showNewPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                                </button>
                            </div>
                            {newPassword && (
                                <div className="mt-3 space-y-2">
                                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                                        <span className="opacity-50">Strength</span>
                                        <span className={strength.text}>{strength.label}</span>
                                    </div>
                                    <div className="flex gap-1 h-1.5">
                                        {[1, 2, 3, 4, 5].map((level) => (
                                            <div
                                                key={level}
                                                className={`flex-1 rounded-full transition-all duration-300 ${level <= strength.score ? strength.color : 'bg-slate-200 dark:bg-zinc-800'}`}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="mt-8 flex justify-end gap-3">
                        <button
                            onClick={() => setIsPasswordModalOpen(false)}
                            className="settings-btn-ghost"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={!currentPassword || !newPassword || strength.score < 3}
                            onClick={async () => {
                                if (
                                    !firebaseUser ||
                                    !firebaseUser.email ||
                                    !newPassword ||
                                    !currentPassword
                                ) {
                                    showToast(
                                        'Please enter your current password.',
                                        'error'
                                    );
                                    return;
                                }

                                try {
                                    // Verify current password first
                                    const credential =
                                        EmailAuthProvider.credential(
                                            firebaseUser.email,
                                            currentPassword
                                        );

                                    await reauthenticateWithCredential(
                                        firebaseUser,
                                        credential
                                    );

                                    // Change password
                                    await updatePassword(
                                        firebaseUser,
                                        newPassword
                                    );

                                    showToast(
                                        '✓ Password updated successfully',
                                        'success'
                                    );

                                    setNewPassword('');
                                    setCurrentPassword('');
                                    setIsPasswordModalOpen(false);

                                } catch (error: any) {
                                    if (
                                        error.code === 'auth/wrong-password' ||
                                        error.code === 'auth/invalid-credential'
                                    ) {
                                        showToast(
                                            'Current password is incorrect.',
                                            'error'
                                        );
                                    } else if (
                                        error.code === 'auth/requires-recent-login'
                                    ) {
                                        showToast(
                                            'Session expired. Please log out and log back in to change your password.',
                                            'error'
                                        );
                                    } else if (
                                        error.code === 'auth/too-many-requests'
                                    ) {
                                        showToast(
                                            'Too many attempts. Try again later.',
                                            'error'
                                        );
                                    } else {
                                        showToast(
                                            error.message || 'Failed to update password.',
                                            'error'
                                        );
                                    }
                                }
                            }}
                            className={`settings-btn-primary ${(!currentPassword || !newPassword || strength.score < 3) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            Save Password
                        </button>
                    </div>
                </Modal>

                {/* First Delete Modal */}
                <Modal
                    activeTheme={activeTheme}
                    isOpen={isDeleteModalOpen}
                    onClose={() => setIsDeleteModalOpen(false)}
                    title="Account Deletion"
                >
                    <div className="flex items-start gap-4 mb-6">
                        <div className="p-2 rounded-full bg-rose-50 dark:bg-rose-500/10 shrink-0 border border-rose-100 dark:border-transparent">
                            <ExclamationTriangleIcon className="w-6 h-6 text-rose-500 dark:text-rose-500" />
                        </div>
                        <div>
                            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">Delete this account?</h4>
                            <p className="text-sm text-blue-600 dark:text-blue-500 leading-relaxed">
                                This will permanently delete your account, analysis history, and active sessions.
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setIsDeleteModalOpen(false)}
                            className="settings-btn-ghost"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                setIsDeleteModalOpen(false);
                                setTimeout(() => setIsDeleteConfirmOpen(true), 250); // wait for exit anim
                            }}
                            className="settings-btn-danger-solid"
                        >
                            Proceed to Delete
                        </button>
                    </div>
                </Modal>

                {/* Second Delete Modal (Confirmation step) */}
                <Modal
                    activeTheme={activeTheme}
                    isOpen={isDeleteConfirmOpen}
                    onClose={() => setIsDeleteConfirmOpen(false)}
                    title="Final Confirmation"
                >
                    <div className="space-y-4 mb-8">
                        <p className="settings-label">
                            Please type <strong className="font-semibold text-blue-900 dark:text-white">delete my account</strong> to confirm.
                        </p>
                        <input
                            type="text"
                            placeholder="delete my account"
                            value={deleteInput}
                            onChange={e => setDeleteInput(e.target.value)}
                            className={`settings-input ${deleteInput && deleteInput !== 'delete my account' ? 'settings-input-error' : ''}`}
                        />
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => {
                                setIsDeleteConfirmOpen(false);
                                setDeleteInput('');
                            }}
                            className="settings-btn-ghost"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={deleteInput !== 'delete my account'}
                            onClick={async () => {
                                if (firebaseUser) {
                                    try {
                                        await deleteUser(firebaseUser);
                                        showToast('Account deleted forever.', 'success');
                                        setIsDeleteConfirmOpen(false);
                                    } catch (error: any) {
                                        if (error.code === 'auth/requires-recent-login') {
                                            showToast('For your security, please log out and log back in before deleting your account.', 'error');
                                        } else {
                                            showToast(error.message || 'Failed to delete account. You may need to login again.', 'error');
                                        }
                                    }
                                }
                            }}
                            className={`settings-btn-danger-solid ${deleteInput !== 'delete my account' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            Permanently Delete
                        </button>
                    </div>
                </Modal>

            </div>
        </>
    );
};

export default Settings;
