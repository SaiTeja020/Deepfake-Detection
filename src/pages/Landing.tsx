import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring, AnimatePresence } from 'framer-motion';
import { 
  Shield, 
  Search, 
  Activity, 
  AlertTriangle, 
  Fingerprint, 
  Globe, 
  Lock, 
  ArrowRight, 
  Layers, 
  Zap,
  CheckCircle2,
  FileSearch,
  Scale,
  Eye,
  Cpu,
  Scan,
  ShieldAlert,
  Binary
} from 'lucide-react';

const useMousePosition = () => {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const updateMousePosition = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
    };
    window.addEventListener('mousemove', updateMousePosition);
    return () => window.removeEventListener('mousemove', updateMousePosition);
  }, []);

  return mousePosition;
};

const CustomCursor = ({ isDark }: { isDark: boolean }) => {
  const { x, y } = useMousePosition();
  const cursorX = useSpring(0, { damping: 25, stiffness: 300 });
  const cursorY = useSpring(0, { damping: 25, stiffness: 300 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [cursorX, cursorY]);

  return (
    <motion.div
      className="fixed top-0 left-0 z-[9999] pointer-events-none hidden lg:block"
      style={{
        x: cursorX,
        y: cursorY,
        translateX: '-50%',
        translateY: '-50%',
      }}
    >
      <div className="relative flex items-center justify-center">
        {/* Crosshair lines */}
        <div className="absolute h-8 w-[1px] bg-blue-500/40" />
        <div className="absolute w-8 h-[1px] bg-blue-500/40" />
        
        {/* Corner brackets */}
        <div className="absolute -top-4 -left-4 h-2 w-2 border-t border-l border-blue-500" />
        <div className="absolute -top-4 -right-4 h-2 w-2 border-t border-r border-blue-500" />
        <div className="absolute -bottom-4 -left-4 h-2 w-2 border-b border-l border-blue-500" />
        <div className="absolute -bottom-4 -right-4 h-2 w-2 border-b border-r border-blue-500" />

        {/* Center dot */}
        <div className="h-1 w-1 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(37,99,235,0.8)]" />
        
        {/* Scanning ring */}
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute h-10 w-10 rounded-full border border-blue-500/20" 
        />

        {/* Coordinates */}
        <div className="absolute top-6 left-6 flex flex-col font-mono text-[7px] uppercase tracking-[0.2em] text-blue-500/60">
          <span>LAT: {((y / window.innerHeight) * 180 - 90).toFixed(4)}</span>
          <span>LNG: {((x / window.innerWidth) * 360 - 180).toFixed(4)}</span>
          <span className="mt-1 text-blue-500/30">SCANNING_ACTIVE</span>
        </div>
      </div>
    </motion.div>
  );
};

const WordCycler = () => {
  const words = ["TRUST", "REALITY", "AUTHENTICITY", "TRUTH", "IDENTITY", "EVIDENCE"];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="inline-block relative h-[1.1em] overflow-hidden align-bottom min-w-[4ch] text-left">
      <AnimatePresence mode="wait">
        <motion.span
          key={words[index]}
          initial={{ y: "100%", opacity: 0, filter: "blur(10px)", scale: 0.8 }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }}
          exit={{ y: "-100%", opacity: 0, filter: "blur(10px)", scale: 1.2 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="block text-blue-500"
        >
          {words[index]}.
        </motion.span>
      </AnimatePresence>
    </div>
  );
};

const NeuralScanPreview = ({ isDark }: { isDark: boolean }) => {
  return (
    <div className={`relative w-full aspect-video rounded-3xl overflow-hidden border ${isDark ? 'border-zinc-800 bg-zinc-950' : 'border-slate-200 bg-slate-50'}`}>
      <div className="absolute inset-0 bg-dots opacity-20" />
      
      {/* Mock Face Scan */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-64 h-64 md:w-80 md:h-80">
          {/* Base Image (Placeholder for a face) */}
          <img 
            src="https://picsum.photos/seed/face/800/800" 
            alt="Neural Scan Subject" 
            className="w-full h-full object-cover rounded-2xl opacity-40 grayscale"
            referrerPolicy="no-referrer"
          />
          
          {/* Scanning Line */}
          <motion.div 
            animate={{ top: ["0%", "100%", "0%"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-1 bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,1)] z-10"
          />
          
          {/* Detection Boxes */}
          <motion.div 
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 1.5 }}
            className="absolute top-1/4 left-1/4 w-20 h-20 border-2 border-blue-500 rounded-lg"
          >
            <span className="absolute -top-6 left-0 font-mono text-[8px] text-blue-500 bg-black/50 px-1">EYE_ARTIFACT_DETECTED</span>
          </motion.div>
          
          <motion.div 
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2, delay: 0.5 }}
            className="absolute bottom-1/3 right-1/4 w-24 h-16 border-2 border-rose-500 rounded-lg"
          >
            <span className="absolute -bottom-6 right-0 font-mono text-[8px] text-rose-500 bg-black/50 px-1">SYNTHETIC_TEXTURE_98%</span>
          </motion.div>

          {/* ViT / Swin Labels */}
          <div className="absolute -right-12 top-1/2 -translate-y-1/2 flex flex-col gap-2">
            <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded text-[8px] font-mono text-blue-500">ViT-L/16</div>
            <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded text-[8px] font-mono text-blue-500">SWIN-B</div>
          </div>
        </div>
      </div>

      {/* Overlay Stats */}
      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
        <div className="space-y-1">
          <p className="font-mono text-[10px] opacity-40 uppercase tracking-widest">Analysis Stream</p>
          <div className="flex gap-1 h-4 items-end">
            {[...Array(20)].map((_, i) => (
              <motion.div 
                key={i}
                animate={{ height: [4, Math.random() * 12 + 4, 4] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.05 }}
                className="w-1 bg-blue-500/40 rounded-full"
              />
            ))}
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] opacity-40 uppercase tracking-widest">Confidence</p>
          <p className="text-2xl font-black text-blue-500">99.82%</p>
        </div>
      </div>
    </div>
  );
};

