import React, { useState, useEffect, useRef } from 'react';
import {
   UserCircleIcon,
   ShieldCheckIcon,
   FingerPrintIcon,
   MagnifyingGlassIcon,
   CheckCircleIcon,
   XCircleIcon,
   FunnelIcon,
   PencilIcon,
   XMarkIcon,
   CameraIcon
} from '@heroicons/react/24/outline';
import { ModelType } from '../types';
import { auth } from '../firebase';
import { syncUser } from '../services/api';

interface EditProfileModalProps {
   isOpen: boolean;
   onClose: () => void;
   user: any;
   onSave: (updatedUser: any) => void;
   isDark: boolean;
}

const EditProfileModal: React.FC<EditProfileModalProps> = ({ isOpen, onClose, user, onSave, isDark }) => {
   const fileInputRef = useRef<HTMLInputElement>(null);
   const [formData, setFormData] = useState(user);
   const [hasChanges, setHasChanges] = useState(false);
   const [error, setError] = useState<string | null>(null);

   useEffect(() => {
      setFormData(user);
      setError(null);
   }, [user]);

   useEffect(() => {
      const changed = JSON.stringify(formData) !== JSON.stringify(user);
      setHasChanges(changed);
   }, [formData, user]);

   const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
      if (!validTypes.includes(file.type)) {
         setError('System Error: File must be JPG, PNG, or WEBP.');
         return;
      }

      if (file.size > 5 * 1024 * 1024) {
         setError('System Error: File exceeds 5MB limit.');
         return;
      }

      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
         setFormData({ ...formData, avatar: reader.result as string });
      };
      reader.readAsDataURL(file);
   };

   const handleRemovePhoto = (e: React.MouseEvent) => {
      e.stopPropagation();
      setFormData({ ...formData, avatar: null });
      if (fileInputRef.current) fileInputRef.current.value = '';
   };

   useEffect(() => {
      if (isOpen) {
         document.body.style.overflow = 'hidden';
      } else {
         document.body.style.overflow = 'unset';
      }
      return () => { document.body.style.overflow = 'unset'; };
   }, [isOpen]);

   if (!isOpen) return null;

   return (
      <div className="modal-overlay" onClick={onClose}>
         <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className={`modal-header p-6 border-b flex items-center justify-between ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
               <h2 className="text-sm font-black uppercase tracking-[0.2em] heading-font">Edit Analyst Profile</h2>
               <button onClick={onClose} className="p-1 hover:opacity-70 transition-opacity">
                  <XMarkIcon className="w-5 h-5" />
               </button>
            </div>
            <div className="modal-body p-8 space-y-8">
               {/* Avatar Upload Section */}
               <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                     <div
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative w-24 h-24 rounded-full border-2 border-dashed flex items-center justify-center transition-all duration-300 cursor-pointer overflow-hidden transform hover:scale-[1.03] ${isDark
                           ? 'bg-zinc-900 border-zinc-800 hover:border-blue-500/50 hover:shadow-[0_0_20px_rgba(59,130,246,0.2)]'
                           : 'bg-slate-50 border-slate-200 hover:border-blue-600/50 hover:shadow-[0_10px_20px_-5px_rgba(0,0,0,0.1)]'
                           }`}
                     >
                        {formData.avatar ? (
                           <img src={formData.avatar} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                           <UserCircleIcon className={`w-12 h-12 ${isDark ? 'text-zinc-700' : 'text-slate-300'}`} />
                        )}

                        <div className="absolute inset-0 bg-blue-600/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all backdrop-blur-[2px]">
                           <CameraIcon className="w-6 h-6 text-white" />
                        </div>
                     </div>

                     {formData.avatar && (
                        <button
                           onClick={handleRemovePhoto}
                           className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/5 transition-all shadow-sm z-10"
                        >
                           <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                     )}
                  </div>
                  <div className="text-center">
                     <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Click to change photo</p>
                     {error && (
                        <p className="text-[9px] font-bold text-rose-500 mt-2 uppercase tracking-tight">{error}</p>
                     )}
                  </div>
                  <input
                     type="file"
                     ref={fileInputRef}
                     onChange={handleFileChange}
                     accept="image/*"
                     className="hidden"
                  />
               </div>

               <div className="space-y-4 pt-4 border-t border-zinc-900/5 dark:border-white/5">
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Full Name</label>
                     <input
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        className={`w-full px-5 py-3 rounded-xl border outline-none transition-all text-sm font-medium ${isDark ? 'bg-zinc-950 border-zinc-800 focus:border-blue-500/50' : 'bg-white border-slate-200 focus:border-blue-600/50 shadow-sm'}`}
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Username</label>
                     <input
                        value={formData.username}
                        onChange={e => setFormData({ ...formData, username: e.target.value })}
                        className={`w-full px-5 py-3 rounded-xl border outline-none transition-all text-sm font-medium ${isDark ? 'bg-zinc-950 border-zinc-800 focus:border-blue-500/50' : 'bg-white border-slate-200 focus:border-blue-600/50 shadow-sm'}`}
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold uppercase tracking-widest opacity-50 ml-1">Bio</label>
                     <textarea
                        value={formData.bio}
                        rows={3}
                        onChange={e => setFormData({ ...formData, bio: e.target.value })}
                        className={`w-full px-5 py-3 rounded-xl border outline-none transition-all text-sm font-medium resize-none ${isDark ? 'bg-zinc-950 border-zinc-800 focus:border-blue-500/50' : 'bg-white border-slate-200 focus:border-blue-600/50 shadow-sm'}`}
                     />
                  </div>
               </div>
            </div>
            <div className={`modal-footer p-6 bg-zinc-50/50 dark:bg-zinc-900/50 border-t flex gap-3 ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
               <button
                  onClick={() => onSave(formData)}
                  disabled={!hasChanges}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${hasChanges ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:-translate-y-0.5 active:translate-y-0' : 'bg-zinc-200 text-zinc-400 cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600'}`}
               >
                  Save Changes
               </button>
               <button onClick={onClose} className="btn-secondary flex-1 py-3">
                  Cancel
               </button>
            </div>
         </div>
      </div>
   );
};

