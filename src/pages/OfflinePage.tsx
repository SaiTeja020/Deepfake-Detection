import React from "react";
import { motion } from "framer-motion";
import {
  WifiIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface OfflinePageProps {
  theme: "dark" | "light";
}

const OfflinePage: React.FC<OfflinePageProps> = ({ theme }) => {
  const isDark = theme === "dark";

  return (
    <div
      className={`fixed inset-0 z-[9999] overflow-hidden flex items-center justify-center px-6 transition-colors duration-500 ${
        isDark ? "bg-[#050505]" : "bg-slate-50"
      }`}
    >
      {/* Neural Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={`absolute -top-[10%] -left-[10%] w-[40%] h-[40%] rounded-full blur-[120px] opacity-20 ${
            isDark ? "bg-blue-600" : "bg-blue-200"
          }`}
        />

        <div
          className={`absolute top-[20%] right-[5%] w-[25%] h-[25%] rounded-full blur-[100px] opacity-10 ${
            isDark ? "bg-indigo-500" : "bg-indigo-200"
          }`}
        />

        <div
          className={`absolute bottom-[0%] left-[20%] w-[30%] h-[30%] rounded-full blur-[100px] opacity-10 ${
            isDark ? "bg-cyan-500" : "bg-cyan-200"
          }`}
        />
      </div>

      {/* Grid */}
      <div className="absolute inset-0 bg-dots opacity-20" />

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6 }}
        className={`relative w-full max-w-xl overflow-hidden rounded-[2.5rem] border backdrop-blur-xl p-10 sm:p-14 text-center
        ${
          isDark
            ? "bg-zinc-900/40 border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.6)]"
            : "bg-white/70 border-white shadow-[0_20px_80px_rgba(148,163,184,0.2)]"
        }`}
      >
        {/* Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-70" />

        {/* Animated Pulse */}
        <motion.div
          animate={{
            opacity: [0.3, 1, 0.3],
            scale: [1, 1.08, 1],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
          }}
          className="mx-auto mb-8 relative w-28 h-28 flex items-center justify-center"
        >
          <div className="absolute inset-0 rounded-full border border-blue-500/30" />
          <div className="absolute inset-2 rounded-full border border-blue-500/20" />

          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center ${
              isDark
                ? "bg-blue-500/10 border border-blue-500/20"
                : "bg-blue-50 border border-blue-100"
            }`}
          >
            <WifiIcon className="w-10 h-10 text-blue-500" />
          </div>
        </motion.div>

        {/* Status */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />

          <span
            className={`text-[10px] font-black uppercase tracking-[0.3em] ${
              isDark ? "text-amber-400" : "text-amber-600"
            }`}
          >
            Connection Interrupted
          </span>
        </div>

        {/* Title */}
        <h1
          className={`text-4xl sm:text-5xl font-black tracking-tight mb-5 heading-font ${
            isDark ? "text-white" : "text-slate-900"
          }`}
        >
          Network Offline
        </h1>

        {/* Description */}
        <p
          className={`text-sm leading-relaxed max-w-md mx-auto mb-10 ${
            isDark ? "text-zinc-400" : "text-slate-600"
          }`}
        >
          Foresight lost connection to the forensic analysis network.
          Reconnect to continue deepfake detection, heatmap generation,
          and scan synchronization.
        </p>

        {/* Diagnostics */}
        <div
          className={`rounded-2xl border p-5 text-left mb-10 ${
            isDark
              ? "bg-black/30 border-zinc-800"
              : "bg-slate-50 border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <p
              className={`text-[10px] font-bold uppercase tracking-[0.25em] ${
                isDark ? "text-zinc-500" : "text-slate-400"
              }`}
            >
              System Diagnostics
            </p>

            <span className="text-rose-500 text-[10px] font-black uppercase tracking-widest">
              OFFLINE
            </span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between">
              <span className={isDark ? "text-zinc-500" : "text-slate-500"}>
                API Gateway
              </span>
              <span className="text-rose-500">Disconnected</span>
            </div>

            <div className="flex justify-between">
              <span className={isDark ? "text-zinc-500" : "text-slate-500"}>
                Neural Analysis
              </span>
              <span className="text-amber-500">Paused</span>
            </div>

            <div className="flex justify-between">
              <span className={isDark ? "text-zinc-500" : "text-slate-500"}>
                Cloud Sync
              </span>
              <span className="text-rose-500">Unavailable</span>
            </div>
          </div>
        </div>

        {/* Retry Button */}
        <button
          onClick={() => window.location.reload()}
          className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-[0.25em] transition-all duration-300 hover:scale-[1.03] shadow-[0_10px_40px_rgba(37,99,235,0.35)]"
        >
          <ArrowPathIcon className="w-4 h-4 group-hover:rotate-180 transition-transform duration-700" />
          Retry Connection
        </button>

        {/* Footer */}
        <p
          className={`mt-8 text-[10px] uppercase tracking-[0.25em] ${
            isDark ? "text-zinc-600" : "text-slate-400"
          }`}
        >
          Foresight Neural Forensics Platform
        </p>
      </motion.div>
    </div>
  );
};

export default OfflinePage;