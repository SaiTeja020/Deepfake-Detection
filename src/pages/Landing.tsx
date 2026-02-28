import React from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheckIcon,
  ShieldExclamationIcon,
  CpuChipIcon,
  BeakerIcon,
  ArrowRightIcon,
  FingerPrintIcon,
  LightBulbIcon,
  AcademicCapIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  ScaleIcon
} from '@heroicons/react/24/outline';

const Landing: React.FC<{ theme: 'dark' | 'light', isLoggedIn: boolean }> = ({ theme, isLoggedIn }) => {
  const isDark = theme === 'dark';

  return (
    <div className="space-y-24">
      {/* Background Pattern */}
      <div className="fixed inset-0 bg-geometric pointer-events-none -z-10" />

      {/* Hero Section */}
      <section className="min-h-[70vh] flex flex-col items-center justify-center text-center space-y-12 fade-in">
        <div className="space-y-8 max-w-5xl mx-auto px-4">
          <div className={`mx-auto w-fit px-5 py-2 rounded-full border text-[10px] font-bold tracking-[0.25em] uppercase ${isDark ? 'bg-blue-500/5 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
            Media Integrity Framework
          </div>
          <h1 className="text-5xl md:text-8xl font-black tracking-tight heading-font leading-[1.0] max-w-4xl mx-auto">
            Deepfakes Are <br />
            <span className={isDark ? 'text-white' : 'text-slate-900'}>Undermining Digital Trust.</span>
          </h1>
          <p className={`text-lg md:text-2xl max-w-3xl mx-auto font-light leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
            Synthetic media is rapidly evolving, threatening personal identity, democratic discourse, and public safety. Foresight provides the technical rigor needed to authenticate reality.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-8">
          <Link
            to={isLoggedIn ? "/product" : "/login"}
            className="btn-primary flex items-center space-x-3 px-12 py-4"
          >
            <span>Analyze Image</span>
            <ArrowRightIcon className="w-4 h-4" />
          </Link>
          <Link
            to={isLoggedIn ? "/compare" : "/login"}
            className={`px-12 py-4 rounded-lg font-bold text-[11px] uppercase tracking-[0.3em] transition-all border ${isDark ? 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white' : 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900'}`}
          >
            Compare Models
          </Link>
        </div>
      </section>

      {/* Problem Section: Societal Risk */}
      <section className="space-y-20 max-w-6xl mx-auto">
        <div className="grid md:grid-cols-2 gap-16 items-start">
          <div className="space-y-6">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${isDark ? 'bg-rose-500/10 text-rose-500' : 'bg-rose-50 text-rose-600'}`}>
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
            <h2 className="text-4xl font-bold tracking-tight heading-font leading-tight">
              The Erosion of <br />Shared Reality
            </h2>
            <p className={`text-lg font-light leading-relaxed ${isDark ? 'text-zinc-500' : 'text-slate-600'}`}>
              Deepfakes are no longer just a technical curiosity. They are active instruments of manipulation, targeting the core of our social and political systems.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            {[
              {
                title: "Identity Fraud",
                desc: "High-fidelity synthetic masks used to bypass biometric security and impersonate individuals.",
                icon: FingerPrintIcon
              },
              {
                title: "Misinformation",
                desc: "Fabricated audio and video designed to destabilize public opinion and political stability.",
                icon: UserGroupIcon
              },
              {
                title: "Digital Extortion",
                desc: "Non-consensual synthetic imagery used for blackmail and social damage.",
                icon: ShieldExclamationIcon
              },
              {
                title: "Trust Deficit",
                desc: "A growing skepticism where genuine evidence is dismissed as fake, paralyzing justice.",
                icon: ScaleIcon
              }
            ].map((item, i) => (
              <div key={i} className="space-y-4">
                <h4 className="font-bold text-sm tracking-wide heading-font flex items-center gap-2">
                  <item.icon className="w-4 h-4 text-primary" />
                  {item.title}
                </h4>
                <p className={`text-sm font-light leading-relaxed ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section: Technical Depth */}
      <section className={`py-24 px-8 rounded-2xl border transition-colors ${isDark ? 'bg-zinc-950/50 border-zinc-900' : 'bg-slate-50/50 border-slate-100'}`}>
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-16 items-center">
          <div className="flex-1 space-y-8">
            <h2 className="text-4xl font-black tracking-tight heading-font">Transformer-Driven Analysis</h2>
            <p className={`text-lg font-light leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              Foresight leverages dual neural architectures to detect anomalies that traditional CNNs miss. By analyzing relational patches rather than just local pixels, we identify structural inconsistencies in synthetic generations.
            </p>
            <div className="grid sm:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CpuChipIcon className="w-5 h-5 text-blue-500" />
                  <span className="font-bold text-sm uppercase tracking-widest heading-font">Vision Transformer</span>
                </div>
                <p className={`text-xs font-light leading-relaxed ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                  Captures global dependencies, detecting inconsistencies in lighting and shadow across the entire face.
                </p>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <ShieldCheckIcon className="w-5 h-5 text-emerald-500" />
                  <span className="font-bold text-sm uppercase tracking-widest heading-font">Swin Architecture</span>
                </div>
                <p className={`text-xs font-light leading-relaxed ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                  Uses hierarchical windowing to spot micro-manipulations in skin texture and ocular geometry at multiple scales.
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full aspect-square max-w-md relative group">
            {/* Abstract Facial Mesh Illustration Placeholder - Using CSS for a "Technical" look */}
            <div className={`absolute inset-0 border-2 rounded-full opacity-20 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`} />
            <div className={`absolute inset-4 border rounded-full opacity-10 ${isDark ? 'border-zinc-700' : 'border-slate-300'}`} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className={`p-12 rounded-3xl border glass transition-all duration-1000 group-hover:border-primary/30 ${isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-white/50 border-slate-200'}`}>
                <AcademicCapIcon className="w-24 h-24 text-blue-600/20" />
              </div>
            </div>
            {/* Scanning Line Animation */}
            <div className="absolute top-0 left-0 w-full h-1 bg-primary/20 blur-sm scan-line" />
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="space-y-20">
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-black tracking-tight heading-font">A Transparent Verification Process</h2>
          <p className={`text-lg max-w-2xl mx-auto font-light ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
            Foresight follows a rigorous forensic protocol to ensure every analysis is backed by explainable evidence.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
          {[
            {
              step: "01",
              title: "Input Acquisition",
              desc: "Images are ingested and normalized for multi-scale transformer processing.",
              icon: FingerPrintIcon
            },
            {
              step: "02",
              title: "Forensic Analysis",
              desc: "Parallel inference via ViT and Swin models to generate a weighted consensus.",
              icon: BeakerIcon
            },
            {
              step: "03",
              title: "Evidence Generation",
              desc: "Localized heatmaps and confidence scores provided for auditability.",
              icon: LightBulbIcon
            }
          ].map((item, i) => (
            <div key={i} className="space-y-6 text-center md:text-left">
              <span className="text-4xl font-black text-primary/10 heading-font">{item.step}</span>
              <h3 className="text-xl font-bold heading-font">{item.title}</h3>
              <p className={`text-sm font-light leading-relaxed ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="pt-16 border-t border-zinc-900/10 dark:border-zinc-800/10">
        <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-16 px-4">
          <div className="space-y-6 max-w-sm">
            <div className="flex items-center space-x-3">
              <img src="/src/assets/logo.svg" alt="Foresight Logo" className="w-7 h-7" />
              <h2 className="text-lg font-extrabold tracking-tighter heading-font">FORESIGHT</h2>
            </div>
            <p className={`text-sm leading-relaxed font-light ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              Advancing media integrity through research-driven authentication. We empower institutions and individuals to distinguish reality from synthetic media.
            </p>
          </div>
          <div className="flex gap-20">
            <div className="space-y-4">
              <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary">Models</h5>
              <ul className={`text-sm space-y-2 font-light ${isDark ? 'text-zinc-400' : 'text-slate-400'}`}>
                <li>ViT Base</li>
                <li>Swin-T</li>
                <li>Ensemble Logs</li>
              </ul>
            </div>
            <div className="space-y-4">
              <h5 className="text-[10px] font-bold uppercase tracking-widest text-primary">Mission</h5>
              <ul className={`text-sm space-y-2 font-light ${isDark ? 'text-zinc-400' : 'text-slate-400'}`}>
                <li>Research Ethics</li>
                <li>Data Integrity</li>
                <li>Contact</li>
              </ul>
            </div>
          </div>
        </div>
        <div className="py-8 border-t border-zinc-900/50 text-center">
          <p className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-20">
            © 2025 Foresight Deployment. Digital Integrity Project.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;