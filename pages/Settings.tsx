import React, { useState } from 'react';
import {
    UserCircleIcon,
    ShieldCheckIcon,
    KeyIcon,
    TrashIcon,
    SunIcon,
    MoonIcon,
    XMarkIcon,
    ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    onConfirm?: () => void;
    confirmLabel?: string;
    confirmVariant?: 'primary' | 'danger';
    isDark: boolean;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, title, children, onConfirm, confirmLabel, confirmVariant = 'primary', isDark }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className={`p-6 border-b flex items-center justify-between ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
                    <h2 className="text-sm font-black uppercase tracking-[0.2em] heading-font">{title}</h2>
                    <button onClick={onClose} className="p-1 hover:opacity-70 transition-opacity">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-8">
                    {children}
                </div>
                {onConfirm && (
                    <div className={`p-6 bg-zinc-50/50 dark:bg-zinc-900/50 border-t flex gap-3 ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all shadow-lg hover:-translate-y-0.5 active:translate-y-0 ${confirmVariant === 'danger' ? 'bg-rose-600 text-white shadow-rose-600/20' : 'bg-blue-600 text-white shadow-blue-600/20'}`}
                        >
                            {confirmLabel || 'Confirm'}
                        </button>
                        <button onClick={onClose} className="btn-secondary flex-1 py-3">
                            Cancel
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

const Settings: React.FC<{ theme: 'dark' | 'light', toggleTheme: () => void }> = ({ theme, toggleTheme }) => {
    const isDark = theme === 'dark';
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);

    const SettingsSection = ({ title, children }: { title: string, children: React.ReactNode }) => (
        <section className="space-y-6 pt-12 first:pt-0">
            <h3 className="text-xs font-black uppercase tracking-[0.4em] text-blue-600 heading-font">{title}</h3>
            <div className={`space-y-4`}>
                {children}
            </div>
        </section>
    );

    const SettingRow = ({ label, description, rightElement }: { label: string, description?: string, rightElement: React.ReactNode }) => (
        <div className={`flex items-center justify-between p-6 rounded-2xl border transition-all ${isDark ? 'bg-zinc-950/50 border-zinc-900' : 'bg-white border-slate-100 shadow-sm'}`}>
            <div className="space-y-1">
                <p className="text-sm font-bold tracking-tight">{label}</p>
                {description && <p className={`text-[10px] font-medium tracking-wide opacity-50 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>{description}</p>}
            </div>
            {rightElement}
        </div>
    );

    return (
        <div className="max-w-2xl mx-auto space-y-12 py-10 fade-in px-4">
            <header className="text-center space-y-3 pb-8">
                <h1 className="text-4xl font-black tracking-tighter heading-font">System Configuration</h1>
                <p className={`text-sm font-medium opacity-50 ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>Secure and customize your forensic research environment.</p>
            </header>

            <div className="space-y-12 divide-y divide-zinc-900/5 dark:divide-white/5">
                {/* ACCOUNT */}
                <SettingsSection title="Account Identity">
                    <SettingRow
                        label="Full Name"
                        description="Your internal analyst signature."
                        rightElement={<p className="text-sm font-mono font-bold opacity-60">Venkata Sai</p>}
                    />
                    <SettingRow
                        label="Email Address"
                        description="Used for system alerts and recovery."
                        rightElement={<p className="text-sm font-mono font-bold opacity-60">vsai@foresight.io</p>}
                    />
                    <SettingRow
                        label="Username"
                        description="Your unique forensic node identifier."
                        rightElement={<p className="text-sm font-mono font-bold opacity-60">analyst_0482</p>}
                    />
                    <button
                        onClick={() => setIsPasswordModalOpen(true)}
                        className={`w-full flex items-center justify-center gap-3 p-5 rounded-2xl border transition-all group ${isDark ? 'bg-zinc-950/30 border-zinc-900 hover:bg-zinc-900 hover:border-zinc-800' : 'bg-slate-50 border-slate-200 hover:bg-white hover:shadow-md'}`}
                    >
                        <KeyIcon className="w-5 h-5 opacity-40 group-hover:text-blue-500 transition-colors" />
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 group-hover:opacity-100">Reset Password</span>
                    </button>
                </SettingsSection>

                {/* APPEARANCE */}
                <SettingsSection title="Visual Interface">
                    <SettingRow
                        label="Interface Theme"
                        description="Switch between Light and Dark core protocols."
                        rightElement={
                            <button
                                onClick={toggleTheme}
                                className={`flex items-center gap-3 px-6 py-2.5 rounded-full transition-all border ${isDark ? 'bg-white text-black hover:bg-zinc-200 shadow-xl shadow-white/10' : 'bg-slate-900 text-white hover:bg-black shadow-xl shadow-slate-900/20'}`}
                            >
                                {isDark ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">{isDark ? 'Light Mode' : 'Dark Mode'}</span>
                            </button>
                        }
                    />
                </SettingsSection>

                {/* SECURITY */}
                <SettingsSection title="Node Security">
                    <div className="p-8 rounded-3xl border border-rose-500/20 bg-rose-500/[0.02] space-y-6">
                        <div className="flex items-start gap-4">
                            <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500">
                                <TrashIcon className="w-6 h-6" />
                            </div>
                            <div className="space-y-1 flex-1">
                                <p className="text-sm font-bold tracking-tight text-rose-500">Delete Account</p>
                                <p className={`text-[10px] font-medium leading-relaxed opacity-60 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>Permanently delete your account and all associated data. This action is irreversible.</p>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsDeleteModalOpen(true)}
                            className="w-full btn-danger-outline py-3.5"
                        >
                            Delete
                        </button>
                    </div>
                </SettingsSection>
            </div>

            {/* Modals */}
            <SettingsModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                title="Critical Delete"
                confirmLabel="Confirm Delete"
                confirmVariant="danger"
                onConfirm={() => { alert('Account deleted.'); setIsDeleteModalOpen(false); }}
                isDark={isDark}
            >
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-rose-500/10 flex items-center justify-center text-rose-500">
                        <ExclamationTriangleIcon className="w-8 h-8" />
                    </div>
                    <div className="space-y-2">
                        <p className="text-base font-bold dark:text-white">Final Confirmation Required</p>
                        <p className="text-sm opacity-60 dark:text-zinc-400">Are you absolutely certain you want to delete your account? All data will be permanently deleted.</p>
                    </div>
                </div>
            </SettingsModal>

            <SettingsModal
                isOpen={isPasswordModalOpen}
                onClose={() => setIsPasswordModalOpen(false)}
                title="Password Rotation"
                confirmLabel="Update Key"
                onConfirm={() => setIsPasswordModalOpen(false)}
                isDark={isDark}
            >
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Current Password</label>
                        <input type="password" className={`w-full px-5 py-3 rounded-xl border outline-none transition-all text-sm font-medium ${isDark ? 'bg-zinc-950 border-zinc-800 focus:border-blue-500/50' : 'bg-white border-slate-200 focus:border-blue-600/50 shadow-sm'}`} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">New Password</label>
                        <input type="password" className={`w-full px-5 py-3 rounded-xl border outline-none transition-all text-sm font-medium ${isDark ? 'bg-zinc-950 border-zinc-800 focus:border-blue-500/50' : 'bg-white border-slate-200 focus:border-blue-600/50 shadow-sm'}`} />
                    </div>
                </div>
            </SettingsModal>
        </div>
    );
};

export default Settings;
