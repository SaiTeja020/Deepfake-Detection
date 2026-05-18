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
        <>
            <NeuralMesh isDark={activeTheme === 'dark'} noLines={true} />
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
                                        alert(error.message || "Failed to logout. Please try again.");
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
                                    } catch (err) {
                                        console.error("Failed to update save history preference:", err);
                                        // Revert on error
                                        setSaveImages(!newValue);
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
                        <div className="settings-toggle-item group" onClick={() => setAllowData(!allowData)}>
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
                        <div className="settings-flex-col-sm-row" style={{width: '100%'}}>
                            <div>
                                <h3 className="text-sm font-medium text-rose-700 dark:text-rose-500 mb-1">Delete Account</h3>
                                <p className="text-xs text-rose-600/70 dark:text-rose-400/80 max-w-sm">
                                    Permanently remove your account and all associated forensic data. This action is irreversible.
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
                        <input
                            type="password"
                            className="settings-input"
                        />
                    </div>
                    <div>
                        <label className="settings-label">New Password</label>
                        <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="settings-input"
                        />
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
                        className="settings-btn-primary"
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
                        className="settings-input settings-input-error"
                    />
                </div>
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => setIsDeleteConfirmOpen(false)}
                        className="settings-btn-ghost"
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
                        className="settings-btn-danger-solid"
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
