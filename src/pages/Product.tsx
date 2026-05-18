import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { ModelType, DetectionResult, FaceResult } from '../types';
import { detectDeepfake } from '../services/api';
import {
  CloudArrowUpIcon,
  FilmIcon,
  BeakerIcon,
  EyeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { auth } from '../firebase';
import { saveScanHistory, uploadScanMedia } from '../services/api';
import { useAuth } from '../context/AuthContext';

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

// ---------------------------------------------------------------------------
// Per-face breakdown panel
// ---------------------------------------------------------------------------
const VERDICT_STYLES: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  Deepfake:   { border: 'border-rose-500/30',    bg: 'bg-rose-500/10',    text: 'text-rose-400',    dot: 'bg-rose-500'    },
  Suspicious: { border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-500'   },
  Real:       { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

const FaceBreakdownPanel: React.FC<{ faces: FaceResult[]; prediction: string }> = ({ faces, prediction }) => {
  if (!faces || faces.length === 0) return null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest heading-font">Per-Face Analysis</h4>
        <span className="dashboard-panel-title px-2 py-1 rounded-md border" style={{marginBottom: 0}}>
            {faces.length} face{faces.length !== 1 ? 's' : ''} detected
        </span>
      </div>
      <div className={`grid gap-4 ${
        faces.length === 1 ? 'grid-cols-1' : faces.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
      }`}>
        {faces.map((face) => {
          const styles = VERDICT_STYLES[face.face_verdict] ?? VERDICT_STYLES.Real;
          const pct = Math.round(face.fused_score * 100);
          const eyePct = Math.round(face.geometry.eye_asymmetry * 100);
          const confPct = Math.round(face.cnn_conf * 100);
          return (
            <div
              key={face.face_id}
              className={`rounded-2xl border p-5 flex flex-col gap-4 transition-all ${styles.border} ${styles.bg}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black ${styles.bg} ${styles.text} border ${styles.border}`}>
                    {face.face_id}
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest">Face {face.face_id}</span>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${styles.bg} ${styles.text} ${styles.border}`}>
                  {face.face_verdict}
                </span>
              </div>

              {/* Fused score — big bar */}
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="dashboard-panel-title">Manipulation Score</span>
                  <span className={`text-xs font-black font-mono ${styles.text}`}>{pct}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-zinc-900">
                  <div
                    className={`h-full rounded-full transition-all duration-[1200ms] ease-out ${
                      face.face_verdict === 'Deepfake' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                      : face.face_verdict === 'Suspicious' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                      : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Mini metrics grid */}
              <div className="grid grid-cols-3 gap-1 rounded-xl p-3 dashboard-insight-box border">
                <div className="text-center">
                  <p className="dashboard-panel-title">ViT Conf</p>
                  <p className={`text-xs font-black font-mono ${styles.text}`}>{confPct}%</p>
                </div>
                <div className="text-center border-x">
                  <p className="dashboard-panel-title">Eye Asym</p>
                  <p className={`text-xs font-black font-mono ${
                    eyePct > 20 ? 'text-rose-400' : eyePct > 10 ? 'text-amber-400' : 'text-slate-700 dark:text-zinc-300'
                  }`}>{eyePct}%</p>
                </div>
                <div className="text-center">
                  <p className="dashboard-panel-title">Geo Score</p>
                  <p className={`text-xs font-black font-mono ${
                    face.geom_score > 0.4 ? 'text-rose-400' : face.geom_score > 0.2 ? 'text-amber-400' : 'text-slate-700 dark:text-zinc-300'
                  }`}>{(face.geom_score * 100).toFixed(0)}%</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const Product: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
  const isDark = theme === 'dark';
  const [analysisMode, setAnalysisMode] = useState<'image' | 'video'>('image');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [selectedModel, setSelectedModel] = useState<ModelType>(ModelType.ViT);
  const [image, setImage] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [zoomedImage, setZoomedImage] = useState<{ url: string; model: string } | null>(null);

  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = (immediate = false) => {
    if (isDetecting) return;
    
    const reset = () => {
      setImage(null);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      setResult(null);
      setFileInfo(null);
      setShowHeatmap(false);
      setError(null);
      setIsRemoving(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    if (immediate) {
      reset();
    } else {
      setIsRemoving(true);
      setTimeout(reset, 300);
    }
  };

  const handleModeChange = (mode: 'image' | 'video') => {
    if (isDetecting) return;
    setAnalysisMode(mode);
    handleReset(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);

    if (file) {
      const fileSize = (file.size / (1024 * 1024)).toFixed(2) + " MB";

      if (analysisMode === 'image') {
        if (!file.type.startsWith('image/')) {
          setError("Invalid file format. Please upload a clear face image.");
          setImage(null);
          setResult(null);
          setFileInfo(null);
          return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
          setImage(reader.result as string);
          setFileInfo({ name: file.name, size: fileSize });
          setResult(null);
          setShowHeatmap(false);
        };
        reader.readAsDataURL(file);
      } else {
        if (!file.type.startsWith('video/')) {
          setError("Invalid file format. Please upload a valid video.");
          setVideoUrl(null);
          setResult(null);
          setFileInfo(null);
          return;
        }

        const url = URL.createObjectURL(file);
        setVideoUrl(url);
        setFileInfo({ name: file.name, size: fileSize });
        setResult(null);
        setShowHeatmap(false);
      }
    }
  };

  const extractFrameFromVideo = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video) return reject("No video element");

      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
          resolve(dataUrl);
        } else {
          reject("Could not get canvas context");
        }
      } catch (err) {
        reject(err);
      }
    });
  };

  const runDetection = async () => {
    if ((analysisMode === 'image' && !image) || (analysisMode === 'video' && !videoUrl) || !fileInfo) return;

    setIsDetecting(true);
    try {
      let imagePayload = image;
      let modelToUse = selectedModel;

      if (analysisMode === 'video') {
        imagePayload = await extractFrameFromVideo();
        modelToUse = ModelType.ViT;
      }

      if (!imagePayload) throw new Error("No image data extracted");

      const detectionResult = await detectDeepfake(auth.currentUser?.uid || 'guest', imagePayload, modelToUse);
      setResult(detectionResult);

      if (auth.currentUser && profile?.save_history !== false) {
        const uploadRes = await uploadScanMedia(
          auth.currentUser.uid,
          imagePayload,
          detectionResult.attentionMapUrl
        );

        await saveScanHistory({
          firebase_uid: auth.currentUser.uid,
          file_name: fileInfo.name,
          original_media_url: uploadRes.original_url || imagePayload,
          heatmap_url: uploadRes.heatmap_url || detectionResult.attentionMapUrl,
          result: detectionResult.prediction,
          confidence: detectionResult.confidence,
          model_used: modelToUse,
          explanation: detectionResult.explanation || `Analysis using ${modelToUse} protocol.`
        });
      }
    } catch (err) {
      console.error(err);
      setError("Model analysis failed. Please try again.");
    } finally {
      setIsDetecting(false);
    }
  };

  return (
    <div>
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
  {/* Radial glow */}
  <div className="absolute top-[-20%] left-[-10%] w-[700px] h-[700px] bg-blue-500/10 blur-[140px] rounded-full animate-pulse" />

  {/* Secondary ambient glow */}
  <div className="absolute bottom-[-30%] right-[-10%] w-[600px] h-[600px] bg-cyan-500/5 blur-[160px] rounded-full animate-pulse" />

  {/* Grid overlay */}
  <div
    className="absolute inset-0 opacity-[0.035]"
    style={{
      backgroundImage: `
        linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)
      `,
      backgroundSize: '60px 60px',
    }}
  />

  {/* Scanning sweep */}
  <motion.div
    animate={{
      x: ['-20%', '120%'],
    }}
    transition={{
      repeat: Infinity,
      duration: 12,
      ease: 'linear',
    }}
    className="absolute top-0 w-[40%] h-full bg-gradient-to-r from-transparent via-blue-500/6 to-transparent blur-3xl"
  />

  {/* Noise texture */}
  <div
    className="absolute inset-0 opacity-[0.02] mix-blend-soft-light"
    style={{
      backgroundImage:
        'url("https://grainy-gradients.vercel.app/noise.svg")',
    }}
  />
</div>
    <CustomCursor isDark={isDark} />
    <div className="space-y-12 fade-in relative">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-900/10 pb-8 relative z-10">
        <div className="space-y-4">
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter heading-font">Facial Analysis</h1>
            <p className="dashboard-title-desc">Verify biometric authenticity via transformer-based forensics.</p>
          </div>
          <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-xl w-fit relative">
            <motion.div 
              className="absolute inset-y-1 w-[calc(50%-4px)] bg-white dark:bg-zinc-800 rounded-lg shadow-sm" 
              initial={false}
              animate={{ x: analysisMode === 'video' ? '100%' : '0%' }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
            <button 
              onClick={() => handleModeChange('image')}
              className={`relative px-6 py-2 text-xs font-bold uppercase tracking-widest z-10 transition-colors ${analysisMode === 'image' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500'}`}
            >
              Image
            </button>
            <button 
              onClick={() => handleModeChange('video')}
              className={`relative px-6 py-2 text-xs font-bold uppercase tracking-widest z-10 transition-colors ${analysisMode === 'video' ? 'text-zinc-900 dark:text-white' : 'text-zinc-500'}`}
            >
              Video
            </button>
          </div>
        </div>

        {analysisMode === 'image' && (
          <div className="product-selector-container">
            <button
              onClick={() => {
                if (selectedModel !== ModelType.ViT) {
                  handleReset(true);
                  setSelectedModel(ModelType.ViT);
                }
              }}
              className={`product-selector-btn ${selectedModel === ModelType.ViT ? 'active' : ''}`}
            >
              ViT Architecture
            </button>
            <button
              onClick={() => {
                if (selectedModel !== ModelType.Swin) {
                  handleReset(true);
                  setSelectedModel(ModelType.Swin);
                }
              }}
              className={`product-selector-btn ${selectedModel === ModelType.Swin ? 'active' : ''}`}
            >
              Swin Protocol
            </button>
          </div>
        )}
      </header>

      <div className="grid lg:grid-cols-2 gap-12 items-stretch">
        <div className="space-y-8">
          <div className="relative group">
            <div
              onClick={() => {
                if (analysisMode === 'image' && !image) fileInputRef.current?.click();
                else if (analysisMode === 'video' && !videoUrl) fileInputRef.current?.click();
              }}
              className={`relative overflow-hidden aspect-square dashboard-upload-box ${
                isRemoving ? 'fade-out' : ''
              } ${(analysisMode === 'image' ? image : videoUrl) ? 'border-solid border-blue-500/30' : ''}`}
            >
              {result && (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: [1, 1, 0] }}
      transition={{
        duration: 2.2,
        times: [0, 0.85, 1],
      }}
      className="absolute inset-0 pointer-events-none z-30 rounded-[inherit]"
    >
      {/* TOP */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: '100%' }}
        transition={{ duration: 0.35, ease: 'linear' }}
        className={`absolute top-0 left-0 h-[2px] ${
          result.prediction === 'Fake' || result.prediction === 'Deepfake'
            ? 'bg-rose-500'
            : 'bg-emerald-500'
        }`}
      />

      {/* RIGHT */}
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: '100%' }}
        transition={{
          duration: 0.35,
          ease: 'linear',
          delay: 0.35,
        }}
        className={`absolute top-0 right-0 w-[2px] ${
          result.prediction === 'Fake'
            ? 'bg-rose-500'
            : 'bg-emerald-500'
        }`}
      />

      {/* BOTTOM */}
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: '100%' }}
        transition={{
          duration: 0.35,
          ease: 'linear',
          delay: 0.7,
        }}
        className={`absolute bottom-0 right-0 h-[2px] ${
          result.prediction === 'Fake'
            ? 'bg-rose-500'
            : 'bg-emerald-500'
        }`}
        style={{ transformOrigin: 'right' }}
      />

      {/* LEFT */}
      <motion.div
        initial={{ height: 0 }}
        animate={{ height: '100%' }}
        transition={{
          duration: 0.35,
          ease: 'linear',
          delay: 1.05,
        }}
        className={`absolute bottom-0 left-0 w-[2px] ${
          result.prediction === 'Fake'
            ? 'bg-rose-500'
            : 'bg-emerald-500'
        }`}
        style={{ transformOrigin: 'bottom' }}
      />
    </motion.div>
  )}
              {analysisMode === 'image' && image ? (
                <div className="relative w-full h-full">
                  <div 
                    onClick={() => showHeatmap && result && setZoomedImage({ url: result.attentionMapUrl, model: selectedModel })}
                    className={`relative w-full h-full ${showHeatmap && result ? 'cursor-zoom-in group/zoomer' : ''}`}
                  >
                    <img
                      src={showHeatmap && result ? result.attentionMapUrl : image}
                      className={`w-full h-full object-cover transition-opacity duration-500 ${isDetecting ? 'opacity-50' : 'opacity-100'}`}
                      alt="Face Preview"
                    />
                    {showHeatmap && result && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/zoomer:opacity-100 transition-opacity bg-black/20">
                        <div className="p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white">
                          <EyeIcon className="w-8 h-8" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Close Icon */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    disabled={isDetecting}
                    title={isDetecting ? "Please wait until analysis completes." : "Remove image"}
                    className={`dashboard-close-btn top-4 right-4 w-8 h-8 ${isDetecting ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>

                  {isDetecting && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-zinc-950/20 backdrop-blur-[2px]">
                      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs font-bold uppercase tracking-widest text-white shadow-sm">Model analyzing facial patterns...</p>
                    </div>
                  )}

                  {result && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowHeatmap(!showHeatmap); }}
                      className="absolute bottom-4 right-4 px-4 py-2 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white hover:bg-zinc-900 transition-all ml-auto flex items-center space-x-2"
                    >
                      <EyeIcon className="w-4 h-4" />
                      <span>{showHeatmap ? 'View Original' : 'View Heatmap'}</span>
                    </button>
                  )}
                </div>
              ) : analysisMode === 'video' && videoUrl ? (
                <div className="relative w-full h-full group">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    controlsList="nodownload nofullscreen noremoteplayback"
                    className={`w-full h-full object-cover transition-opacity duration-500 ${isDetecting ? 'opacity-50' : 'opacity-100'}`}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    disabled={isDetecting}
                    title={isDetecting ? "Please wait until analysis completes." : "Remove video"}
                    className={`dashboard-close-btn top-4 right-4 w-8 h-8 z-20 ${isDetecting ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                  {isDetecting && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-zinc-950/20 backdrop-blur-[2px] z-10">
                      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs font-bold uppercase tracking-widest text-white shadow-sm">Extracting frames and analyzing...</p>
                    </div>
                  )}
                  {result && !showHeatmap && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowHeatmap(true); }}
                      className="absolute bottom-4 right-4 px-4 py-2 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white hover:bg-zinc-900 transition-all ml-auto flex items-center space-x-2 z-20"
                    >
                      <EyeIcon className="w-4 h-4" />
                      <span>View Keyframe Map</span>
                    </button>
                  )}
                  {showHeatmap && result && (
                    <div className="absolute inset-0 z-10 bg-black/80 flex flex-col items-center justify-center cursor-zoom-in group/zoomer" onClick={() => setZoomedImage({ url: result.attentionMapUrl, model: 'Video' })}>
                       <img src={result.attentionMapUrl} className="w-full h-full object-contain opacity-80" alt="Heatmap" />
                       <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/zoomer:opacity-100 transition-opacity">
                         <div className="p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white">
                           <EyeIcon className="w-8 h-8" />
                         </div>
                       </div>
                       <button
                         onClick={(e) => { e.stopPropagation(); setShowHeatmap(false); }}
                         className="absolute bottom-4 right-4 px-4 py-2 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white hover:bg-zinc-900 transition-all z-20 flex items-center space-x-2"
                       >
                         <EyeIcon className="w-4 h-4" />
                         <span>Hide Map</span>
                       </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center space-y-4 p-8">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${isDark ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-slate-300 shadow-sm'}`}>
                    {analysisMode === 'image' ? <CloudArrowUpIcon className="w-8 h-8" /> : <FilmIcon className="w-8 h-8" />}
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold">Click to upload {analysisMode === 'image' ? 'image' : 'video'}</p>
                    <p className="product-file-tip">or drag and drop {analysisMode === 'image' ? 'face portrait' : 'video file'}</p>
                  </div>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept={analysisMode === 'image' ? "image/*" : "video/*"} />
            </div>

            {/* File Metadata */}
            {(analysisMode === 'image' ? image : videoUrl) && fileInfo && (
              <div className={`mt-4 flex items-center justify-between px-1 animate-in fade-in duration-500 ${isRemoving ? 'fade-out' : ''}`}>
                <div className="flex flex-col">
                  <p className="text-sm font-bold truncate max-w-[200px]">{fileInfo.name}</p>
                  <p className="dashboard-panel-title">{fileInfo.size}</p>
                </div>
                <div className={`px-2 py-1 rounded-md text-[8px] font-black tracking-widest uppercase border ${isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  Biometric Source
                </div>
              </div>
            )}
          </div>

          <button
            disabled={(analysisMode === 'image' ? !image : !videoUrl) || isDetecting}
            onClick={runDetection}
            className={`w-full py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all relative overflow-hidden ${(analysisMode === 'image' ? !image : !videoUrl) || isDetecting
              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20 active:scale-[0.99]'
              }`}
          >
            {isDetecting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing...
              </span>
            ) : 'Start Analysis'}
          </button>
          {error && <p className="text-rose-500 text-xs font-medium text-center">{error}</p>}

          {!result && (analysisMode === 'image' ? image : videoUrl) && !isDetecting && (
            <div className="dashboard-panel p-6 space-y-4">
              <p className="dashboard-panel-title">Analysis will include</p>
              {[
                { icon: '🔍', label: 'Multi-face MTCNN detection' },
                { icon: '🧠', label: analysisMode === 'video' ? 'Neural video frame extraction' : 'ViT/Swin attention rollout' },
                { icon: '📐', label: 'Facial geometry validation' },
                { icon: '🗺️', label: 'Attention region mapping' },
                { icon: '🤖', label: 'LLM forensic explanation' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-base">{item.icon}</span>
                  <span className="dashboard-title-desc">{item.label}</span>
                </div>
              ))}
            </div>
          )}
          {!(analysisMode === 'image' ? image : videoUrl) && (
            <div className="dashboard-panel p-6 space-y-3">
              <p className="dashboard-panel-title">Supported inputs</p>
              {analysisMode === 'image' ? (
                ['JPG / JPEG portrait', 'PNG face image', 'WEBP photo', 'Max recommended: 5 MB'].map((tip, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-1 h-1 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-slate-300'}`} />
                    <span className="dashboard-title-desc">{tip}</span>
                  </div>
                ))
              ) : (
                ['MP4 video', 'WEBM video format', 'MOV file', 'Max recommended: 50 MB'].map((tip, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-1 h-1 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-slate-300'}`} />
                    <span className="dashboard-title-desc">{tip}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className={`relative card-foresight p-10 min-h-[500px] flex flex-col`}
  >
  
          {result ? (() => {
            const confidencePct = result.confidence > 1
              ? parseFloat(result.confidence.toFixed(2))
              : parseFloat((result.confidence * 100).toFixed(2));

            return (
            <div className="space-y-12 animate-in fade-in duration-700">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-600 heading-font">Forensic Verdict</h3>
                <div className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                  result.prediction === 'Fake' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
                  : result.prediction === 'Suspicious' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
                  : result.prediction === 'Uncertain' ? 'bg-zinc-500/10 text-zinc-500 border border-zinc-500/20'
                  : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                }`}>
                  {result.prediction} IDENTIFIED
                </div>
              </div>

              <div className="space-y-6">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="dashboard-panel-title">Confidence Spectrum</p>
                    <p className="text-5xl font-black tracking-tighter heading-font">{confidencePct}%</p>
                  </div>
                  <div className="text-right">
                    <p className="dashboard-panel-title">Inference Mean</p>
                    <p className="text-sm font-bold font-mono tracking-tight text-blue-500/70">{result.inferenceTime}ms</p>
                  </div>
                </div>
                <div className={`h-2.5 w-full rounded-full overflow-hidden ${isDark ? 'bg-zinc-950' : 'bg-slate-100'}`}>
                  <div
                    className={`h-full transition-all duration-[1500ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
                      result.prediction === 'Fake' ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                      : result.prediction === 'Suspicious' ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                      : result.prediction === 'Uncertain' ? 'bg-zinc-500'
                      : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                    }`}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
              </div>

              <div className="space-y-6 pt-10 border-t border-zinc-900/10">
                <h4 className="text-xs font-bold uppercase tracking-widest heading-font">Forensic Analysis</h4>

                <div className="dashboard-panel p-6">
                  <p className="dashboard-title-desc leading-relaxed">
                    {result.structured_explanation?.summary
                      || result.explanation?.trim()
                      || `The ${analysisMode === 'video' ? 'Neural Video Scan' : `${selectedModel} Architecture`} identifies ${result.prediction === 'Fake'
                          ? 'anomalous local variations in facial textures and pixel-level artifacts consistent with generative models'
                          : 'statistically significant biological patterns and consistent lighting transitions across the detected face mesh'}.`
                    }
                  </p>
                </div>

                {/* Region Badges */}
                {result.structured_explanation?.regions_examined && result.structured_explanation.regions_examined.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className="dashboard-panel-title self-center">Regions:</span>
                    {result.structured_explanation.regions_examined.map((region, idx) => (
                      <span
                        key={idx}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${
                          isDark ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' : 'bg-blue-50 border-blue-200 text-blue-600'
                        }`}
                      >
                        {region.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}

                {/* Primary Findings */}
                {result.structured_explanation?.primary_findings && result.structured_explanation.primary_findings.length > 0 && (
                  <div className="dashboard-panel p-6">
                    <p className="dashboard-panel-title opacity-50 mb-3">Primary Findings</p>
                    <ul className="text-xs space-y-2.5 font-medium">
                      {result.structured_explanation.primary_findings.map((finding, idx) => (
                        <li key={idx} className="flex items-start space-x-2.5">
                          <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                            result.prediction === 'Fake' ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.4)]'
                            : result.prediction === 'Suspicious' ? 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]'
                            : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                          }`} />
                          <span className={isDark ? 'text-zinc-300' : 'text-slate-700'}>{finding}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* Secondary Signals */}
                  <div className="dashboard-panel p-6">
                    <p className="dashboard-panel-title opacity-50 mb-3">
                      {result.structured_explanation ? 'Secondary Signals' : 'Suspicious Domains'}
                    </p>
                    <ul className="text-xs space-y-2 font-medium">
                      {(result.structured_explanation?.secondary_signals && result.structured_explanation.secondary_signals.length > 0
                        ? result.structured_explanation.secondary_signals
                        : result.suspicious_domains && result.suspicious_domains.length > 0
                          ? result.suspicious_domains
                          : result.prediction === 'Fake'
                            ? ['Periorbital margin', 'Mandibular texture']
                            : ['Natural eye geometry', 'Consistent skin tone']
                      ).map((item, idx) => (
                        <li key={idx} className="flex items-center space-x-2">
                          <div className={`w-1.5 h-1.5 rounded-full opacity-60 ${result.prediction === 'Fake' ? 'bg-rose-500' : result.prediction === 'Suspicious' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                          <span className="opacity-80">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Confidence Explanation / Model Consensus */}
                  <div className="dashboard-panel p-6">
                    {result.structured_explanation?.confidence_explanation ? (
                      <>
                        <p className="dashboard-panel-title opacity-50 mb-3">Confidence Notes</p>
                        <p className="dashboard-title-desc leading-snug mb-4">
                          {result.structured_explanation.confidence_explanation}
                        </p>
                        <p className="dashboard-panel-title opacity-50 mb-2">{analysisMode === 'video' ? 'Video Analysis Consensus' : 'Model Consensus'}</p>
                        <p className="text-xs italic leading-snug opacity-70">
                          {analysisMode === 'video' ? 'Temporal frame extraction analyzed via deep neural forensics.' : (result.structured_explanation.model_consensus || result.model_consensus?.trim() || (selectedModel === ModelType.ViT ? 'Global feature correlation analysis verified via forensic protocol.' : 'Shifted window patch hierarchy verified via forensic protocol.'))}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="dashboard-panel-title opacity-50 mb-3">{analysisMode === 'video' ? 'Video Analysis Consensus' : 'Model Consensus'}</p>
                        <p className="text-xs italic leading-snug opacity-70">{analysisMode === 'video' ? 'Temporal frame extraction analyzed via deep neural forensics.' : (result.model_consensus?.trim() || (selectedModel === ModelType.ViT ? 'Global feature correlation analysis verified via forensic protocol.' : 'Shifted window patch hierarchy verified via forensic protocol.'))}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            );
          })() : (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-20">
              <BeakerIcon className="w-16 h-16 mb-6" />
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] heading-font">Awaiting biometric input</p>
            </div>
          )}
        </div>
      </div>

      {/* Per-face breakdown */}
      {analysisMode === 'image' && result?.faces && result.faces.length > 0 && (
        <div className="dashboard-panel p-8">
          <FaceBreakdownPanel faces={result.faces} prediction={result.prediction} />
        </div>
      )}

      {/* Pop-up Heatmap Viewer */}
      <AnimatePresence>
        {zoomedImage && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-12">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setZoomedImage(null)}
              className="absolute inset-0 bg-zinc-950/90 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 10 }}
              className="dashboard-modal w-full max-w-5xl aspect-video rounded-[2rem]"
            >
              <img src={zoomedImage.url} className="w-full h-full object-cover" alt="Magnified Heatmap" />
              
              {/* Overlay Content */}
              <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white heading-font">{zoomedImage.model === 'Video' ? 'Neural Video' : zoomedImage.model} Forensic Map</h3>
                    <p className="text-zinc-400 text-sm">Full-resolution neural attention analysis.</p>
                  </div>
                  <button 
                    onClick={() => setZoomedImage(null)}
                    className="w-12 h-12 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </div>
  );
};

export default Product;
