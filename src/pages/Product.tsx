import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ModelType, DetectionResult, FaceResult } from '../types';
import { detectDeepfake } from '../services/api';
import {
  CloudArrowUpIcon,
  ArrowPathIcon,
  BeakerIcon,
  ClockIcon,
  MagnifyingGlassIcon,
  ExclamationCircleIcon,
  EyeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { auth } from '../firebase';
import { saveScanHistory, uploadScanMedia } from '../services/api';
import { useAuth } from '../context/AuthContext';

// ---------------------------------------------------------------------------
// Per-face breakdown panel
// ---------------------------------------------------------------------------
const VERDICT_STYLES: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  Deepfake:   { border: 'border-rose-500/30',    bg: 'bg-rose-500/10',    text: 'text-rose-400',    dot: 'bg-rose-500'    },
  Suspicious: { border: 'border-amber-500/30',   bg: 'bg-amber-500/10',   text: 'text-amber-400',   dot: 'bg-amber-500'   },
  Real:       { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

const FaceBreakdownPanel: React.FC<{ faces: FaceResult[]; isDark: boolean; prediction: string }> = ({ faces, isDark, prediction }) => {
  if (!faces || faces.length === 0) return null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest heading-font">Per-Face Analysis</h4>
        <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-md border ${
          isDark ? 'border-zinc-800 text-zinc-600 bg-zinc-900/40' : 'border-slate-200 text-slate-400 bg-slate-50'
        }`}>{faces.length} face{faces.length !== 1 ? 's' : ''} detected</span>
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
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>Manipulation Score</span>
                  <span className={`text-xs font-black font-mono ${styles.text}`}>{pct}%</span>
                </div>
                <div className={`h-2 w-full rounded-full ${isDark ? 'bg-zinc-900' : 'bg-slate-200'}`}>
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
              <div className={`grid grid-cols-3 gap-1 rounded-xl p-3 ${isDark ? 'bg-zinc-900/60' : 'bg-white/60'} border ${isDark ? 'border-zinc-800' : 'border-slate-100'}`}>
                <div className="text-center">
                  <p className={`text-[8px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>ViT Conf</p>
                  <p className={`text-xs font-black font-mono ${styles.text}`}>{confPct}%</p>
                </div>
                <div className={`text-center border-x ${isDark ? 'border-zinc-800' : 'border-slate-200'}`}>
                  <p className={`text-[8px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>Eye Asym</p>
                  <p className={`text-xs font-black font-mono ${
                    eyePct > 20 ? 'text-rose-400' : eyePct > 10 ? 'text-amber-400' : isDark ? 'text-zinc-300' : 'text-slate-700'
                  }`}>{eyePct}%</p>
                </div>
                <div className="text-center">
                  <p className={`text-[8px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>Geo Score</p>
                  <p className={`text-xs font-black font-mono ${
                    face.geom_score > 0.4 ? 'text-rose-400' : face.geom_score > 0.2 ? 'text-amber-400' : isDark ? 'text-zinc-300' : 'text-slate-700'
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError(null);

    if (file) {
      if (!file.type.startsWith('image/')) {
        setError("Invalid file format. Please upload a clear face image.");
        setImage(null);
        setResult(null);
        setFileInfo(null);
        return;
      }

      const reader = new FileReader();
      const fileSize = (file.size / (1024 * 1024)).toFixed(2) + " MB";
      reader.onloadend = () => {
        setImage(reader.result as string);
        setFileInfo({ name: file.name, size: fileSize });
        setResult(null);
        setShowHeatmap(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const runDetection = async () => {
    if (!image || !fileInfo) return;

    setIsDetecting(true);
    try {
      const detectionResult = await detectDeepfake(auth.currentUser?.uid || 'guest', image, selectedModel);
      setResult(detectionResult);

      // Upload media to Supabase Storage before saving history ONLY if save_history is enabled
      if (auth.currentUser && profile?.save_history !== false) {
        const uploadRes = await uploadScanMedia(
          auth.currentUser.uid,
          image,
          detectionResult.attentionMapUrl
        );

        // Save to Supabase via Flask Backend
        await saveScanHistory({
          firebase_uid: auth.currentUser.uid,
          file_name: fileInfo.name,
          original_media_url: uploadRes.original_url || image,
          heatmap_url: uploadRes.heatmap_url || detectionResult.attentionMapUrl,
          result: detectionResult.prediction,
          confidence: detectionResult.confidence,
          model_used: selectedModel,
          explanation: detectionResult.explanation || `Analysis using ${selectedModel} protocol.`
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
    <div className="space-y-12 fade-in relative">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-900/10 pb-8 relative z-10">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter heading-font">Facial Analysis</h1>
          <p className={`text-sm font-light ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>Verify biometric authenticity via transformer-based forensics.</p>
        </div>

        <div className={`flex p-1 rounded-2xl border ${isDark ? 'bg-zinc-950 border-zinc-900 shadow-inner' : 'bg-slate-100 border-slate-200'}`}>
          <button
            onClick={() => {
              if (selectedModel !== ModelType.ViT) {
                handleReset(true);
                setSelectedModel(ModelType.ViT);
              }
            }}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${selectedModel === ModelType.ViT ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : (isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-slate-500 hover:text-slate-800')}`}
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
            className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${selectedModel === ModelType.Swin ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : (isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-slate-500 hover:text-slate-800')}`}
          >
            Swin Protocol
          </button>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-12 items-stretch">
        <div className="space-y-8">
          <div className="relative group">
            <div
              onClick={() => !image && fileInputRef.current?.click()}
              className={`aspect-square rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer relative overflow-hidden ${isRemoving ? 'fade-out' : ''} ${isDark ? 'bg-zinc-900/20 border-zinc-800 hover:border-blue-500/50' : 'bg-slate-50 border-slate-200 hover:border-blue-600/50'} ${image ? 'border-solid border-blue-500/30' : ''}`}
            >
              {image ? (
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
                    className={`absolute top-4 right-4 w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 z-10 ${isDetecting ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105'} ${isDark
                      ? 'bg-zinc-900/80 border-zinc-700 text-zinc-400 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-500'
                      : 'bg-white/80 border-slate-200 text-slate-500 hover:bg-rose-50/50 hover:border-rose-500/40 hover:text-rose-500 shadow-sm'
                      }`}
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
              ) : (
                <div className="text-center space-y-4 p-8">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto ${isDark ? 'bg-zinc-900 text-zinc-700' : 'bg-white text-slate-300 shadow-sm'}`}>
                    <CloudArrowUpIcon className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-bold">Click to upload image</p>
                    <p className={`text-xs ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>or drag and drop face portrait</p>
                  </div>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
            </div>

            {/* File Metadata */}
            {image && fileInfo && (
              <div className={`mt-4 flex items-center justify-between px-1 animate-in fade-in duration-500 ${isRemoving ? 'fade-out' : ''}`}>
                <div className="flex flex-col">
                  <p className="text-sm font-bold truncate max-w-[200px]">{fileInfo.name}</p>
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>{fileInfo.size}</p>
                </div>
                <div className={`px-2 py-1 rounded-md text-[8px] font-black tracking-widest uppercase border ${isDark ? 'bg-zinc-900/50 border-zinc-800 text-zinc-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                  Biometric Source
                </div>
              </div>
            )}
          </div>

          <button
            disabled={!image || isDetecting}
            onClick={runDetection}
            className={`w-full py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all relative overflow-hidden ${!image || isDetecting
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

          {/* Fill void below button when no result */}
          {!result && image && !isDetecting && (
            <div className={`rounded-2xl border p-6 space-y-4 ${isDark ? 'bg-zinc-900/20 border-zinc-800' : 'bg-slate-50 border-slate-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>Analysis will include</p>
              {[
                { icon: '🔍', label: 'Multi-face MTCNN detection' },
                { icon: '🧠', label: 'ViT/Swin attention rollout' },
                { icon: '📐', label: 'Facial geometry validation' },
                { icon: '🗺️', label: 'Attention region mapping' },
                { icon: '🤖', label: 'LLM forensic explanation' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-base">{item.icon}</span>
                  <span className={`text-xs ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
          {!image && (
            <div className={`rounded-2xl border p-6 space-y-3 ${isDark ? 'bg-zinc-900/20 border-zinc-800' : 'bg-slate-50 border-slate-100'}`}>
              <p className={`text-[9px] font-bold uppercase tracking-widest ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>Supported inputs</p>
              {['JPG / JPEG portrait', 'PNG face image', 'WEBP photo', 'Max recommended: 5 MB'].map((tip, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-full ${isDark ? 'bg-zinc-700' : 'bg-slate-300'}`} />
                  <span className={`text-xs ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`card-foresight p-10 min-h-[500px] flex flex-col`}>
          {result ? (
            <div className="space-y-12 animate-in fade-in duration-700">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-600 heading-font">Forensic Verdict</h3>
                <div className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                  result.prediction === 'Deepfake' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]' 
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
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Confidence Spectrum</p>
                    <p className="text-5xl font-black tracking-tighter heading-font">{result.confidence}%</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-[10px] font-mono mb-1 ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>Inference Mean</p>
                    <p className="text-sm font-bold font-mono tracking-tight text-blue-500/70">{result.inferenceTime}ms</p>
                  </div>
                </div>
                <div className={`h-2.5 w-full rounded-full overflow-hidden ${isDark ? 'bg-zinc-950' : 'bg-slate-100'}`}>
                  <div
                    className={`h-full transition-all duration-[1500ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${
                      result.prediction === 'Deepfake' ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]' 
                      : result.prediction === 'Suspicious' ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]'
                      : result.prediction === 'Uncertain' ? 'bg-zinc-500'
                      : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                    }`}
                    style={{ width: `${result.confidence}%` }}
                  />
                </div>
              </div>

              <div className="space-y-6 pt-10 border-t border-zinc-900/10">
                <h4 className="text-xs font-bold uppercase tracking-widest heading-font">Forensic Analysis</h4>

                {/* Summary / Explanation */}
                <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50/50 border-slate-100'}`}>
                  <p className={`text-sm leading-relaxed font-light ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    {result.structured_explanation?.summary
                      || result.explanation?.trim()
                      || `The ${selectedModel} Architecture identifies ${result.prediction === 'Fake'
                          ? 'anomalous local variations in facial textures and pixel-level artifacts consistent with generative models'
                          : 'statistically significant biological patterns and consistent lighting transitions across the detected face mesh'}.`
                    }
                  </p>
                </div>

                {/* Region Badges — shows which face areas were examined */}
                {result.structured_explanation?.regions_examined && result.structured_explanation.regions_examined.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-[9px] font-bold uppercase tracking-widest self-center ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>Regions:</span>
                    {result.structured_explanation.regions_examined.map((region, idx) => (
                      <span
                        key={idx}
                        className={`px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${
                          isDark
                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                            : 'bg-blue-50 border-blue-200 text-blue-600'
                        }`}
                      >
                        {region.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                )}

                {/* Primary Findings — high severity, bold */}
                {result.structured_explanation?.primary_findings && result.structured_explanation.primary_findings.length > 0 && (
                  <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50/50 border-slate-100'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500/50 mb-3">Primary Findings</p>
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
                  {/* Secondary Signals — lower severity, muted */}
                  <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50/50 border-slate-100'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500/50 mb-3">
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
                  <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50/50 border-slate-100'}`}>
                    {result.structured_explanation?.confidence_explanation ? (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500/50 mb-3">Confidence Notes</p>
                        <p className={`text-xs leading-snug mb-4 ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                          {result.structured_explanation.confidence_explanation}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500/50 mb-2">Model Consensus</p>
                        <p className="text-xs italic leading-snug opacity-70">
                          {result.structured_explanation.model_consensus || result.model_consensus?.trim() || (selectedModel === ModelType.ViT ? 'Global feature correlation analysis verified via forensic protocol.' : 'Shifted window patch hierarchy verified via forensic protocol.')}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500/50 mb-3">Model Consensus</p>
                        <p className="text-xs italic leading-snug opacity-70">{result.model_consensus?.trim() || (selectedModel === ModelType.ViT ? 'Global feature correlation analysis verified via forensic protocol.' : 'Shifted window patch hierarchy verified via forensic protocol.')}</p>
                      </>
                    )}
                  </div>
                </div>
              </div>


            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center opacity-20">
              <BeakerIcon className="w-16 h-16 mb-6" />
              <p className="text-[10px] font-bold uppercase tracking-[0.4em] heading-font">Awaiting biometric input</p>
            </div>
          )}
        </div>
      </div>

      {/* Per-face breakdown — full width below both columns */}
      {result?.faces && result.faces.length > 0 && (
        <div className={`rounded-2xl border p-8 ${isDark ? 'bg-zinc-900/10 border-zinc-900' : 'bg-slate-50/50 border-slate-100'}`}>
          <FaceBreakdownPanel faces={result.faces} isDark={isDark} prediction={result.prediction} />
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
              className={`relative w-full max-w-5xl aspect-video rounded-[2rem] overflow-hidden border shadow-2xl ${isDark ? 'bg-black border-white/10' : 'bg-white border-slate-200'}`}
            >
              <img src={zoomedImage.url} className="w-full h-full object-cover" alt="Magnified Heatmap" />
              
              {/* Overlay Content */}
              <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-white heading-font">{zoomedImage.model} Forensic Map</h3>
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
  );
};

export default Product;