const FadeIn = ({ children, delay = 0, direction = 'up' }: { children: React.ReactNode, delay?: number, direction?: 'up' | 'down' | 'left' | 'right' }) => {
  const directions = {
    up: { y: 40, x: 0 },
    down: { y: -40, x: 0 },
    left: { x: 40, y: 0 },
    right: { x: -40, y: 0 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...directions[direction] }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.8, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
};

const HeroBackground = ({ isDark }: { isDark: boolean }) => {
  const mouseX = useSpring(0, { damping: 50, stiffness: 400 });
  const mouseY = useSpring(0, { damping: 50, stiffness: 400 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  const rotateX = useTransform(mouseY, [0, typeof window !== 'undefined' ? window.innerHeight : 1000], [5, -5]);
  const rotateY = useTransform(mouseX, [0, typeof window !== 'undefined' ? window.innerWidth : 1000], [-5, 5]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <motion.div 
        style={{ rotateX, rotateY, perspective: 1000 }}
        className="relative h-full w-full"
      >
        <div className={`absolute top-1/4 left-1/3 w-[500px] h-[500px] rounded-full blur-[150px] opacity-20 transition-colors duration-1000 ${isDark ? 'bg-blue-600' : 'bg-blue-300'}`} />
        <div className={`absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full blur-[150px] opacity-10 transition-colors duration-1000 ${isDark ? 'bg-blue-400' : 'bg-cyan-300'}`} />
        
        {/* Interactive Grid */}
        <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)]">
          <div className={`h-full w-full bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] ${isDark ? 'opacity-20' : 'opacity-10'}`} />
        </div>
      </motion.div>
    </div>
  );
};

const BentoCard = ({ title, desc, icon: Icon, className = "", delay = 0 }: { title: string, desc: string, icon: any, className?: string, delay?: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ 
        y: -8, 
        scale: 1.02,
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        transition: { duration: 0.2 } 
      }}
      className={`group relative overflow-hidden rounded-3xl border p-8 transition-all ${className}`}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <div className="relative z-10">
        <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500 transition-transform group-hover:scale-110 group-hover:rotate-3">
          <Icon className="h-6 w-6" />
        </div>
        <h3 className="mb-3 text-xl font-bold tracking-tight">{title}</h3>
        <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{desc}</p>
      </div>
      <div className="absolute bottom-0 right-0 p-4 opacity-0 group-hover:opacity-20 transition-opacity">
        <Icon className="h-24 w-24 translate-x-8 translate-y-8" />
      </div>
    </motion.div>
  );
};

