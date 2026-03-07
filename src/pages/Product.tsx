import React, { useState, useRef, useEffect } from 'react';
import { ModelType, DetectionResult } from '../types';
import { detectDeepfake } from '../services/geminiService';
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleReset = () => {
    if (isDetecting) return;
    setIsRemoving(true);
    setTimeout(() => {
      setImage(null);
      setResult(null);
      setFileInfo(null);
      setShowHeatmap(false);
      setError(null);
      setIsRemoving(false);
    }, 300);
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
      const detectionResult = await detectDeepfake(image, selectedModel);
      setResult(detectionResult);

      // Upload media to Supabase Storage before saving history
      if (auth.currentUser) {
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
          explanation: `Analysis using ${selectedModel} protocol.`
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
    <div className="space-y-12 fade-in">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-zinc-900/10 pb-8">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tighter heading-font">Facial Analysis</h1>
          <p className={`text-sm font-light ${isDark ? 'text-zinc-500' : 'text-slate-500'}`}>Verify biometric authenticity via transformer-based forensics.</p>
        </div>

        <div className={`flex p-1 rounded-2xl border ${isDark ? 'bg-zinc-950 border-zinc-900 shadow-inner' : 'bg-slate-100 border-slate-200'}`}>
          <button
            onClick={() => setSelectedModel(ModelType.ViT)}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${selectedModel === ModelType.ViT ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : (isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-slate-500 hover:text-slate-800')}`}
          >
            ViT Architecture
          </button>
          <button
            onClick={() => setSelectedModel(ModelType.Swin)}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${selectedModel === ModelType.Swin ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : (isDark ? 'text-zinc-600 hover:text-zinc-400' : 'text-slate-500 hover:text-slate-800')}`}
          >
            Swin Protocol
          </button>
        </div>
      </header>

      <div className="grid lg:grid-cols-2 gap-12 items-start">
        <div className="space-y-8">
          <div className="relative group">
            <div
              onClick={() => !image && fileInputRef.current?.click()}
              className={`aspect-square rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center cursor-pointer relative overflow-hidden ${isRemoving ? 'fade-out' : ''} ${isDark ? 'bg-zinc-900/20 border-zinc-800 hover:border-blue-500/50' : 'bg-slate-50 border-slate-200 hover:border-blue-600/50'} ${image ? 'border-solid border-blue-500/30' : ''}`}
            >
              {image ? (
                <div className="relative w-full h-full">
                  <img
                    src={showHeatmap && result ? result.attentionMapUrl : image}
                    className={`w-full h-full object-cover transition-opacity duration-500 ${isDetecting ? 'opacity-50' : 'opacity-100'}`}
                    alt="Face Preview"
                  />

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
            className={`w-full py-4 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${!image || isDetecting
              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed opacity-50'
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/20'
              }`}
          >
            Start Analysis
          </button>
          {error && <p className="text-rose-500 text-xs font-medium text-center">{error}</p>}
        </div>

        <div className={`card-foresight p-10 min-h-[500px] flex flex-col`}>
          {result ? (
            <div className="space-y-12 animate-in fade-in duration-700">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.3em] text-blue-600 heading-font">Forensic Verdict</h3>
                <div className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${result.prediction === 'Fake' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'}`}>
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
                    className={`h-full transition-all duration-[1500ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${result.prediction === 'Fake' ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]' : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]'}`}
                    style={{ width: `${result.confidence}%` }}
                  />
                </div>
              </div>

              <div className="space-y-6 pt-10 border-t border-zinc-900/10">
                <h4 className="text-xs font-bold uppercase tracking-widest heading-font">Biometric Reasoning</h4>
                <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50/50 border-slate-100'}`}>
                  <p className={`text-sm leading-relaxed font-light ${isDark ? 'text-zinc-400' : 'text-slate-600'}`}>
                    The <span className="font-bold text-blue-500">{selectedModel} Architecture</span> identifies {result.prediction === 'Fake' ? 'anomalous local variations in facial textures and pixel-level artifacts consistent with generative models' : 'statistically significant biological patterns and consistent lighting transitions across the detected face mesh'}.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50/50 border-slate-100'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500/50 mb-3">Suspicious Domains</p>
                    <ul className="text-xs space-y-2 font-medium">
                      <li className="flex items-center space-x-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${result.prediction === 'Fake' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <span>{result.prediction === 'Fake' ? 'Periorbital margin' : 'Natural eye geometry'}</span>
                      </li>
                      <li className="flex items-center space-x-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${result.prediction === 'Fake' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                        <span>{result.prediction === 'Fake' ? 'Mandibular texture' : 'Consistent skin tone'}</span>
                      </li>
                    </ul>
                  </div>
                  <div className={`p-6 rounded-2xl border ${isDark ? 'bg-zinc-950/40 border-zinc-800' : 'bg-slate-50/50 border-slate-100'}`}>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500/50 mb-3">Model Consensus</p>
                    <p className="text-xs italic leading-snug opacity-70">{selectedModel === ModelType.ViT ? 'Global feature correlation analysis' : 'Shifted window patch hierarchy'} verified via forensic protocol.</p>
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
    </div>
  );
};

export default Product;
