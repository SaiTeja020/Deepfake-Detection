import React, { useState } from 'react';
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
                className={`w-full max-w-md rounded-2xl shadow-xl overflow-hidden border ${activeTheme === 'dark' ? 'bg-[#121215] border-zinc-800' : 'bg-white border-slate-200/50'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className={`px-6 py-4 border-b flex items-center justify-between ${activeTheme === 'dark' ? 'border-zinc-800/50' : 'border-slate-100'}`}>
                    <h3 className={`text-sm font-semibold ${activeTheme === 'dark' ? 'text-zinc-100' : 'text-slate-800'}`}>{title}</h3>
                    <button
                        onClick={onClose}
                        className={`p-1 rounded-md transition-colors duration-200 ${activeTheme === 'dark' ? 'text-zinc-500 hover:text-zinc-300' : 'text-slate-400 hover:text-slate-600'}`}
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
    const { user } = useAuth();
    // Toggles state
    const [saveImages, setSaveImages] = useState(false);
    const [allowData, setAllowData] = useState(true);

    const [newPassword, setNewPassword] = useState('');

    // Modals
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false); // Second step

    return (
        <div className="w-full max-w-3xl mx-auto py-12 px-6 fade-in">
            <header className="mb-14">
                <h1 className="text-3xl font-bold tracking-tight text-slate-800 dark:text-zinc-100 mb-2">Settings</h1>
                <p className="text-sm text-slate-500 dark:text-zinc-400">Manage your account and platform preferences.</p>
            </header>

            <div className="space-y-16">

                {/* 1. ACCOUNT */}
                <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-4 pb-2 border-b border-slate-200/60 dark:border-zinc-800/60">
                        Account
                    </h2>

                    <div className="space-y-4">
                        {/* Email Field container */}
                        <div className={`p-5 rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out group ${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">Email Address</label>
                                    <p className="text-xs text-slate-500 dark:text-zinc-500">Must be verified to receive security alerts.</p>
                                </div>
                                <div className="flex w-full sm:w-auto items-center gap-3">
                                    <input
                                        type="email"
                                        id="email"
                                        defaultValue={user?.email || "admin@foresight.io"}
                                        readOnly
                                        className={`w-full sm:w-64 px-3 py-2 text-sm rounded-lg border cursor-not-allowed focus:outline-none transition-all duration-200 ease-in-out ${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/40 text-zinc-300' : 'border-slate-200 bg-white text-slate-700'}`}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Logout & Password */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => setIsPasswordModalOpen(true)}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-sm transition-all duration-200 ease-in-out active:translate-y-0 active:shadow-none ${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:text-white hover:bg-zinc-800/50' : 'border-slate-200/60 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 hover:bg-slate-50 hover:-translate-y-[1px]'}`}
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
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium shadow-sm transition-all duration-200 ease-in-out active:translate-y-0 active:shadow-none ${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700 hover:text-white hover:bg-zinc-800/50' : 'border-slate-200/60 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-900 hover:bg-slate-50 hover:-translate-y-[1px]'}`}
                            >
                                <ArrowRightOnRectangleIcon className="w-4 h-4 opacity-70" />
                                Logout
                            </button>
                        </div>
                    </div>
                </section>

                {/* 2. APPEARANCE */}
                <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-4 pb-2 border-b border-slate-200/60 dark:border-zinc-800/60">
                        Appearance
                    </h2>

                    <div className={`p-5 rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out ${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                            <div>
                                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">Color Theme</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">Select or customize your UI workspace.</p>
                            </div>

                            <div className={`flex p-1 rounded-lg border overflow-hidden w-full sm:w-auto ${activeTheme === 'dark' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-slate-100/50 border-slate-200/40'}`}>
                                {[
                                    { id: 'light', label: 'Light', icon: SunIcon },
                                    { id: 'dark', label: 'Dark', icon: MoonIcon },
                                    { id: 'system', label: 'System', icon: ComputerDesktopIcon }
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        onClick={() => setTheme(t.id as any)}
                                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-md transition-all duration-200 ease-in-out ${theme === t.id
                                            ? (activeTheme === 'dark' ? 'bg-zinc-800 text-zinc-100 shadow-sm ring-1 ring-white/5' : 'bg-white text-slate-800 shadow-sm ring-1 ring-slate-200')
                                            : (activeTheme === 'dark' ? 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50' : 'text-slate-500 hover:text-slate-700 hover:bg-white')
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
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-4 pb-2 border-b border-slate-200/60 dark:border-zinc-800/60">
                        Privacy
                    </h2>

                    <div className={`rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out overflow-hidden divide-y ${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 divide-zinc-800/50' : 'border-slate-200 bg-white hover:border-slate-300 divide-slate-200/50'}`}>
                        {/* Toggle 1 */}
                        <div className="p-5 flex items-center justify-between group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-zinc-900/60 transition-colors" onClick={() => setSaveImages(!saveImages)}>
                            <div className="pr-4">
                                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1 group-hover:text-slate-900 dark:group-hover:text-zinc-100 transition-colors">Save Analysis History</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">Store uploaded images securely for 30 days.</p>
                            </div>
                            <button
                                role="switch"
                                aria-checked={saveImages}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${saveImages ? 'bg-blue-500' : 'bg-slate-300/80 dark:bg-zinc-700'
                                    }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${saveImages ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>
                        {/* Toggle 2 */}
                        <div className="p-5 flex items-center justify-between group cursor-pointer hover:bg-slate-50/80 dark:hover:bg-zinc-900/60 transition-colors" onClick={() => setAllowData(!allowData)}>
                            <div className="pr-4">
                                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1 group-hover:text-slate-900 dark:group-hover:text-zinc-100 transition-colors">Anonymous Usage Data</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">Help improve forensic models by sharing telemetry.</p>
                            </div>
                            <button
                                role="switch"
                                aria-checked={allowData}
                                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${allowData ? 'bg-blue-500' : 'bg-slate-300/80 dark:bg-zinc-700'
                                    }`}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${allowData ? 'translate-x-4' : 'translate-x-0'
                                        }`}
                                />
                            </button>
                        </div>
                    </div>
                </section>

                {/* 4. SECURITY */}
                <section>
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-4 pb-2 border-b border-slate-200/60 dark:border-zinc-800/60">
                        Security
                    </h2>

                    <div className={`p-5 rounded-xl border shadow-[0_1px_3px_0_rgba(0,0,0,0.02)] hover:-translate-y-[1px] transition-all duration-200 ease-in-out group ${activeTheme === 'dark' ? 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-slate-700 dark:text-zinc-300 mb-1">Account Password</p>
                                <p className="text-xs text-slate-500 dark:text-zinc-500">Last changed 4 months ago.</p>
                            </div>
                            <button
                                onClick={() => setIsPasswordModalOpen(true)}
                                className={`w-full sm:w-auto px-4 py-2 rounded-lg border text-sm font-medium shadow-sm transition-all duration-200 ease-in-out ${activeTheme === 'dark' ? 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800/60 hover:border-zinc-600' : 'border-slate-200/80 bg-white/80 text-slate-700 hover:bg-white hover:border-slate-300'}`}
                            >
                                Update Password
                            </button>
                        </div>
                    </div>
                </section>

                {/* 5. DANGER ZONE */}
                <section className="pt-8 mt-16 border-t border-slate-200/60 dark:border-zinc-800">
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
                                className="w-full sm:w-auto px-4 py-2 rounded-lg border border-rose-200/80 dark:border-rose-900/50 bg-white dark:bg-rose-950/50 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/50 hover:border-rose-300/80 dark:hover:border-rose-800/50 shadow-sm transition-all duration-200 ease-in-out active:scale-[0.98]"
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
                        <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5">Current Password</label>
                        <input
                            type="password"
                            className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200 ${activeTheme === 'dark' ? 'border-zinc-800 bg-[#0c0c0e] text-zinc-100' : 'border-slate-200 bg-white text-slate-800'}`}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 mb-1.5">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/10 transition-all duration-200 ${activeTheme === 'dark' ? 'border-zinc-800 bg-[#0c0c0e] text-zinc-100' : 'border-slate-200 bg-white text-slate-800'}`}
                        />
                    </div>
                </div>
                <div className="mt-8 flex justify-end gap-3">
                    <button
                        onClick={() => setIsPasswordModalOpen(false)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTheme === 'dark' ? 'text-zinc-400 hover:bg-zinc-800/50' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            if (user && newPassword) {
                                try {
                                    await updatePassword(user, newPassword);
                                    alert('Password updated successfully');
                                    setIsPasswordModalOpen(false);
                                    setNewPassword('');
                                } catch (error: any) {
                                    alert(error.message || 'Failed to update password. You may need to login again.');
                                }
                            }
                        }}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 dark:bg-white text-white dark:text-black hover:bg-blue-700 dark:hover:bg-zinc-200 hover:-translate-y-[1px] hover:shadow-md active:translate-y-0 shadow-sm transition-all duration-200"
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
                        <h4 className="text-sm font-medium text-slate-800 dark:text-zinc-100 mb-1">Delete this account?</h4>
                        <p className="text-sm text-slate-500 dark:text-zinc-400 leading-relaxed">
                            This will permanently delete your account, analysis history, and active sessions.
                        </p>
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setIsDeleteModalOpen(false)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTheme === 'dark' ? 'text-zinc-400 hover:bg-zinc-800/50' : 'text-slate-600 hover:bg-slate-100'}`}
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
                    <p className="text-sm text-slate-700 dark:text-zinc-300">
                        Please type <strong className="font-semibold text-slate-800 dark:text-white">delete my account</strong> to confirm.
                    </p>
                    <input
                        type="text"
                        placeholder="delete my account"
                        className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:border-rose-500/50 focus:ring-2 focus:ring-rose-500/10 transition-all duration-200 ${activeTheme === 'dark' ? 'border-rose-900/50 bg-[#0c0c0e] text-zinc-100 placeholder:text-zinc-600' : 'border-rose-200 bg-white text-slate-800 placeholder:text-slate-400'}`}
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setIsDeleteConfirmOpen(false)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${activeTheme === 'dark' ? 'text-zinc-400 hover:bg-zinc-800/50' : 'text-slate-600 hover:bg-slate-100'}`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={async () => {
                            if (user) {
                                try {
                                    await deleteUser(user);
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