const Landing: React.FC<{ theme: 'dark' | 'light', isLoggedIn: boolean }> = ({ theme, isLoggedIn }) => {
  const isDark = theme === 'dark';
  const { scrollYProgress } = useScroll();

  // Parallax transforms for hero elements
  const heroY = useTransform(scrollYProgress, [0, 0.2], [0, -100]);
  const subHeroY = useTransform(scrollYProgress, [0, 0.2], [0, -50]);
  const ctaY = useTransform(scrollYProgress, [0, 0.2], [0, -25]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  return (
    <div className="relative min-h-screen grain">
      <CustomCursor isDark={isDark} />
      
      {/* Background Elements */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
        <div className={`absolute top-0 left-1/4 w-96 h-96 rounded-full blur-[120px] opacity-20 ${isDark ? 'bg-blue-600' : 'bg-blue-300'}`}></div>
        <div className={`absolute bottom-0 right-1/4 w-96 h-96 rounded-full blur-[120px] opacity-10 ${isDark ? 'bg-blue-400' : 'bg-blue-200'}`}></div>
        <div className="absolute inset-0 bg-dots opacity-30"></div>
      </div>

      {/* Hero Section */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center overflow-hidden">
        <HeroBackground isDark={isDark} />
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="relative z-10 max-w-5xl"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className={`mb-8 inline-flex items-center space-x-2 rounded-full border px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] ${isDark ? 'bg-blue-500/5 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-700'}`}
          >
            <Scan className="h-3 w-3 animate-pulse" />
            <span>Media Integrity Framework</span>
          </motion.div>

          <h1 className="mb-8 text-5xl md:text-8xl font-black tracking-tight heading-font leading-[1.0] max-w-4xl mx-auto">
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="block overflow-hidden"
            >
              {"Deepfakes".split("").map((char, i) => (
                <motion.span
                  key={i}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  transition={{ delay: 0.4 + i * 0.05, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  className="inline-block"
                >
                  {char}
                </motion.span>
              ))}
            </motion.span>
            Are Undermining<br/> Digital <WordCycler />
          </h1>

          <motion.p
            style={{ y: subHeroY }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
            className={`mx-auto mb-12 max-w-3xl text-lg md:text-2xl font-light leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}
          >
            Synthetic media is rapidly evolving, threatening personal identity, democratic discourse, and public safety. Foresight provides the technical rigor needed to authenticate reality.
          </motion.p>

          <motion.div
            style={{ y: ctaY }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Link
              to={isLoggedIn ? "/product" : "/login"}
              className={`group relative flex h-16 items-center justify-center space-x-3 overflow-hidden rounded-2xl px-12 font-bold uppercase tracking-widest transition-all hover:scale-105 active:scale-95 ${isDark ? 'bg-white text-black' : 'bg-blue-600 text-white'}`}
            >
              <span className="relative z-10">Analyze Image</span>
              <ArrowRight className="relative z-10 h-5 w-5 transition-transform group-hover:translate-x-1" />
              <div className="absolute inset-0 -translate-x-full bg-blue-500 transition-transform group-hover:translate-x-0" />
            </Link>
            <Link
              to={isLoggedIn ? "/compare" : "/login"}
              className={`flex h-16 items-center justify-center rounded-2xl border px-12 font-bold text-[11px] uppercase tracking-[0.3em] transition-all hover:bg-zinc-500/5 ${isDark ? 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white' : 'border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900'}`}
            >
              Compare Models
            </Link>
          </motion.div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <div className={`flex h-12 w-6 justify-center rounded-full border-2 ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
            <motion.div
              animate={{ y: [4, 24, 4] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="mt-2 h-2 w-1 rounded-full bg-blue-500"
            />
          </div>
        </motion.div>
      </section>

      {/* Bento Grid Section */}
      <section className="mx-auto max-w-7xl px-6 py-32">
        <FadeIn>
          <div className="mb-20 max-w-2xl">
            <h2 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl heading-font">The Erosion of Shared Reality.</h2>
            <p className={`text-lg leading-relaxed ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              Deepfakes are no longer just a technical curiosity. They are active instruments of manipulation, targeting the core of our social and political systems.
            </p>
          </div>
        </FadeIn>

        <div className="bento-grid">
          <BentoCard 
            title="Identity Fraud"
            desc="High-fidelity synthetic masks used to bypass biometric security and impersonate individuals."
            icon={Fingerprint}
            className="col-span-1 md:col-span-2 row-span-1 border-blue-500/20"
            delay={0.1}
          />
          <BentoCard 
            title="Misinformation"
            desc="Fabricated audio and video designed to destabilize public opinion and political stability."
            icon={Globe}
            className="col-span-1 row-span-1"
            delay={0.2}
          />
          <BentoCard 
            title="Transformer Logic"
            desc="Analyzing relational patches rather than just local pixels to identify inconsistencies."
            icon={Cpu}
            className="col-span-1 row-span-2 bg-blue-500/5 border-blue-500/30"
            delay={0.3}
          />
          <BentoCard 
            title="Digital Extortion"
            desc="Non-consensual synthetic imagery used for blackmail and social damage."
            icon={ShieldAlert}
            className="col-span-1 row-span-1"
            delay={0.4}
          />
          <BentoCard 
            title="Trust Deficit"
            desc="A growing skepticism where genuine evidence is dismissed as fake, paralyzing justice."
            icon={Scale}
            className="col-span-1 md:col-span-2 row-span-1"
            delay={0.5}
          />
        </div>
      </section>

      {/* Technical Depth Section */}
      <section className="relative overflow-hidden py-32">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-20 lg:grid-cols-2 lg:items-center">
            <FadeIn direction="right">
              <div className="space-y-8">
                <div className={`inline-flex items-center space-x-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                  <Zap className="h-3 w-3" />
                  <span>Architecture</span>
                </div>
                <h2 className="text-4xl font-bold tracking-tight sm:text-6xl heading-font">Transformer-Driven Analysis.</h2>
                <p className={`text-xl leading-relaxed ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Foresight leverages dual neural architectures to detect anomalies that traditional CNNs miss. By analyzing relational patches rather than just local pixels, we identify structural inconsistencies in synthetic generations.
                </p>
                
                <div className="grid gap-6 sm:grid-cols-2">
                  {[
                    { title: "Vision Transformer", desc: "Captures global dependencies, detecting inconsistencies in lighting and shadow." },
                    { title: "Swin Architecture", desc: "Hierarchical windowing to spot micro-manipulations in skin texture." },
                    { title: "Explainable Heatmaps", desc: "Visual evidence of detected manipulation and localized confidence scores provided for auditability." },
                    { title: "Parallel Inference", desc: "Inference via ViT and Swin models to generate a weighted consensus." }
                  ].map((item, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center space-x-2 text-blue-500">
                        <CheckCircle2 className="h-4 w-4" />
                        <span className="text-sm font-bold uppercase tracking-wider">{item.title}</span>
                      </div>
                      <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>{item.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>

            <FadeIn direction="left">
              <NeuralScanPreview isDark={isDark} />
            </FadeIn>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="mx-auto max-w-7xl px-6 py-32">
        <motion.div
          whileHover={{ scale: 1.02 }}
          className={`relative overflow-hidden rounded-[4rem] p-12 text-center sm:p-24 ${isDark ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white'}`}
        >
          <div className="absolute inset-0 opacity-20">
            <div className="h-full w-full bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:20px_20px]"></div>
          </div>
          <div className="relative z-10">
            <h2 className="mb-8 text-4xl font-black tracking-tight sm:text-6xl heading-font uppercase">A Transparent Verification Process</h2>
            <p className="mx-auto mb-12 max-w-xl text-lg font-light opacity-80">
              Foresight follows a rigorous forensic protocol to ensure every analysis is backed by explainable evidence. Join the initiative to restore digital authenticity.
            </p>
            <Link
              to={isLoggedIn ? "/product" : "/login"}
              className={`inline-flex h-16 items-center justify-center rounded-2xl bg-white px-12 font-bold uppercase tracking-widest text-black transition-all hover:scale-105 active:scale-95`}
            >
              Get Started
            </Link>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className={`mx-auto max-w-7xl px-6 py-20 border-t ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
        <div className="flex flex-col items-center justify-between gap-10 md:flex-row">
          <div className="space-y-4 text-center md:text-left flex flex-col items-center md:items-start">
            <div className="flex items-center space-x-3">
              <img src="/src/assets/logo.svg" alt="Foresight Logo" className="w-7 h-7" />
              <h4 className="text-2xl font-black tracking-tighter uppercase heading-font">Foresight</h4>
            </div>
            <p className={`text-sm max-w-xs ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              Advancing media integrity through research-driven authentication. We empower institutions and individuals to distinguish reality from synthetic media.
            </p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-10 text-xs font-bold uppercase tracking-widest">
            <a href="#" className="hover:text-blue-500 transition-colors">Models</a>
            <a href="#" className="hover:text-blue-500 transition-colors">Research Ethics</a>
            <a href="#" className="hover:text-blue-500 transition-colors">Data Integrity</a>
            <a href="#" className="hover:text-blue-500 transition-colors">Contact</a>
          </div>
        </div>
        
        <div className="mt-20 flex flex-col items-center justify-between gap-6 border-t pt-10 md:flex-row border-zinc-900/50">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">© 2026 Foresight Deployment. Digital Integrity Project.</p>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px] font-mono uppercase tracking-[0.3em] opacity-40">Mainnet Active</span>
            </div>
            <div className="flex gap-4 opacity-20">
              <div className="h-4 w-4 rounded bg-current" />
              <div className="h-4 w-4 rounded bg-current" />
              <div className="h-4 w-4 rounded bg-current" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;