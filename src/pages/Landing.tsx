import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheckIcon,
  BeakerIcon,
  CpuChipIcon,
  ShieldExclamationIcon,
  GlobeAltIcon,
  ArrowRightIcon,
  Square3Stack3DIcon,
  DocumentTextIcon,
  CodeBracketIcon,
  UsersIcon,
  ChatBubbleLeftEllipsisIcon,
  UserGroupIcon,
  EyeIcon,
  FingerPrintIcon
} from '@heroicons/react/24/outline';

const Landing: React.FC<{ theme: 'dark' | 'light', isLoggedIn: boolean }> = ({ theme, isLoggedIn }) => {
  const isDark = theme === 'dark';

  return (
    <div className="space-y-32 pb-20">
      {/* Hero Section */}
      <section className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-12 fade-in">
        <div className="space-y-6 max-w-4xl mx-auto px-4">
          <div className={`mx-auto w-fit px-4 py-1.5 rounded-full border text-[10px] font-bold tracking-[0.2em] uppercase ${isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
            TRANSFORMER-POWERED DETECTION
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter heading-font leading-[1.05]">
            Detect Deepfakes with <br />
            <span className="text-blue-600">Transformer Intelligence</span>
          </h1>
          <p className={`text-lg md:text-xl max-w-2xl mx-auto font-light leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
            Next-generation facial authenticity verification using state-of-the-art Vision Transformers (ViT) and Swin Transformers. Professional-grade detection for human faces.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            to={isLoggedIn ? "/product" : "/login"}
            className="btn-primary flex items-center space-x-2 px-10"
          >
            <span>Analyze Image</span>
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
          <Link
            to={isLoggedIn ? "/compare" : "/login"}
            className={`px-10 py-3 rounded-xl font-bold text-[11px] uppercase tracking-[0.3em] transition-all border ${isDark ? 'bg-white/5 border-white/10 text-white hover:bg-white/10' : 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100'}`}
          >
            Compare Models
          </Link>
        </div>
      </section>

      {/* Model Tech Section */}
      <section className="grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-8">
          <h2 className="text-4xl font-black tracking-tighter heading-font">Architectures</h2>
          <div className="space-y-6">
            <div className="card-foresight p-8 space-y-3">
              <h3 className="text-xl font-bold heading-font">Vision Transformer (ViT)</h3>
              <p className={`text-sm font-light leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Processes images as sequences of patches, capturing global dependencies across the entire face. Exceptional at spotting architectural inconsistencies in synthetic generations.
              </p>
            </div>
            <div className="card-foresight p-8 space-y-3">
              <h3 className="text-xl font-bold heading-font">Swin Transformer</h3>
              <p className={`text-sm font-light leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                Uses hierarchical shifted windows to analyze facial details at multiple scales. Highly effective at detecting micro-manipulations in skin texture and ocular geometry.
              </p>
            </div>
          </div>
        </div>
        <div className={`aspect-square rounded-[3rem] border relative overflow-hidden flex items-center justify-center ${isDark ? 'bg-zinc-950/40 border-zinc-900 shadow-2xl' : 'bg-slate-50 border-slate-100'}`}>
          <CpuChipIcon className="w-32 h-32 text-blue-600/10 animate-pulse" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--primary)_0%,_transparent_70%)] opacity-5"></div>
        </div>
      </section>

      {/* Explainable AI Section */}
      <section className="space-y-20">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-black tracking-tight heading-font">Explainable Output</h2>
          <p className={`text-lg max-w-2xl mx-auto font-light ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
            Foresight doesn't just give a verdict; it provides visual and analytical evidence for every automated detection.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              title: "Heatmap View",
              desc: "Visual maps highlighting suspicious facial regions where the model detected anomalies.",
              icon: EyeIcon
            },
            {
              title: "Confidence Score",
              desc: "Precise numerical probability scoring for Real vs Fake classification.",
              icon: ShieldCheckIcon
            },
            {
              title: "Forensic Verdict",
              desc: "Instant high-level classification refined by transformer-based consensus.",
              icon: FingerPrintIcon
            },
            {
              title: "Reasoning Summary",
              desc: "Brief explanation of why the image was flagged, focusing on specific facial patterns.",
              icon: DocumentTextIcon
            }
          ].map((item, i) => (
            <div key={i} className="card-foresight p-8 space-y-6 group hover:-translate-y-1">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-600/10 text-blue-500' : 'bg-blue-50 text-blue-600 shadow-sm'}`}>
                <item.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-3 heading-font">{item.title}</h3>
                <p className={`text-sm font-light leading-relaxed ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-24 border-t border-zinc-900/10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 mb-20">
          <div className="space-y-6">
            <div className="flex items-center space-x-3">
              <div className="relative w-8 h-8 flex items-center justify-center">
                <img src="/src/assets/logo.svg" alt="Foresight Logo" className="w-full h-full object-contain" />
              </div>
              <h2 className="text-xl font-extrabold tracking-tighter heading-font uppercase">Foresight</h2>
            </div>
            <p className={`text-sm leading-relaxed max-w-xs font-light ${isDark ? 'text-zinc-500' : 'text-slate-600'}`}>
              Advancing media integrity through transformer-based authentication protocols. Professional grade tools for the synthetic era.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-12 col-span-2">
            <div className="space-y-6">
              <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 heading-font">Protocols</h5>
              <ul className={`text-sm space-y-4 font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                <li><a href="#" className="hover:text-blue-500 transition-colors">Forensic API</a></li>
                <li><a href="#" className="hover:text-blue-500 transition-colors">Node Network</a></li>
                <li><a href="#" className="hover:text-blue-500 transition-colors">Audit Logs</a></li>
              </ul>
            </div>
            <div className="space-y-6">
              <h5 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 heading-font">Resources</h5>
              <ul className={`text-sm space-y-4 font-medium ${isDark ? 'text-zinc-400' : 'text-slate-500'}`}>
                <li><a href="https://github.com" className="hover:text-blue-500 transition-colors flex items-center space-x-2">
                  <CodeBracketIcon className="w-4 h-4 opacity-50" />
                  <span>Research Lab</span>
                </a></li>
                <li><a href="#" className="hover:text-blue-500 transition-colors">Technical Docs</a></li>
                <li><a href="#" className="hover:text-blue-500 transition-colors">Security Advisories</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="text-center pt-8 border-t border-zinc-900/50">
          <p className={`text-[10px] font-bold tracking-[0.3em] uppercase opacity-30`}>© 2025 Foresight. AI Integrity Deployment.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;