import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    KeyIcon,
    ArrowRightOnRectangleIcon,
    ExclamationTriangleIcon,
    MoonIcon,
    SunIcon,
    ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import { signOut, updatePassword, deleteUser } from "firebase/auth";
import { auth } from "../firebase";
import { useAuth } from "../context/AuthContext";
import { syncUser } from "../services/api";

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
            className={`fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4 transition-opacity duration-200 ${activeTheme === 'dark' ? 'bg-black/40' : 'bg-slate-900/20'}`}
            onClick={onClose}
        >
            <div
                className={`w-full max-w-md rounded-2xl shadow-xl overflow-hidden border ${activeTheme === 'dark' ? 'bg-[#121215] border-blue-900' : 'bg-blue-50 border-blue-200/50'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`px-6 py-4 border-b flex items-center justify-between ${activeTheme === 'dark' ? 'border-blue-900/50' : 'border-blue-100'}`}>
                    <h3 className={`text-sm font-semibold ${activeTheme === 'dark' ? 'text-blue-200' : 'text-blue-900'}`}>{title}</h3>
                    <button
                        onClick={onClose}
                        className={`p-1 rounded-md transition-colors duration-200 ${activeTheme === 'dark' ? 'text-blue-600 hover:text-blue-400' : 'text-blue-500 hover:text-blue-700'}`}
                    >
                        <span className="sr-only">Close</span>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-6">
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
    const [allowData, setAllowData] = useState(true);

    useEffect(() => {
        if (profile) {
            setSaveImages(profile.save_history);
        }
    }, [profile]);

    const [newPassword, setNewPassword] = useState('');

    // Modals
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false); // Second step

    return (
        <div className="w-full max-w-3xl mx-auto py-12 px-6 fade-in">
            <header className="mb-14">
                <h1 className="text-3xl font-bold tracking-tight text-blue-900 dark:text-blue-200 mb-2">Settings</h1>
                <p className="text-sm text-blue-600 dark:text-blue-500">Manage your account and platform preferences.</p>
            </header>

            <div className="space-y-16">

                {/* 1. ACCOUNT */}
                <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-600 mb-4 pb-2 border-b border-blue-200/60 dark:border-blue-900/60">
                        Account
                    </h2>

                    <div className="space-y-4">
                        {/* Email Field container */}
                        <div className={`p-5 rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out group ${activeTheme === 'dark' ? 'border-blue-900 bg-blue-950/60 hover:border-blue-800' : 'border-blue-200 bg-blue-50 hover:border-blue-400'}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-blue-800 dark:text-blue-400 mb-1">Email Address</label>
                                    <p className="text-xs text-blue-600 dark:text-blue-600">Must be verified to receive security alerts.</p>
                                </div>
                                <div className="flex w-full sm:w-auto items-center gap-3">
                                    <input
                                        type="email"
                                        id="email"
                                        defaultValue={profile?.email || firebaseUser?.email || "admin@foresight.io"}
                                        readOnly
                                        className={`w-full sm:w-64 px-3 py-2 text-sm rounded-lg border cursor-not-allowed focus:outline-none transition-all duration-200 ease-in-out ${activeTheme === 'dark' ? 'border-blue-900 bg-blue-950/40 text-blue-400' : 'border-blue-200 bg-blue-50 text-blue-800'}`}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Logout & Password */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => setIsPasswordModalOpen(true)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-sm transition-all duration-200 ease-in-out active:translate-y-0 active:shadow-none ${activeTheme === 'dark' ? 'border-blue-900 bg-blue-950/60 text-blue-400 hover:border-blue-800 hover:text-white hover:bg-blue-900/50' : 'border-blue-200/60 bg-blue-50 text-blue-800 hover:border-blue-400 hover:text-slate-900 hover:bg-blue-50 hover:-translate-y-[1px]'}`}
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
                                        alert(error.message || "Failed to logout. Please try again.");
                                    }
                                }}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-sm transition-all duration-200 ease-in-out active:translate-y-0 active:shadow-none ${activeTheme === 'dark' ? 'border-blue-900 bg-blue-950/60 text-blue-400 hover:border-blue-800 hover:text-white hover:bg-blue-900/50' : 'border-blue-200/60 bg-blue-50 text-blue-800 hover:border-blue-400 hover:text-slate-900 hover:bg-blue-50 hover:-translate-y-[1px]'}`}
                            >
                                <ArrowRightOnRectangleIcon className="w-4 h-4 opacity-70" />
                                Logout
                            </button>
                        </div>
                    </div>
                </section>

                {/* 2. APPEARANCE */}
                <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-600 mb-4 pb-2 border-b border-blue-200/60 dark:border-blue-900/60">
                        Appearance
                    </h2>

                    <div className={`p-5 rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out ${activeTheme === 'dark' ? 'border-blue-900 bg-blue-950/60 hover:border-blue-800' : 'border-blue-200 bg-blue-50 hover:border-blue-400'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                            <div>
                                <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1">Color Theme</p>
                                <p className="text-xs text-blue-600 dark:text-blue-600">Select or customize your UI workspace.</p>
                            </div>

                            <div className={`flex p-1 rounded-lg border overflow-hidden w-full sm:w-auto ${activeTheme === 'dark' ? 'bg-blue-950/50 border-blue-900' : 'bg-blue-100/50 border-blue-200/40'}`}>
                                {[
                                    { id: 'light', label: 'Light', icon: SunIcon },
                                    { id: 'dark', label: 'Dark', icon: MoonIcon },
                                    { id: 'system', label: 'System', icon: ComputerDesktopIcon }
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id as any)}
                                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all duration-200 ease-in-out ${theme === t.id
                                            ? (activeTheme === 'dark' ? 'bg-blue-900 text-blue-200 shadow-sm ring-1 ring-white/5' : 'bg-blue-50 text-blue-900 shadow-sm ring-1 ring-blue-200')
                                            : (activeTheme === 'dark' ? 'text-blue-600 hover:text-blue-400 hover:bg-blue-900/50' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50')
                                            }`}
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
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-600 mb-4 pb-2 border-b border-blue-200/60 dark:border-blue-900/60">
                        Privacy
                    </h2>

                    <div className={`rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out overflow-hidden divide-y ${activeTheme === 'dark' ? 'border-blue-900 bg-blue-950/60 hover:border-blue-800 divide-blue-900/50' : 'border-blue-200 bg-blue-50 hover:border-blue-400 divide-blue-200/50'}`}>
                        {/* Toggle 1 */}
                        <div className="p-5 flex items-center justify-between group cursor-pointer hover:bg-blue-50/80 dark:hover:bg-blue-950/60 transition-colors" 
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
                                    } catch (err) {
                                        console.error("Failed to update save history preference:", err);
                                        // Revert on error
                                        setSaveImages(!newValue);
                                    }
                                }
                            }}>
                            <div className="pr-4">
                                <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1 group-hover:text-slate-900 dark:group-hover:text-blue-200 transition-colors">Save Analysis History</p>
                                <p className="text-xs text-blue-600 dark:text-blue-600">Store uploaded images securely for 30 days.</p>
                            </div>
                            <button
                                role="switch"
                                aria-checked={saveImages}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${saveImages ? 'bg-blue-500' : 'bg-blue-400/80 dark:bg-blue-800'
                                    }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-blue-50 shadow-sm ring-0 transition duration-200 ease-in-out ${saveImages ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>
                        {/* Toggle 2 */}
                        <div className="p-5 flex items-center justify-between group cursor-pointer hover:bg-blue-50/80 dark:hover:bg-blue-950/60 transition-colors" onClick={() => setAllowData(!allowData)}>
                            <div className="pr-4">
                                <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1 group-hover:text-slate-900 dark:group-hover:text-blue-200 transition-colors">Anonymous Usage Data</p>
                                <p className="text-xs text-blue-600 dark:text-blue-600">Help improve forensic models by sharing telemetry.</p>
                            </div>
                            <button
                                role="switch"
                                aria-checked={allowData}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${allowData ? 'bg-blue-500' : 'bg-blue-400/80 dark:bg-blue-800'
                                    }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-blue-50 shadow-sm ring-0 transition duration-200 ease-in-out ${allowData ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>
                    </div>
                </section>

                {/* 4. SECURITY */}
                <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-blue-500 dark:text-blue-600 mb-4 pb-2 border-b border-blue-200/60 dark:border-blue-900/60">
                        Security
                    </h2>

                    <div className={`p-5 rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out group ${activeTheme === 'dark' ? 'border-blue-900 bg-blue-950/60 hover:border-blue-800' : 'border-blue-200 bg-blue-50 hover:border-blue-400'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-blue-800 dark:text-blue-400 mb-1">Account Password</p>
                                <p className="text-xs text-blue-600 dark:text-blue-600">Last changed 4 months ago.</p>
                            </div>
                            <button
                                onClick={() => setIsPasswordModalOpen(true)}
                                className={`w-full sm:w-auto px-4 py-2 rounded-lg border text-sm font-medium shadow-sm transition-all duration-200 ease-in-out ${activeTheme === 'dark' ? 'border-blue-800 bg-blue-900/50 text-blue-400 hover:bg-blue-900/60 hover:border-blue-700' : 'border-blue-200/80 bg-blue-50/80 text-blue-800 hover:bg-blue-50 hover:border-blue-400'}`}
                            >
                                Update Password
                            </button>
                        </div>
                    </div>
                </section>

                {/* 5. DANGER ZONE */}
                <section className="pt-8 mt-16 border-t border-blue-200/60 dark:border-blue-900">
                    <div className="p-6 rounded-xl border border-rose-200/50 dark:border-rose-900/30 bg-rose-50/50 dark:bg-rose-950/20 hover:border-rose-200/80 dark:hover:border-rose-900/50 hover:-translate-y-[1px] hover:shadow-sm transition-all duration-200 ease-in-out group">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                            <div>
                                <h3 className="text-sm font-medium text-rose-700 dark:text-rose-500 mb-1">Delete Account</h3>
                                <p className="text-xs text-rose-600/70 dark:text-rose-400/80 max-w-sm">
                                    Permanently remove your account and all associated forensic data. This action is irreversible.
                                </p>
                            </div>
                            <button
                                onClick={() => setIsDeleteModalOpen(true)}
                                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-rose-200/80 dark:border-rose-900/50 bg-blue-50 dark:bg-rose-950/50 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/50 hover:border-rose-300/80 dark:hover:border-rose-800/50 shadow-sm transition-all duration-200 ease-in-out active:scale-[0.98]"
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
                        <label className="block text-xs font-medium text-blue-700 dark:text-blue-500 mb-1.5">Current Password</label>
                        <input
                            type="password"
                            className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200 ${activeTheme === 'dark' ? 'border-blue-900 bg-[#0c0c0e] text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-900'}`}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-blue-700 dark:text-blue-500 mb-1.5">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200 ${activeTheme === 'dark' ? 'border-blue-900 bg-[#0c0c0e] text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-900'}`}
                        />
                    </div>
                </div>
                <div className="mt-8 flex justify-end gap-3">
                    <button
                        onClick={() => setIsPasswordModalOpen(false)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTheme === 'dark' ? 'text-blue-500 hover:bg-blue-900/50' : 'text-blue-700 hover:bg-blue-100'}`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            if (firebaseUser && newPassword) {
                                try {
                                    await updatePassword(firebaseUser, newPassword);
                                    alert('Password updated successfully');
                                    setIsPasswordModalOpen(false);
                                    setNewPassword('');
                                } catch (error: any) {
                                    alert(error.message || 'Failed to update password. You may need to login again.');
                                }
                            }
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 dark:bg-blue-50 text-white dark:text-black hover:bg-blue-700 dark:hover:bg-blue-300 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 shadow-sm transition-all duration-200"
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
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTheme === 'dark' ? 'text-blue-500 hover:bg-blue-900/50' : 'text-blue-700 hover:bg-blue-100'}`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            setIsDeleteModalOpen(false);
                            setTimeout(() => setIsDeleteConfirmOpen(true), 250); // wait for exit anim
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 shadow-sm transition-all duration-200"
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
                    <p className="text-sm text-blue-800 dark:text-blue-400">
                        Please type <strong className="font-semibold text-blue-900 dark:text-white">delete my account</strong> to confirm.
                    </p>
                    <input
                        type="text"
                        placeholder="delete my account"
                        className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/10 transition-all duration-200 ${activeTheme === 'dark' ? 'border-rose-900/50 bg-[#0c0c0e] text-blue-200 placeholder:text-blue-700' : 'border-rose-200 bg-blue-50 text-blue-900 placeholder:text-blue-500'}`}
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setIsDeleteConfirmOpen(false)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTheme === 'dark' ? 'text-blue-500 hover:bg-blue-900/50' : 'text-blue-700 hover:bg-blue-100'}`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            if (firebaseUser) {
                                try {
                                    await deleteUser(firebaseUser);
                                    alert('Account deleted forever.');
                                    setIsDeleteConfirmOpen(false);
                                } catch (error: any) {
                                    alert(error.message || 'Failed to delete account. You may need to login again.');
                                }
                            }
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-rose-600 text-white hover:bg-rose-700 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 shadow-sm transition-all duration-200"
                    >
                        Permanently Delete
                    </button>
                </div>
            </Modal>

        </div>
    );
};

export default Settings;