const Profile: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
   const isDark = theme === 'dark';
   const [filter, setFilter] = useState<'all' | 'fake' | 'real'>('all');
   const [isEditModalOpen, setIsEditModalOpen] = useState(false);
   const [user, setUser] = useState({
      name: auth.currentUser?.displayName || 'Venkata Sai',
      username: auth.currentUser?.email?.split('@')[0] || 'analyst',
      bio: 'Senior Forensic Analyst specialized in Transformer-based deepfake detection architectures.',
      avatar: auth.currentUser?.photoURL || null
   });

   useEffect(() => {
      if (auth.currentUser) {
         setUser(prev => ({
            ...prev,
            name: auth.currentUser?.displayName || prev.name,
            username: auth.currentUser?.email?.split('@')[0] || prev.username,
            avatar: auth.currentUser?.photoURL || prev.avatar
         }));
      }
   }, []);

   const stats = [
      { label: 'Total Analyzed', value: '0', icon: MagnifyingGlassIcon },
      { label: 'Fake Detected', value: '0', icon: XCircleIcon, color: 'text-rose-500' },
      { label: 'Real Detected', value: '0', icon: CheckCircleIcon, color: 'text-emerald-500' },
      { label: 'Most Used Model', value: 'N/A', icon: FingerPrintIcon },
   ];

   const history: any[] = []; // In a real app, fetch this from Supabase

   const filteredHistory = history.filter(item => {
      if (filter === 'all') return true;
      return item.result.toLowerCase() === filter;
   });

   const handleSaveProfile = async (updatedUser: any) => {
      try {
         setUser(updatedUser);
         if (auth.currentUser) {
            await syncUser({
               firebase_uid: auth.currentUser.uid,
               email: auth.currentUser.email,
               name: updatedUser.name,
               profile_pic_url: updatedUser.avatar,
               save_history: true
            });
         }
         setIsEditModalOpen(false);
      } catch (err) {
         console.error("Failed to sync profile:", err);
         alert("Failed to sync profile updates to server.");
      }
   };

   return (
      <div className="relative min-h-screen pb-20 overflow-x-hidden">
         {/* Background Motion Elements */}
         <div className="bg-blob w-[500px] h-[500px] bg-blue-500/20 -top-40 -left-20 animate-float" />
         <div className="bg-blob w-[400px] h-[400px] bg-indigo-500/10 bottom-20 right-0 animate-float-reverse" />

         <div className="space-y-24 fade-in relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* User Info Header */}
            <header className="flex flex-col md:flex-row items-center md:items-end justify-between gap-10 pt-12 pb-16 border-b border-zinc-900/5 dark:border-white/5">
               <div className="flex flex-col md:flex-row items-center gap-10">
                  <div className={`relative w-40 h-40 rounded-full border-4 p-1 transition-all duration-500 scale-105 ${isDark ? 'border-zinc-800 bg-zinc-950 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]' : 'border-slate-100 bg-white shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)]'}`}>
                     <div className={`w-full h-full rounded-full flex items-center justify-center overflow-hidden ${isDark ? 'bg-zinc-900' : 'bg-slate-50'}`}>
                        {user.avatar ? (
                           <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                           <UserCircleIcon className={`w-24 h-24 ${isDark ? 'text-zinc-800' : 'text-slate-200'}`} />
                        )}
                     </div>
                     <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg border-4 border-white dark:border-zinc-950">
                        <ShieldCheckIcon className="w-5 h-5" />
                     </div>
                  </div>
                  <div className="text-center md:text-left space-y-4">
                     <div className="space-y-1">
                        <h1 className="text-5xl font-black tracking-tighter heading-font leading-none">{user.name}</h1>
                        <p className={`text-sm font-medium tracking-wide opacity-50 ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>@{user.username}</p>
                     </div>
                     <p className={`text-sm leading-relaxed max-w-md ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                        {user.bio}
                     </p>
                     <div className="flex flex-wrap justify-center md:justify-start gap-4 pt-2">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${isDark ? 'bg-blue-500/5 border-blue-500/20 text-blue-500' : 'bg-blue-50 border-blue-100 text-blue-600'}`}>Senior Analyst</span>
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-500' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>Node Verified</span>
                     </div>
                  </div>
               </div>

               <button
                  onClick={() => setIsEditModalOpen(true)}
                  className={`flex items-center gap-3 px-8 py-3.5 rounded-full border text-[11px] font-bold uppercase tracking-widest transition-all duration-300 transform hover:-translate-y-1 active:translate-y-0 ${isDark ? 'bg-zinc-950 border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-white' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-sm'}`}
               >
                  <PencilIcon className="w-4 h-4" />
                  <span>Edit Profile</span>
               </button>
            </header>

            {/* Statistics Section */}
            <section className="space-y-10">
               <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-zinc-900/5 dark:bg-white/5" />
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500/70 heading-font">Global Intelligence</h2>
                  <div className="h-px flex-1 bg-zinc-900/5 dark:bg-white/5" />
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                  {stats.map((stat, i) => (
                     <div key={i} className={`card-foresight p-8 flex flex-col justify-between group h-48 transition-all duration-300`}>
                        <div className="flex items-center justify-between mb-4">
                           <div className={`p-3 rounded-2xl transition-colors duration-300 ${isDark ? 'bg-zinc-900 group-hover:bg-zinc-800' : 'bg-slate-50 group-hover:bg-slate-100'}`}>
                              <stat.icon className={`w-6 h-6 ${stat.color || 'text-blue-500'}`} />
                           </div>
                        </div>
                        <div>
                           <p className={`text-[11px] font-bold uppercase tracking-[0.2em] mb-2 opacity-40`}>{stat.label}</p>
                           <h3 className="text-4xl font-black heading-font tracking-tight">{stat.value}</h3>
                        </div>
                     </div>
                  ))}
               </div>
            </section>

            {/* Detection History Table */}
            <section className="space-y-10">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                     <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500/70 heading-font whitespace-nowrap">Detection History</h2>
                     <div className="h-px flex-1 bg-zinc-900/5 dark:bg-white/5" />
                  </div>

                  <div className="flex items-center gap-4 ml-8">
                     <div className={`inline-flex p-1.5 rounded-full border ${isDark ? 'bg-zinc-950/50 border-zinc-900' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                        {(['all', 'real', 'fake'] as const).map((opt) => (
                           <button
                              key={opt}
                              onClick={() => setFilter(opt)}
                              className={`px-5 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${filter === opt ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' : 'opacity-40 hover:opacity-100'}`}
                           >
                              {opt}
                           </button>
                        ))}
                     </div>
                  </div>
               </div>

               <div className={`card-foresight overflow-hidden border-none shadow-none bg-transparent`}>
                  <div className="overflow-x-auto">
                     <table className="table-foresight">
                        <thead>
                           <tr>
                              <th>Analysis Date</th>
                              <th>Image Source</th>
                              <th>Forensic Model</th>
                              <th>Verdict</th>
                              <th>Confidence</th>
                           </tr>
                        </thead>
                        <tbody>
                           {filteredHistory.map((row) => (
                              <tr key={row.id} className="group transition-all duration-300">
                                 <td className={`font-medium ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>{row.date}</td>
                                 <td className="font-bold tracking-tight text-sm">{row.name}</td>
                                 <td>
                                    <span className={`px-3 py-1 rounded-lg text-[10px] font-bold tracking-widest border ${isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white border-slate-200'}`}>
                                       {row.model} PROTOCOL
                                    </span>
                                 </td>
                                 <td>
                                    <div className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all group-hover:scale-105 ${row.result === 'Fake' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                                       {row.result}
                                    </div>
                                 </td>
                                 <td>
                                    <div className="flex items-center gap-4">
                                       <span className="font-mono font-bold text-sm tracking-tighter">{row.confidence}%</span>
                                       <div className={`h-1.5 w-24 rounded-full overflow-hidden ${isDark ? 'bg-zinc-900' : 'bg-slate-100'}`}>
                                          <div
                                             className={`h-full rounded-full transition-all duration-1000 ${row.result === 'Fake' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'}`}
                                             style={{ width: `${row.confidence}%` }}
                                          />
                                       </div>
                                    </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
               </div>
            </section>
         </div>

         <EditProfileModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            user={user}
            onSave={handleSaveProfile}
            isDark={isDark}
         />
      </div>
   );
};

export default Profile;