import React, { useState, useRef } from 'react';
import { ModelType, DetectionResult } from '../types';
import { detectDeepfake } from '../services/api';
import { auth } from '../firebase';
import {
  CloudArrowUpIcon,
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  SparklesIcon,
  EyeIcon,
  UserCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const Compare: React.FC<{ theme?: 'dark' | 'light' }> = ({ theme = 'dark' }) => {
  const isDark = theme === 'dark';
  const [image, setImage] = useState<string | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [vitResult, setVitResult] = useState<DetectionResult | null>(null);
  const [swinResult, setSwinResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    if (isDetecting) return;
    setIsRemoving(true);
    setTimeout(() => {
      setImage(null);
      setVitResult(null);
      setSwinResult(null);
      setFileInfo(null);
      setError(null);
      setIsRemoving(false);
    }, 300);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert("Please upload a portrait image.");
        return;
      }
      const reader = new FileReader();
      const fileSize = (file.size / (1024 * 1024)).toFixed(2) + " MB";
      reader.onloadend = () => {
        setImage(reader.result as string);
        setFileInfo({ name: file.name, size: fileSize });
        setVitResult(null);
        setSwinResult(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const runInference = async () => {
    if (!image) return;
    setIsDetecting(true);
    setError(null);
    try {
      const uid = auth.currentUser?.uid || 'guest';
      
      // Run sequentially to prevent backend OOM / timeouts
      const vitRes = await detectDeepfake(uid, image, ModelType.ViT);
      setVitResult(vitRes);
      
      const swinRes = await detectDeepfake(uid, image, ModelType.Swin);
      setSwinResult(swinRes);
      
    } catch (err: any) {
      console.error("Inference Error:", err);
      setError(err?.response?.data?.error || err.message || "Model analysis failed. Please try again.");
    } finally {
      setIsDetecting(false);
    }
  };

  const ModelResult = ({ result, modelName, title }: { result: DetectionResult | null, modelName: string, title?: string }) => (
    <div className={`card-foresight p-8 transition-all ${!result ? 'opacity-40 grayscale blur-[1px]' : ''}`}>
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-600 heading-font">{modelName} Benchmarks</h3>
        {result && (
          <div className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${result.prediction === 'Fake' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
            {result.prediction}
          </div>
        )}
      </div>

      {result ? (
        <div className="space-y-8 animate-in fade-in duration-700">
          <div className="flex items-end justify-between">
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isDark ? 'text-zinc-500' : 'text-slate-400'}`}>Inference Score</p>
              <p className="text-4xl font-black heading-font">{result.confidence}%</p>
            </div>
            <p className={`text-[10px] font-mono font-bold text-blue-500/50 ${isDark ? 'text-zinc-600' : 'text-slate-400'}`}>{result.inferenceTime}ms</p>
          </div>

          <div className={`aspect-video rounded-2xl overflow-hidden border ${isDark ? 'bg-black border-zinc-900' : 'bg-slate-50 border-slate-100'}`}>
            <img src={result.attentionMapUrl} className="w-full h-full object-cover grayscale opacity-30 hover:grayscale-0 hover:opacity-100 transition-all duration-700" alt={`${modelName} Heatmap`} />
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500/50 heading-font">Forensic Signature</h4>
            <p className={`text-xs leading-relaxed font-light ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
              {modelName} identifies {result.prediction === 'Fake' ? 'anomalous patterns in focal regions' : 'natural biological consistency'} across the face mesh.
              {modelName === 'ViT' ? ' Captures wide-range dependencies.' : ' Analyzes hierarchical scales.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="aspect-video flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-2xl opacity-20">
          <SparklesIcon className="w-8 h-8 mb-4" />
          <p className="text-[10px] font-bold uppercase tracking-widest heading-font">Awaiting Analysis</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-12 fade-in">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-900/10 pb-8">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter heading-font">Model Comparison</h1>
          <p className={`text-sm font-light ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>Benchmark ViT vs Swin Transformer performance side-by-side.</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            disabled={!image || isDetecting}
            onClick={runInference}
            className={`btn-primary px-10 ${!image || isDetecting ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
          >
            {isDetecting ? 'Running Analysis...' : 'Run Benchmarks'}
          </button>
          {error && <p className="text-rose-500 text-xs font-medium">{error}</p>}
        </div>
      </header>

      <div className="max-w-4xl mx-auto space-y-12">
        <div className={`p-8 rounded-2xl border transition-all flex flex-col md:flex-row items-center gap-8 ${isDark ? 'bg-zinc-900/10 border-zinc-900' : 'bg-slate-50 border-slate-200'}`}>
          <div className="relative group shrink-0">
            <div
              onClick={() => !image && fileInputRef.current?.click()}
              className={`w-40 h-40 rounded-2xl border-2 border-dashed transition-all flex items-center justify-center cursor-pointer overflow-hidden relative ${isRemoving ? 'fade-out' : ''} ${isDark ? 'bg-zinc-950 border-zinc-800 hover:border-blue-500/30' : 'bg-white border-slate-200 shadow-sm hover:border-blue-600/30'}`}
            >
              {image ? (
                <div className="relative w-full h-full">
                  <img src={image} className="w-full h-full object-cover transition-all" alt="Face Source" />

                  {/* Close Icon */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReset(); }}
                    disabled={isDetecting}
                    title={isDetecting ? "Please wait until analysis completes." : "Remove image"}
                    className={`absolute top-2 right-2 w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-300 z-10 ${isDetecting ? 'opacity-30 cursor-not-allowed' : 'hover:scale-105'} ${isDark
                      ? 'bg-zinc-900/80 border-zinc-700 text-zinc-400 hover:bg-rose-500/20 hover:border-rose-500/40 hover:text-rose-500'
                      : 'bg-white/80 border-slate-200 text-slate-500 hover:bg-rose-50/50 hover:border-rose-500/40 hover:text-rose-500 shadow-sm'
                      }`}
                  >
                    <XMarkIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <CloudArrowUpIcon className="w-8 h-8 mx-auto text-zinc-700 group-hover:text-blue-500 transition-colors" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mt-2">Upload</p>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
            </div>

            {/* File Metadata */}
            {image && fileInfo && (
              <div className={`absolute -bottom-6 left-0 right-0 text-center animate-in fade-in duration-500 ${isRemoving ? 'fade-out' : ''}`}>
                <p className={`text-[10px] font-bold truncate px-2 ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
                  {fileInfo.name.length > 15 ? fileInfo.name.substring(0, 12) + "..." : fileInfo.name} • {fileInfo.size}
                </p>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-4 text-center md:text-left">
            <h3 className="text-xl font-bold">Dual-Inference Pipeline</h3>
            <p className={`text-sm leading-relaxed ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>
              Compare state-of-the-art transformer architectures. Global attention (ViT) vs Hierarchical Shifted Windows (Swin). Upload one image to run both models simultaneously.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <ModelResult title="Vision Transformer" modelName="ViT" result={vitResult} />
          <ModelResult title="Swin Transformer" modelName="Swin" result={swinResult} />
        </div>

        {vitResult && swinResult && (
          <div className={`p-8 rounded-2xl border ${isDark ? 'bg-blue-500/5 border-blue-500/10' : 'bg-blue-50/50 border-blue-100'}`}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-600 mb-8 text-center">Inference Consensus</h3>
            <div className="grid md:grid-cols-3 gap-12 text-center">
              <div className="space-y-1">
                <p className={`text-[10px] font-bold uppercase tracking-widest opacity-40 ${isDark ? 'text-white' : 'text-slate-900'}`}>Confidence Delta</p>
                <p className="text-3xl font-bold">{(Math.abs(vitResult.confidence - swinResult.confidence)).toFixed(1)}%</p>
              </div>
              <div className="space-y-1">
                <p className={`text-[10px] font-bold uppercase tracking-widest opacity-40 ${isDark ? 'text-white' : 'text-slate-900'}`}>Verdict</p>
                <p className={`text-3xl font-bold ${vitResult.prediction === swinResult.prediction ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {vitResult.prediction === swinResult.prediction ? 'Unanimous' : 'Split'}
                </p>
              </div>
              <div className="space-y-1">
                <p className={`text-[10px] font-bold uppercase tracking-widest opacity-40 ${isDark ? 'text-white' : 'text-slate-900'}`}>Insight</p>
                <p className="text-sm font-medium">
                  {vitResult.prediction === swinResult.prediction
                    ? 'High model consensus'
                    : 'Architectural disagreement'}
                </p>
              </div>
            </div>

            <div className="mt-10 space-y-6">
              <h4 className="text-sm font-bold border-b border-blue-500/10 pb-2">Model Insights</h4>
              <div className="grid md:grid-cols-2 gap-6 text-xs leading-relaxed">
                <div className={`p-4 rounded-xl ${isDark ? 'bg-zinc-950/50' : 'bg-white/50'}`}>
                  <p className="font-bold text-blue-600 mb-1">ViT Performance</p>
                  <p className={isDark ? 'text-zinc-400' : 'text-slate-600'}>
                    Excels at capturing global face structure. Better for detecting full-face swaps and holistic structural anomalies.
                  </p>
                </div>
                <div className={`p-4 rounded-xl ${isDark ? 'bg-zinc-950/50' : 'bg-white/50'}`}>
                  <p className="font-bold text-blue-600 mb-1">Swin Performance</p>
                  <p className={isDark ? 'text-zinc-400' : 'text-slate-600'}>
                    Superior for fine-grained texture analysis. Detects micro-jitter in skin pores and refined ocular edge blending issues.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Compare;