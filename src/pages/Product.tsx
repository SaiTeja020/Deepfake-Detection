import React, { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { motion, AnimatePresence, useSpring } from 'framer-motion';
import { ModelType, DetectionResult, FaceResult } from '../types';
import { detectDeepfake, detectDeepfakeVideo } from '../services/api';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  CloudArrowUpIcon,
  FilmIcon,
  BeakerIcon,
  EyeIcon,
  XMarkIcon,
  PhotoIcon,
  UserIcon,
  CpuChipIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowDownIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';
import { auth } from '../firebase';
import { saveScanHistory, uploadScanMedia } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../components/ui/hover-card';
import VideoPipeline from './ThreePipeline';

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
  Deepfake: { border: 'border-rose-500/30', bg: 'bg-rose-500/10', text: 'text-rose-400', dot: 'bg-rose-500' },
  Fake: { border: 'border-rose-500/30', bg: 'bg-rose-500/10', text: 'text-rose-400', dot: 'bg-rose-500' },
  Suspicious: { border: 'border-yellow-500/30', bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-500' },
  Uncertain: { border: 'border-slate-500/30', bg: 'bg-slate-500/10', text: 'text-slate-400', dot: 'bg-slate-500' },
  Real: { border: 'border-emerald-500/30', bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-500' },
};

const FaceBreakdownPanel: React.FC<{ faces: FaceResult[]; prediction: string }> = ({ faces, prediction }) => {
  if (!faces || faces.length === 0) return null;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest heading-font">Per-Face Analysis</h4>
        <span className="dashboard-panel-title px-2 py-1 rounded-md border" style={{ marginBottom: 0 }}>
          {faces.length} face{faces.length !== 1 ? 's' : ''} detected
        </span>
      </div>
      <div className={`grid gap-4 ${faces.length === 1 ? 'grid-cols-1' : faces.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
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
                    className={`h-full rounded-full transition-all duration-[1200ms] ease-out ${face.face_verdict === 'Deepfake' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
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
                  <p className={`text-xs font-black font-mono ${eyePct > 20 ? 'text-rose-400' : eyePct > 10 ? 'text-amber-400' : 'text-slate-700 dark:text-zinc-300'
                    }`}>{eyePct}%</p>
                </div>
                <div className="text-center">
                  <p className="dashboard-panel-title">Geo Score</p>
                  <p className={`text-xs font-black font-mono ${face.geom_score > 0.4 ? 'text-rose-400' : face.geom_score > 0.2 ? 'text-amber-400' : 'text-slate-700 dark:text-zinc-300'
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
let lastKnownMouseX = 0;
let lastKnownMouseY = 0;

if (typeof window !== 'undefined') {
  const updateLastKnownMouse = (e: MouseEvent) => {
    lastKnownMouseX = e.clientX;
    lastKnownMouseY = e.clientY;
  };
  window.addEventListener('mousemove', updateLastKnownMouse);
}

const ImagePipeline: React.FC<{ theme: 'dark' | 'light'; selectedModel: ModelType }> = ({ theme, selectedModel }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;
    const isDark = theme === 'dark';

    const modelStr = String(selectedModel || 'vit').toLowerCase();
    const isViT = modelStr.includes('vit');

    // Scene & Camera init
    const tempV = new THREE.Vector3();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(1.65, 3.5, 17.5);
    camera.lookAt(1.65, 0, 0);

    // Renderer construction
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isDark ? 1.2 : 0.95;
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    // Dynamic Star Field - Disabled in light mode for pristine visual clarity
    if (isDark) {
      const starGeo = new THREE.BufferGeometry();
      const starCount = 2000;
      const starPos = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i++) {
        starPos[i] = (Math.random() - 0.5) * 180;
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.08,
        transparent: true,
        opacity: 0.6,
      });
      scene.add(new THREE.Points(starGeo, starMat));
    }

    // Adaptive Lighting - Optimized for balanced contrast in light mode
    scene.add(new THREE.AmbientLight(isDark ? 0x0a0a1a : 0xdde3ea, isDark ? 2.2 : 0.85));
    const dirLight = new THREE.DirectionalLight(isDark ? 0x475569 : 0xffffff, isDark ? 1.6 : 1.3);
    dirLight.position.set(10, 20, 10);
    scene.add(dirLight);

    function addGlow(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity = 2.5, dist = 5) {
      const light = new THREE.PointLight(color, intensity, dist);
      light.position.set(x, y, z);
      scene.add(light);
      return light;
    }

    const nodeInfoMap = new Map();
    const interactiveMeshes: THREE.Object3D[] = [];

    // High-tech Sci-Fi Node Factory
    function createSciFiNode(x: number, y: number, z: number, color: THREE.ColorRepresentation, label: string, size = 1.8) {
      const group = new THREE.Group();
      group.position.set(x, y, z);

      // 1. Central Frosted Glass Cylinder Base
      const coreGeo = new THREE.CylinderGeometry(size * 0.5, size * 0.55, 0.25, 6, 1);
      const coreMat = new THREE.MeshPhysicalMaterial({
        color: isDark ? 0x070d19 : color,
        emissive: color,
        emissiveIntensity: isDark ? 0.15 : 0.18,
        metalness: isDark ? 0.25 : 0.05,
        roughness: isDark ? 0.15 : 0.05,
        transmission: isDark ? 0.9 : 0.88,
        thickness: 1.2,
        transparent: true,
        opacity: isDark ? 0.88 : 0.85,
        envMapIntensity: 2.0,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.rotation.x = Math.PI / 2; // Orient flat towards camera
      group.add(coreMesh);

      // 2. Outer Holographic Peripheral Halo Ring
      const ringGeo = new THREE.RingGeometry(size * 0.68, size * 0.72, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isDark ? 0.42 : 0.48,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      group.add(ringMesh);

      // 3. Tech Corner Bracket Crosshairs
      const bracketLen = size * 0.22;
      const offset = size * 0.62;
      const bracketsGroup = new THREE.Group();
      const bracketPositions = [
        [-offset, offset], [offset, offset], [-offset, -offset], [offset, -offset]
      ];
      bracketPositions.forEach(([bx, by]) => {
        const bGroup = new THREE.Group();
        bGroup.position.set(bx, by, 0);

        const xDir = bx > 0 ? -1 : 1;
        const yDir = by > 0 ? -1 : 1;

        const hGeo = new THREE.BoxGeometry(bracketLen, 0.035, 0.035);
        const vGeo = new THREE.BoxGeometry(0.035, bracketLen, 0.035);
        const bracketLinesMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: isDark ? 0.95 : 0.75 });

        const hMesh = new THREE.Mesh(hGeo, bracketLinesMat);
        hMesh.position.set(xDir * bracketLen / 2, 0, 0);
        const vMesh = new THREE.Mesh(vGeo, bracketLinesMat);
        vMesh.position.set(0, yDir * bracketLen / 2, 0);

        bGroup.add(hMesh, vMesh);
        bracketsGroup.add(bGroup);
      });
      group.add(bracketsGroup);

      // 4. Subtle Conical Projection / Ambient Uplight Beam
      const beamGeo = new THREE.CylinderGeometry(size * 0.35, size * 0.58, 0.5, 16, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isDark ? 0.07 : 0.03,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.rotation.x = Math.PI / 2;
      beamMesh.position.z = -0.25;
      group.add(beamMesh);

      // 5. Dedicated Invisible Hover Collider Sphere
      // Highly forgiving hitbox for seamless raycasting from any camera angle/zoom
      const hoverColliderGeo = new THREE.SphereGeometry(size * 0.9, 16, 16);
      const hoverColliderMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const hoverCollider = new THREE.Mesh(hoverColliderGeo, hoverColliderMat);
      hoverCollider.name = 'hoverCollider';
      group.add(hoverCollider);

      interactiveMeshes.push(coreMesh);
      interactiveMeshes.push(hoverCollider);

      // Floating Glow point
      const gl = addGlow(x, y, z + 0.35, color, isDark ? 2.8 : 1.8, 5);
      scene.add(group);

      // State storage for animated loops
      (group as any).userData = {
        baseY: y,
        ring: ringMesh,
        brackets: bracketsGroup,
        customAnimators: [],
        size: size,
      };

      return { group, mesh: coreMesh, mat: coreMat, light: gl };
    }

    // Glass connector piping tubes
    function createTube(points: THREE.Vector3[], color: THREE.ColorRepresentation) {
      const curve = new THREE.CatmullRomCurve3(points);
      const geo = new THREE.TubeGeometry(curve, 45, 0.032, 8, false);
      const mat = new THREE.MeshPhysicalMaterial({
        color: isDark ? 0x081222 : 0xcbd5e1,
        emissive: color,
        emissiveIntensity: isDark ? 0.22 : 0.35,
        transmission: 0.9,
        thickness: 0.1,
        roughness: 0.1,
        transparent: true,
        opacity: isDark ? 0.5 : 0.75,
      });
      const tube = new THREE.Mesh(geo, mat);
      scene.add(tube);
      return { tube, curve, mat };
    }

    // Process energy packet orb
    function createPulse(color: THREE.ColorRepresentation) {
      const geo = new THREE.SphereGeometry(isDark ? 0.08 : 0.11, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1.0 });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh);
      return mesh;
    }

    // Theme Compliant Node Core Palettes
    const COL = {
      orange: isDark ? 0xff6a00 : 0xe05600,
      green: isDark ? 0x00ff88 : 0x00a854,
      cyan: isDark ? 0x00e5ff : 0x0088cc,
      purple: isDark ? 0xaa00ff : 0x7b2cbf,
      glass: isDark ? 0x88ffee : 0x008080,
    };

    // 1. Input Image: Structured Blueprint Frame wireframes
    function injectInputBlueprint(node: any, color: number) {
      const parent = node.group;
      const frameGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.8, 0.8, 0.15));
      const frameMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: isDark ? 0.85 : 0.9 });
      const frameWire = new THREE.LineSegments(frameGeo, frameMat);
      frameWire.position.z = 0.2;
      parent.add(frameWire);

      const crossGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.35, -0.35, 0.2), new THREE.Vector3(0.35, 0.35, 0.2),
        new THREE.Vector3(-0.35, 0.35, 0.2), new THREE.Vector3(0.35, -0.35, 0.2)
      ]);
      const cross = new THREE.LineSegments(crossGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: isDark ? 0.35 : 0.45 }));
      parent.add(cross);

      parent.userData.customAnimators.push((t: number) => {
        frameWire.rotation.z = Math.sin(t * 0.4) * 0.12;
      });
    }

    // 2. Faces Detection: Holographic Low-Poly Biometric Wireframe Mesh
    function injectFaceMesh(node: any, color: number) {
      const parent = node.group;
      const headGroup = new THREE.Group();
      headGroup.position.z = 0.22;
      headGroup.scale.setScalar(0.72);

      const geom = new THREE.OctahedronGeometry(0.55, 1);
      const wireGeo = new THREE.EdgesGeometry(geom);
      const wireMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: isDark ? 0.8 : 0.9 });
      const headWire = new THREE.LineSegments(wireGeo, wireMat);
      headGroup.add(headWire);

      const pointsMat = new THREE.PointsMaterial({ color: isDark ? 0xffffff : color, size: isDark ? 0.045 : 0.06 });
      const headPoints = new THREE.Points(geom, pointsMat);
      headGroup.add(headPoints);

      parent.add(headGroup);
      parent.userData.customAnimators.push((t: number) => {
        headGroup.rotation.y = t * 0.7;
        headGroup.position.y = Math.sin(t * 1.8) * 0.04;
      });
    }

    // 3. Frequency Analysis: Fourier Spectral Waves & Concentric rings
    function injectFrequencyRings(node: any, color: number) {
      const parent = node.group;
      const wavesGroup = new THREE.Group();
      wavesGroup.position.z = 0.12;

      const ring1 = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.21, 16), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: isDark ? 0.8 : 0.85 }));
      const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.35, 16), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: isDark ? 0.5 : 0.6 }));
      const ring3 = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.48, 16), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: isDark ? 0.2 : 0.35 }));

      wavesGroup.add(ring1, ring2, ring3);
      parent.add(wavesGroup);

      parent.userData.customAnimators.push((t: number) => {
        const s1 = 0.85 + Math.sin(t * 3.2) * 0.15;
        const s2 = 1.0 + Math.cos(t * 2.8) * 0.12;
        ring1.scale.setScalar(s1);
        ring2.scale.setScalar(s2);
        wavesGroup.rotation.z = -t * 0.45;
      });
    }

    // 4. Foresight Classification: Multi-Layered Rotating Core Node
    function injectAICore(node: any, color: number) {
      const parent = node.group;
      const coreGroup = new THREE.Group();
      coreGroup.position.z = 0.22;

      const innerBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.28, 0.28),
        new THREE.MeshStandardMaterial({
          color,
          metalness: isDark ? 0.8 : 0.4,
          roughness: 0.15,
          emissive: color,
          emissiveIntensity: isDark ? 0.25 : 0.35
        })
      );
      const outerCageGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.48, 0.48, 0.48));
      const outerCage = new THREE.LineSegments(outerCageGeo, new THREE.LineBasicMaterial({ color: isDark ? 0xffffff : color, transparent: true, opacity: isDark ? 0.7 : 0.8 }));

      coreGroup.add(innerBox, outerCage);
      parent.add(coreGroup);

      parent.userData.customAnimators.push((t: number) => {
        innerBox.rotation.x = t * 1.4;
        innerBox.rotation.y = -t * 1.1;
        outerCage.rotation.y = -t * 0.5;
        outerCage.rotation.z = t * 0.75;
      });
    }

    // 5. Explainable AI: Volumetric Bounding Cage and heat element
    function injectHeatmapCage(node: any, color: number) {
      const parent = node.group;
      const cageGroup = new THREE.Group();
      cageGroup.position.z = 0.18;

      const cageGeo = new THREE.EdgesGeometry(new THREE.CylinderGeometry(0.42, 0.42, 0.55, 4, 1));
      const cage = new THREE.LineSegments(cageGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: isDark ? 0.75 : 0.85 }));
      cage.rotation.x = Math.PI / 2;
      cage.rotation.y = Math.PI / 4; // Pivot to form diamond look
      cageGroup.add(cage);

      const coreNode = new THREE.Mesh(
        new THREE.SphereGeometry(isDark ? 0.12 : 0.15, 8, 8),
        new THREE.MeshBasicMaterial({ color: isDark ? 0xffffff : color, transparent: true, opacity: 0.95 })
      );
      cageGroup.add(coreNode);

      parent.add(cageGroup);
      parent.userData.customAnimators.push((t: number) => {
        cageGroup.rotation.z = t * 0.35;
        coreNode.position.z = Math.sin(t * 3.8) * 0.12;
      });
    }

    // Instantiating structural nodes
    const nInput = createSciFiNode(-6.5, 0, 0, COL.orange, 'Input Image', 1.8);
    const nFace = createSciFiNode(-1.8, 0, 0, COL.green, 'Faces Detection', 1.9);
    const nCyan = createSciFiNode(3.8, 1.6, 0, COL.cyan, 'Frequency Analysis', 1.8);
    const nPurp = createSciFiNode(3.8, -1.6, 0, COL.purple, 'Foresight Classification', 1.8);
    const nOut = createSciFiNode(9.8, 0, 0, COL.glass, 'Explainable AI & Heatmap', 2.0);

    // Apply unique holographic interior details
    injectInputBlueprint(nInput, COL.orange);
    injectFaceMesh(nFace, COL.green);
    injectFrequencyRings(nCyan, COL.cyan);
    injectAICore(nPurp, COL.purple);
    injectHeatmapCage(nOut, COL.glass);

    // Register nodes for hover interaction
    nodeInfoMap.set(nInput.group, {
      nodeMat: nInput.mat,
      accentHex: '#ff6a00',
      info: {
        label: 'Input Image',
        description: 'Upload an image for deepfake forensic analysis. The image is validated, normalized and prepared for downstream facial analysis.',
        stats: [
          { key: 'Formats', val: 'JPG, JPEG, PNG, WEBP' },
          { key: 'Max Size', val: '5 MB' },
          { key: 'Preprocess', val: 'Resize + Normalize' },
          { key: 'Input Type', val: 'Single Image' },
          { key: 'Status', val: '● Ready' },
        ],
      },
    });
    nodeInfoMap.set(nFace.group, {
      nodeMat: nFace.mat,
      accentHex: '#00ff88',
      info: {
        label: 'Faces Detection',
        description: 'MTCNN detects every face present in the image while MediaPipe Face Mesh generates a dense landmark map for geometric and regional analysis.',
        stats: [
          { key: 'Detector', val: 'MTCNN' },
          { key: 'Mesh', val: 'MediaPipe Face Mesh' },
          { key: 'Output', val: 'Face Crops + Landmarks' },
          { key: 'Support', val: 'Multiple Faces' },
          { key: 'Status', val: '● Active' },
        ],
      },
    });
    nodeInfoMap.set(nCyan.group, {
      nodeMat: nCyan.mat,
      accentHex: '#00e5ff',
      info: {
        label: 'Frequency Analysis',
        description: 'Transforms facial imagery into the frequency domain to identify GAN fingerprints, synthetic generation artifacts and hidden spectral inconsistencies.',
        stats: [
          { key: 'Domain', val: 'Frequency Space' },
          { key: 'Detects', val: 'GAN Artifacts' },
          { key: 'Method', val: 'Spectral Analysis' },
          { key: 'Purpose', val: 'Forgery Detection' },
          { key: 'Status', val: '● Running' },
        ],
      },
    });
    nodeInfoMap.set(nPurp.group, {
      nodeMat: nPurp.mat,
      accentHex: '#aa00ff',
      info: {
        label: 'Foresight Classification',
        description: selectedModel === ModelType.ViT
          ? 'The Foresight ensemble utilizes the Vision Transformer (ViT) backbone combined with CNN forensic layers to classify each detected face.'
          : 'The Foresight pipeline utilizes the high-capacity Swin Transformer backbone to perform fine-grained patch-level face classification.',
        stats: [
          { key: 'Models', val: selectedModel === ModelType.ViT ? 'ViT + CNN' : 'Swin' },
          { key: 'Analysis', val: 'Spatial Features' },
          { key: 'Output', val: 'Confidence Score' },
          { key: 'Decision', val: 'Real / Fake' },
          { key: 'Status', val: '● Running' },
        ],
      },
    });
    nodeInfoMap.set(nOut.group, {
      nodeMat: nOut.mat,
      accentHex: '#88ffee',
      info: {
        label: 'Explainable AI & Heatmap',
        description: 'Classification evidence is converted into visual explanations showing the facial regions and artifacts that influenced the final deepfake decision.',
        stats: [
          { key: 'Technique', val: 'Attention Rollout' },
          { key: 'Output', val: 'Visual Heatmap' },
          { key: 'Explanation', val: 'Model Evidence' },
          { key: 'Result', val: 'Real / Fake' },
          { key: 'Status', val: '● Complete' },
        ],
      },
    });

    // Connector piping pipelines setup
    const tube1 = createTube([new THREE.Vector3(-4.9, 0, 0), new THREE.Vector3(-3.5, 0, 0)], COL.orange);
    const tubeForkTop = createTube([new THREE.Vector3(-0.1, 0, 0), new THREE.Vector3(0.8, 0.8, 0), new THREE.Vector3(1.6, 1.6, 0), new THREE.Vector3(2.2, 1.6, 0)], COL.cyan);
    const tubeForkBot = createTube([new THREE.Vector3(-0.1, 0, 0), new THREE.Vector3(0.8, -0.8, 0), new THREE.Vector3(1.6, -1.6, 0), new THREE.Vector3(2.2, -1.6, 0)], COL.purple);
    const tubeMergeTop = createTube([new THREE.Vector3(5.4, 1.6, 0), new THREE.Vector3(6.6, 1.6, 0), new THREE.Vector3(7.4, 0.8, 0), new THREE.Vector3(8.1, 0, 0)], COL.cyan);
    const tubeMergeBot = createTube([new THREE.Vector3(5.4, -1.6, 0), new THREE.Vector3(6.6, -1.6, 0), new THREE.Vector3(7.4, -0.8, 0), new THREE.Vector3(8.1, 0, 0)], COL.purple);

    // Particle pulses configurations
    const pulses = [
      { pulse: createPulse(COL.orange), curve: tube1.curve, t: 0, speed: 0.004 },
      { pulse: createPulse(COL.cyan), curve: tubeForkTop.curve, t: 0.3, speed: 0.005 },
      { pulse: createPulse(COL.purple), curve: tubeForkBot.curve, t: 0.6, speed: 0.005 },
      { pulse: createPulse(COL.cyan), curve: tubeMergeTop.curve, t: 0.1, speed: 0.005 },
      { pulse: createPulse(COL.purple), curve: tubeMergeBot.curve, t: 0.7, speed: 0.005 },
    ];

    // High fidelity Canvas-rendered Text Labels Sprite Engine
    function makeLabel(text: string, color = '#ffffff', fontSize = 28) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = `800 ${fontSize}px "Inter", "Segoe UI", sans-serif`;
        ctx.fillStyle = isDark ? color : '#1e293b';
        ctx.textAlign = 'center';
        if (isDark) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 14;
        } else {
          ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;
        }
        ctx.fillText(text, 256, 58);
      }
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.set(3.6, 0.7, 1);
      return sprite;
    }

    function addLabel(text: string, x: number, y: number, z: number, colorHex: number) {
      const hex = '#' + colorHex.toString(16).padStart(6, '0');
      const spr = makeLabel(text, hex);
      spr.position.set(x, y, z);
      scene.add(spr);
    }

    addLabel('Input Image', -6.5, -1.3, 0, COL.orange);
    addLabel('Faces Detection', -1.8, -1.3, 0, COL.green);
    addLabel('Frequency Analysis', 3.8, 3.0, 0, COL.cyan);
    addLabel('Foresight Classification', 3.8, -3.0, 0, COL.purple);
    addLabel('Explainable AI & Heatmap', 9.8, -1.6, 0, COL.glass);

    // Theme Compliant Grid floor
    const gridColor1 = isDark ? 0x2563eb : 0x3b82f6;
    const gridColor2 = isDark ? 0x0a1525 : 0xe2e8f0;
    const gridOpacity = isDark ? 0.35 : 0.4;
    const gridHelper = new THREE.GridHelper(60, 60, gridColor1, gridColor2);
    gridHelper.position.y = -3.5;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = gridOpacity;
    scene.add(gridHelper);

    // Fogging implementation
    scene.fog = new THREE.FogExp2(isDark ? 0x09090b : 0xf8fafc, 0.018);

    // Orbit Controls definitions
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 6;
    controls.maxDistance = 60;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.target.set(1.65, 0, 0);
    controls.update();

    // Floating responsive HTML Tooltip UI with high-fidelity fade & scale transitions
    const tooltip = document.createElement('div');
    tooltip.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 999;
      display: block;
      opacity: 0;
      transform: scale(0.95);
      max-width: 280px;
      border-radius: 1rem;
      padding: 16px 20px;
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      font-family: "Inter", system-ui, -apple-system, sans-serif;
      transition: opacity 0.15s ease, transform 0.15s ease;
      border: 1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)'};
      background: ${isDark ? 'rgba(24, 24, 27, 0.75)' : 'rgba(255, 255, 255, 0.85)'};
      box-shadow: ${isDark ? '0 12px 40px 0 rgba(0, 0, 0, 0.6), inset 0 1px 0 0 rgba(255, 255, 255, 0.05)' : '0 12px 24px rgba(0, 0, 0, 0.04), inset 0 1px 0 0 rgba(255, 255, 255, 0.8)'};
    `;
    document.body.appendChild(tooltip);

    function buildTooltip(info: any, accentHex: string) {
      const textColor = isDark ? '#ffffff' : '#0f172a';
      const descColor = isDark ? '#a1a1aa' : '#475569';
      const keyColor = isDark ? '#71717a' : '#64748b';

      tooltip.style.borderColor = accentHex + '55';
      tooltip.style.boxShadow = isDark
        ? `0 12px 40px 0 rgba(0, 0, 0, 0.6), 0 0 15px ${accentHex}33, inset 0 1px 0 0 rgba(255, 255, 255, 0.05)`
        : `0 12px 24px rgba(0, 0, 0, 0.05), 0 0 15px ${accentHex}22, inset 0 1px 0 0 rgba(255, 255, 255, 0.8)`;

      tooltip.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:10px;height:10px;border-radius:50%;background:${accentHex};box-shadow:0 0 8px ${accentHex};flex-shrink:0;"></div>
          <span style="font-size:13px;font-weight:700;color:${textColor};letter-spacing:0.04em;font-family:'Outfit', sans-serif;">${info.label}</span>
        </div>
        <div style="font-size:11.5px;color:${descColor};line-height:1.6;margin-bottom:10px;font-family:'Inter', sans-serif;">${info.description}</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${info.stats.map((s: any) => `
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-size:10.5px;color:${keyColor};font-family:'Inter', sans-serif;">${s.key}</span>
              <span style="font-size:10.5px;font-weight:600;color:${accentHex};font-variant-numeric:tabular-nums;font-family:'JetBrains Mono', monospace;">${s.val}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    let mouseX = lastKnownMouseX;
    let mouseY = lastKnownMouseY;
    let hoveredNode: any = null;

    // Stable hover state manager with flicker grace period/debounce configurations
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    // Game loop / Animation setup
    let time = 0;
    let animId: number;

    function animate() {
      animId = requestAnimationFrame(animate);
      time += 0.012;

      controls.update();

      const rect = container.getBoundingClientRect();
      mouse.x = ((lastKnownMouseX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((lastKnownMouseY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(interactiveMeshes, true);

      let foundGroup: any = null;
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj) {
          if (nodeInfoMap.has(obj)) {
            foundGroup = obj;
            break;
          }
          obj = obj.parent;
        }
      }

      // Handle transitions of the actual visible hoveredNode
      if (foundGroup !== hoveredNode) {
        if (foundGroup) {
          hoveredNode = foundGroup;
          const { info, accentHex } = nodeInfoMap.get(hoveredNode);
          buildTooltip(info, accentHex);
          tooltip.style.opacity = '1';
          tooltip.style.transform = 'scale(1)';
          renderer.domElement.style.cursor = 'pointer';
        } else {
          hoveredNode = null;
          tooltip.style.opacity = '0';
          tooltip.style.transform = 'scale(0.95)';
          renderer.domElement.style.cursor = 'grab';
        }
      }

      // Track tooltip placement offsets (positioning relative to hovered 3D node world position)
      if (hoveredNode) {
        hoveredNode.getWorldPosition(tempV);
        tempV.project(camera);

        const rect = container.getBoundingClientRect();
        let tx = rect.left + (tempV.x * 0.5 + 0.5) * rect.width + 30; // 30px offset to the right
        let ty = rect.top + (-tempV.y * 0.5 + 0.5) * rect.height - 40; // 40px offset upwards

        // Prevent tooltip from clipping outside the screen
        const tooltipWidth = 280;
        const tooltipHeight = 220;
        if (tx + tooltipWidth > window.innerWidth) {
          tx = rect.left + (tempV.x * 0.5 + 0.5) * rect.width - tooltipWidth - 30; // offset to the left instead
        }
        if (ty + tooltipHeight > window.innerHeight) {
          ty = window.innerHeight - tooltipHeight - 20;
        }
        if (ty < 0) {
          ty = 20;
        }

        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
      }

      // Energy packets propulsion updates
      pulses.forEach(p => {
        p.t = (p.t + p.speed) % 1;
        const pos = p.curve.getPoint(p.t);
        p.pulse.position.copy(pos);
        (p.pulse.material as any).opacity = 0.7 + Math.sin(time * 8 + p.t * 10) * 0.3;
        const s = 0.9 + Math.sin(time * 6) * 0.2;
        p.pulse.scale.setScalar(s);
      });

      // Node emission triggers and floating kinetics updates
      [
        { node: nInput, base: 0.12 },
        { node: nFace, base: 0.14 },
        { node: nCyan, base: 0.13 },
        { node: nPurp, base: 0.13 },
        { node: nOut, base: 0.18 },
      ].forEach(({ node, base }, i) => {
        const isHovered = node.group === hoveredNode;

        // Fluctuating brightness intensities
        (node.mat as any).emissiveIntensity = isHovered
          ? 0.58 + Math.sin(time * 4.2) * 0.14
          : base + Math.sin(time * 1.8 + i * 1.3) * 0.07;

        (node.light as any).intensity = isHovered
          ? (isDark ? 4.8 : 3.4)
          : (isDark ? 2.5 : 1.5) + Math.sin(time * 2 + i) * 0.6;

        node.group.scale.lerp(
          isHovered ? new THREE.Vector3(1.15, 1.15, 1.15) : new THREE.Vector3(1, 1, 1),
          0.1
        );

        // Core base floating kinetic waves
        const baseY = node.group.userData.baseY;
        node.group.position.y = baseY + Math.sin(time * 1.5 + i * 1.2) * 0.05;

        // Outer Ring spins
        if (node.group.userData.ring) {
          node.group.userData.ring.rotation.z = time * (0.28 + (i * 0.08));
          node.group.userData.ring.scale.setScalar(isHovered ? 1.08 : 1.0);
        }

        // Pulse corner tracking cross brackets on hover
        if (node.group.userData.brackets) {
          const bScale = isHovered ? 1.12 + Math.sin(time * 6) * 0.04 : 1.0;
          node.group.userData.brackets.scale.setScalar(bScale);
        }

        // Internal customized 3D elements rotations
        node.group.userData.customAnimators.forEach((anim: (t: number) => void) => anim(time));
      });

      // Piping emissive properties pulses
      [tube1, tubeForkTop, tubeForkBot, tubeMergeTop, tubeMergeBot].forEach((t, i) => {
        (t.mat as any).emissiveIntensity = (isDark ? 0.22 : 0.08) + Math.sin(time * 2.5 + i * 0.7) * 0.12;
      });

      renderer.render(scene, camera);
    }

    animate();

    const handleResize = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 550;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    renderer.domElement.style.cursor = 'grab';
    const handleMouseDown = () => { renderer.domElement.style.cursor = 'grabbing'; };
    const handleMouseUp = () => { renderer.domElement.style.cursor = 'grab'; };
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mouseup', handleMouseUp);

    // Memory garbage disposal
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('mousedown', handleMouseDown);
      renderer.domElement.removeEventListener('mouseup', handleMouseUp);
      if (tooltip && tooltip.parentNode) {
        tooltip.parentNode.removeChild(tooltip);
      }
      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      scene.traverse((object: any) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((mat: any) => mat.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
      renderer.dispose();
    };
  }, [theme, selectedModel]);

  return (
    <div className="card-foresight relative w-full h-[550px] overflow-hidden rounded-2xl border border-zinc-900/10 dark:border-zinc-800/40 bg-white/5 dark:bg-black/5">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

const Product: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
  const isDark = theme === 'dark';
  const [analysisMode, setAnalysisMode] = useState<'image' | 'video'>('image');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoPreviewFailed, setVideoPreviewFailed] = useState(false);
  const [processedVideoFailed, setProcessedVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [selectedModel, setSelectedModel] = useState<ModelType>(ModelType.ViT);
  const [image, setImage] = useState<string | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  // Accordion and expansion states for result layout
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false);
  const [isEvidenceExpanded, setIsEvidenceExpanded] = useState(false);

  const { profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Diagnostic useEffect to log theme state in Product.tsx
  useEffect(() => {
    const html = document.documentElement;
    console.log('[Product Theme Diagnostic]', {
      themeProp: theme,
      htmlClassList: html.className,
      htmlDataTheme: html.getAttribute('data-theme'),
      isSystemDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
      hasDarkClass: html.classList.contains('dark')
    });
  }, [theme]);

  const MAX_IMAGE_SIZE_MB = 5;
  const MAX_VIDEO_SIZE_MB = 50;

  const handleReset = (immediate = false) => {
    if (isDetecting) return;

    const reset = () => {
      setImage(null);
      setRawFile(null);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
      setVideoPreviewFailed(false);
      setProcessedVideoFailed(false);
      setResult(null);
      setFileInfo(null);
      setShowHeatmap(false);
      setError(null);
      setIsRemoving(false);
      setIsSummaryExpanded(false);
      setIsExplanationExpanded(false);
      setIsEvidenceExpanded(false);
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

  const processSelectedFile = (file: File) => {
    setError(null);
    setVideoPreviewFailed(false);

    const fileSizeMB = file.size / (1024 * 1024);

    // Image size limit
    if (
      analysisMode === "image" &&
      fileSizeMB > MAX_IMAGE_SIZE_MB
    ) {
      setError(
        `Selected image is ${fileSizeMB.toFixed(
          2
        )} MB. Maximum allowed size is ${MAX_IMAGE_SIZE_MB} MB.`
      );
      return;
    }

    // Video size limit
    if (
      analysisMode === "video" &&
      fileSizeMB > MAX_VIDEO_SIZE_MB
    ) {
      setError(
        `Selected video is ${fileSizeMB.toFixed(
          2
        )} MB. Maximum allowed size is ${MAX_VIDEO_SIZE_MB} MB.`
      );
      return;
    }

    const fileSize = fileSizeMB.toFixed(2) + " MB";

    if (analysisMode === "image") {
      if (!file.type.startsWith("image/")) {
        setError("Invalid file format. Please upload a clear face image.");
        setImage(null);
        setRawFile(null);
        setResult(null);
        setFileInfo(null);
        return;
      }

      const reader = new FileReader();

      reader.onloadend = () => {
        setImage(reader.result as string);
        setRawFile(file);
        setFileInfo({
          name: file.name,
          size: fileSize,
        });
        setResult(null);
        setShowHeatmap(false);
      };

      reader.readAsDataURL(file);
    } else {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const validVideoExtensions = ['mp4', 'avi', 'mov', 'webm', 'mkv', '3gp', 'ogg'];
      const isValidVideo = file.type.startsWith("video/") || (fileExt && validVideoExtensions.includes(fileExt));

      if (!isValidVideo) {
        setError("Invalid file format. Please upload a valid video.");
        setVideoUrl(null);
        setRawFile(null);
        setResult(null);
        setFileInfo(null);
        return;
      }

      const url = URL.createObjectURL(file);
      const tempVideo = document.createElement("video");
      tempVideo.preload = "metadata";
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        if (tempVideo.duration > 180) {
          setError("Video duration exceeds the maximum limit of 3 minutes (180 seconds).");
          setVideoUrl(null);
          setRawFile(null);
          setResult(null);
          setFileInfo(null);
          URL.revokeObjectURL(url);
          return;
        }
        setVideoUrl(url);
        setRawFile(file);
        setFileInfo({
          name: file.name,
          size: fileSize,
        });
        setResult(null);
        setShowHeatmap(false);
        // Reset preview-failed flag — metadata loaded fine so browser CAN play this
        setVideoPreviewFailed(false);
      };
      tempVideo.onerror = () => {
        // Browser can't decode/preview this file, but it can still be uploaded and scanned.
        // Mark as preview-failed so the UI shows the "ready to scan" card instead of a broken player.
        console.warn("Browser cannot preview this video (codec/container not supported). File is still valid for server-side scanning.");
        setError(null);
        setVideoUrl(url);
        setRawFile(file);
        setFileInfo({
          name: file.name,
          size: fileSize,
        });
        setResult(null);
        setShowHeatmap(false);
        setVideoPreviewFailed(true);
      };
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processSelectedFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isDetecting) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processSelectedFile(file);
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
    setIsSummaryExpanded(false);
    setIsExplanationExpanded(false);
    setIsEvidenceExpanded(false);
    try {
      let detectionResult: DetectionResult;
      let originalUrl = '';
      let heatmapUrl = '';

      if (analysisMode === 'video') {
        if (!rawFile) throw new Error("No video file selected");
        detectionResult = await detectDeepfakeVideo(auth.currentUser?.uid || 'guest', rawFile);
        originalUrl = detectionResult.keyframeUrl || '';
        heatmapUrl = detectionResult.attentionMapUrl || '';
      } else {
        if (!image) throw new Error("No image data extracted");
        detectionResult = await detectDeepfake(auth.currentUser?.uid || 'guest', image, selectedModel);
        originalUrl = image;
        heatmapUrl = detectionResult.attentionMapUrl || '';
      }

      setResult(detectionResult);
      if (analysisMode === 'video') {
        setVideoPreviewFailed(false);
        setProcessedVideoFailed(false);
        setShowHeatmap(true);
      }

      if (auth.currentUser && profile?.save_history !== false) {
        if (analysisMode === 'image') {
          const uploadRes = await uploadScanMedia(
            auth.currentUser.uid,
            image,
            detectionResult.attentionMapUrl
          );
          originalUrl = uploadRes.original_url || image;
          heatmapUrl = uploadRes.heatmap_url || detectionResult.attentionMapUrl;
        }

        await saveScanHistory({
          firebase_uid: auth.currentUser.uid,
          file_name: fileInfo.name,
          original_media_url: originalUrl,
          heatmap_url: heatmapUrl,
          result: detectionResult.prediction,
          confidence: detectionResult.confidence,
          model_used: analysisMode === 'video' ? 'Temporal-Swin' : selectedModel,
          explanation: detectionResult.explanation || `Analysis using ${analysisMode === 'video' ? 'Temporal-Swin' : selectedModel} protocol.`
        });
      }
    } catch (err) {
      console.error(err);
      setError("Model analysis failed. Please try again.");
    } finally {
      setIsDetecting(false);
    }
  };

  const renderVerdictPanel = (resultData: DetectionResult) => {
    const confidencePct = resultData.confidence > 1
      ? parseFloat(resultData.confidence.toFixed(2))
      : parseFloat((resultData.confidence * 100).toFixed(2));

    return (
      <div className="space-y-4">
        {/* Header: Verdict & Model badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500/70 block">Forensic Protocol</span>
            <h3 className="text-sm font-bold uppercase heading-font flex items-center gap-2">
              <BeakerIcon className="w-4 h-4 text-blue-500" />
              {analysisMode === 'video'
                ? 'Neural Video Scan'
                : selectedModel === ModelType.ViT
                  ? 'ViT Architecture (Global)'
                  : 'Swin Protocol (Hierarchical)'}
            </h3>
          </div>
          <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest self-start sm:self-center border ${resultData.prediction === 'Fake' || resultData.prediction === 'Deepfake'
            ? 'bg-rose-500/10 text-rose-500 border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
            : resultData.prediction === 'Suspicious'
              ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 shadow-[0_0_15px_rgba(234,179,8,0.1)]'
              : resultData.prediction === 'Uncertain'
                ? 'bg-slate-500/10 text-slate-400 border-slate-500/20 shadow-[0_0_15px_rgba(100,116,139,0.1)]'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
            }`}>
            {resultData.prediction} IDENTIFIED
          </div>
        </div>

        {/* Confidence & Speed Grid */}
        <div className="grid grid-cols-2 gap-4 p-4 rounded-xl dashboard-insight-box border border-zinc-900/5 dark:border-zinc-800/40">
          <div>
            <p className="dashboard-panel-title">Confidence Spectrum</p>
            <p className={`text-3xl font-black tracking-tight heading-font ${resultData.prediction === 'Fake' || resultData.prediction === 'Deepfake'
              ? 'text-rose-500'
              : resultData.prediction === 'Suspicious'
                ? 'text-yellow-500'
                : resultData.prediction === 'Uncertain'
                  ? 'text-slate-400'
                  : 'text-emerald-500'
              }`}>{confidencePct}%</p>
          </div>
          <div className="border-l border-zinc-900/10 dark:border-zinc-800/40 pl-4">
            <p className="dashboard-panel-title">Inference Speed</p>
            <p className="text-3xl font-black tracking-tight heading-font text-blue-500/80 font-mono">{resultData.inferenceTime}ms</p>
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest opacity-60">
            <span>Biometric Spectrum</span>
            <span>{confidencePct > 50 ? (resultData.prediction === 'Fake' ? 'High Manipulation Risk' : 'High Integrity') : 'Low Confidence Scan'}</span>
          </div>
          <div className={`h-2.5 w-full rounded-full overflow-hidden ${isDark ? 'bg-zinc-950' : 'bg-slate-100'}`}>
            <div
              className={`h-full transition-all duration-[1500ms] ease-[cubic-bezier(0.23,1,0.32,1)] ${resultData.prediction === 'Fake' || resultData.prediction === 'Deepfake'
                ? 'bg-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.4)]'
                : resultData.prediction === 'Suspicious'
                  ? 'bg-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.4)]'
                  : resultData.prediction === 'Uncertain'
                    ? 'bg-slate-500 shadow-[0_0_15px_rgba(100,116,139,0.4)]'
                    : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]'
                }`}
              style={{ width: `${confidencePct}%` }}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderSummaryPanel = (resultData: DetectionResult) => {
    const summaryText = resultData.structured_explanation?.summary
      || resultData.explanation?.trim()
      || `The ${analysisMode === 'video' ? 'Neural Video Scan' : `${selectedModel} Architecture`} identifies ${resultData.prediction === 'Fake'
        ? 'anomalous local variations in facial textures and pixel-level artifacts consistent with generative models'
        : 'statistically significant biological patterns and consistent lighting transitions across the detected face mesh'}.`;

    const shouldTruncateSummary = summaryText.length > 240;
    const displayedSummary = (shouldTruncateSummary && !isSummaryExpanded)
      ? `${summaryText.slice(0, 240)}...`
      : summaryText;

    return (
      <div className="space-y-2">
        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-500/70 block">Key Findings Summary</h4>
        <div className="dashboard-panel p-5 rounded-xl border border-zinc-900/5 dark:border-zinc-800/40">
          <p className="dashboard-title-desc leading-relaxed text-xs">
            {displayedSummary}
          </p>
          {shouldTruncateSummary && (
            <button
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              className="mt-2.5 text-[10px] font-bold uppercase tracking-wider text-blue-500 hover:text-blue-600 transition-colors flex items-center gap-1"
            >
              {isSummaryExpanded ? 'Read Less' : 'Read More'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderTechnicalExplanation = (resultData: DetectionResult) => {
    const showAcc = !!(resultData.structured_explanation?.confidence_explanation || resultData.model_consensus || resultData.structured_explanation?.model_consensus);
    if (!showAcc) return null;

    return (
      <div className="border border-zinc-900/10 dark:border-zinc-800/60 rounded-xl overflow-hidden dashboard-panel">
        <button
          onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
          className="w-full flex items-center justify-between p-4 font-bold text-[10px] uppercase tracking-wider text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
        >
          <span className="flex items-center gap-2 heading-font font-bold">
            <CpuChipIcon className="w-4 h-4 text-blue-500" />
            Technical Explanation
          </span>
          {isExplanationExpanded ? (
            <ChevronUpIcon className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-zinc-400" />
          )}
        </button>

        <AnimatePresence initial={false}>
          {isExplanationExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="border-t border-zinc-900/10 dark:border-zinc-800/60 p-4 space-y-4 text-xs"
            >
              {resultData.structured_explanation?.confidence_explanation && (
                <div>
                  <p className="dashboard-panel-title opacity-50 mb-1.5">Confidence Notes</p>
                  <p className="dashboard-title-desc leading-relaxed">
                    {resultData.structured_explanation.confidence_explanation}
                  </p>
                </div>
              )}

              <div>
                <p className="dashboard-panel-title opacity-50 mb-1.5">
                  {analysisMode === 'video' ? 'Video Analysis Consensus' : 'Model Consensus'}
                </p>
                <p className="text-xs italic leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {analysisMode === 'video'
                    ? 'Temporal frame extraction analyzed via deep neural forensics.'
                    : (resultData.structured_explanation?.model_consensus
                      || resultData.model_consensus?.trim()
                      || (selectedModel === ModelType.ViT
                        ? 'Global feature correlation analysis verified via forensic protocol.'
                        : 'Shifted window patch hierarchy verified via forensic protocol.'))}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderSupportingEvidence = (resultData: DetectionResult) => {
    const hasRegions = !!(resultData.structured_explanation?.regions_examined && resultData.structured_explanation.regions_examined.length > 0);
    const hasFindings = !!(resultData.structured_explanation?.primary_findings && resultData.structured_explanation.primary_findings.length > 0);
    const hasSignals = !!((resultData.structured_explanation?.secondary_signals && resultData.structured_explanation.secondary_signals.length > 0) || (resultData.suspicious_domains && resultData.suspicious_domains.length > 0));

    if (!hasRegions && !hasFindings && !hasSignals) return null;

    return (
      <div className="border border-zinc-900/10 dark:border-zinc-800/60 rounded-xl overflow-hidden dashboard-panel">
        <button
          onClick={() => setIsEvidenceExpanded(!isEvidenceExpanded)}
          className="w-full flex items-center justify-between p-4 font-bold text-[10px] uppercase tracking-wider text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
        >
          <span className="flex items-center gap-2 heading-font font-bold">
            <ShieldCheckIcon className="w-4 h-4 text-blue-500" />
            Supporting Evidence
          </span>
          {isEvidenceExpanded ? (
            <ChevronUpIcon className="w-4 h-4 text-zinc-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-zinc-400" />
          )}
        </button>

        <AnimatePresence initial={false}>
          {isEvidenceExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="border-t border-zinc-900/10 dark:border-zinc-800/60 p-4 space-y-4 text-xs"
            >
              {/* Region Badges */}
              {hasRegions && (
                <div className="space-y-2">
                  <p className="dashboard-panel-title opacity-50">Regions Examined</p>
                  <div className="flex flex-wrap gap-1.5">
                    {resultData.structured_explanation!.regions_examined.map((region, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider border ${isDark
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                          : 'bg-blue-50 border-blue-100 text-blue-600'
                          }`}
                      >
                        {region.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Primary Findings */}
              {hasFindings && (
                <div className="space-y-2">
                  <p className="dashboard-panel-title opacity-50">Primary Findings</p>
                  <ul className="space-y-2 font-medium">
                    {resultData.structured_explanation!.primary_findings.map((finding, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${resultData.prediction === 'Fake' || resultData.prediction === 'Deepfake'
                          ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.4)]'
                          : resultData.prediction === 'Suspicious'
                            ? 'bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.4)]'
                            : resultData.prediction === 'Uncertain'
                              ? 'bg-slate-500 shadow-[0_0_6px_rgba(100,116,139,0.4)]'
                              : 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]'
                          }`} />
                        <span className={isDark ? 'text-zinc-300' : 'text-slate-700'}>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Secondary Signals / Domains */}
              {hasSignals && (
                <div className="space-y-2">
                  <p className="dashboard-panel-title opacity-50">
                    {resultData.structured_explanation ? 'Secondary Signals' : 'Suspicious Domains'}
                  </p>
                  <ul className="space-y-1.5 font-medium grid grid-cols-2 gap-x-4">
                    {(resultData.structured_explanation?.secondary_signals && resultData.structured_explanation.secondary_signals.length > 0
                      ? resultData.structured_explanation.secondary_signals
                      : resultData.suspicious_domains && resultData.suspicious_domains.length > 0
                        ? resultData.suspicious_domains
                        : resultData.prediction === 'Fake'
                          ? ['Periorbital margin', 'Mandibular texture']
                          : ['Natural eye geometry', 'Consistent skin tone']
                    ).map((item, idx) => (
                      <li key={idx} className="flex items-center space-x-2">
                        <div className={`w-1 h-1 rounded-full opacity-60 ${resultData.prediction === 'Fake' || resultData.prediction === 'Deepfake'
                          ? 'bg-rose-500'
                          : resultData.prediction === 'Suspicious'
                            ? 'bg-yellow-500'
                            : resultData.prediction === 'Uncertain'
                              ? 'bg-slate-500'
                              : 'bg-emerald-500'
                          }`} />
                        <span className="opacity-80">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
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
            <div className="product-selector-container">
              <button
                onClick={() => handleModeChange('image')}
                className={`product-selector-btn ${analysisMode === 'image' ? 'active' : ''}`}
              >
                Image
              </button>
              <button
                onClick={() => handleModeChange('video')}
                className={`product-selector-btn ${analysisMode === 'video' ? 'active' : ''}`}
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

        <div className={analysisMode === 'video' ? 'space-y-8 max-w-5xl mx-auto w-full' : 'grid lg:grid-cols-2 gap-12 items-stretch'}>
          <div className="space-y-8">
            <div className="relative group">
              <div
                onClick={() => {
                  if (analysisMode === 'image' && !image) fileInputRef.current?.click();
                  else if (analysisMode === 'video' && !videoUrl) fileInputRef.current?.click();
                }}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`relative overflow-hidden ${analysisMode === 'video' ? 'aspect-video' : 'aspect-square'} dashboard-upload-box ${isRemoving ? 'fade-out' : ''
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
                      className={`absolute top-0 left-0 h-[2px] ${result.prediction === 'Fake'
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
                      className={`absolute top-0 right-0 w-[2px] ${result.prediction === 'Fake'
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
                      className={`absolute bottom-0 right-0 h-[2px] ${result.prediction === 'Fake'
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
                      className={`absolute bottom-0 left-0 w-[2px] ${result.prediction === 'Fake'
                        ? 'bg-rose-500'
                        : 'bg-emerald-500'
                        }`}
                      style={{ transformOrigin: 'bottom' }}
                    />
                  </motion.div>
                )}
                {analysisMode === 'image' && image ? (
                  <div className="relative w-full h-full">
                    <HoverCard openDelay={200} closeDelay={200}>
                      <HoverCardTrigger asChild>
                        <div
                          className={`relative w-full h-full ${showHeatmap && result?.attentionMapUrl ? 'cursor-zoom-in group/zoomer' : ''}`}
                        >
                          <img
                            src={showHeatmap && result ? result.attentionMapUrl : image}
                            className={`w-full h-full object-cover transition-opacity duration-500 ${isDetecting ? 'opacity-50' : 'opacity-100'}`}
                            alt="Face Preview"
                          />
                          {showHeatmap && result && (
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/zoomer:opacity-100 transition-opacity bg-black/20">
                              <div className="p-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-xl">
                                <EyeIcon className="w-8 h-8" />
                              </div>
                            </div>
                          )}
                        </div>
                      </HoverCardTrigger>
                      {showHeatmap && result?.attentionMapUrl && (
                        <HoverCardContent side="right" align="center" sideOffset={24} className="w-[500px] p-0 overflow-hidden bg-black border-zinc-800">
                          <div className="relative rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                            <img src={result.attentionMapUrl} className="w-full aspect-square object-cover" alt="Magnified Heatmap" />
                            <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                              <h3 className="text-xl font-bold text-white heading-font">{selectedModel} Forensic Map</h3>
                              <p className="text-zinc-400 text-sm mt-1">Full-resolution neural attention analysis.</p>
                            </div>
                          </div>
                        </HoverCardContent>
                      )}
                    </HoverCard>

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
                    {videoPreviewFailed && !(showHeatmap && result) ? (
                      <div className="flex flex-col items-center justify-center w-full h-full p-8 bg-zinc-900 border border-zinc-800 rounded-[inherit] space-y-4 text-center">
                        <div className="w-16 h-16 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                          <FilmIcon className="w-8 h-8" />
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-sm font-bold text-slate-100 uppercase tracking-wider">Ready to Scan</p>
                          <p className="text-xs text-zinc-400 max-w-[280px]">{fileInfo?.name ?? 'Video file'} selected. In-browser preview is not available for this format, but the file will be analysed normally.</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70 mt-1">Click "Start Analysis" to begin</p>
                        </div>
                      </div>
                    ) : (
                      // Processed video result or original video preview
                      showHeatmap && result && processedVideoFailed ? (
                        // Processed video failed to load — fall back to keyframe image
                        <div className="relative w-full h-full flex items-center justify-center bg-zinc-950">
                          {result.keyframeUrl ? (
                            <img
                              src={result.keyframeUrl}
                              alt="Video keyframe"
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-3 text-zinc-400">
                              <FilmIcon className="w-10 h-10" />
                              <p className="text-xs font-bold uppercase tracking-wider">Processed video unavailable — keyframe not found</p>
                            </div>
                          )}
                          <div className="absolute bottom-0 inset-x-0 px-4 py-2 bg-black/60 backdrop-blur-sm text-[10px] text-zinc-400 font-medium">
                            Video playback unavailable in this browser. Showing best keyframe instead.
                          </div>
                        </div>
                      ) : (
                        <video
                          key={showHeatmap && result ? 'processed' : 'original'}
                          ref={videoRef}
                          src={showHeatmap && result ? result.attentionMapUrl : videoUrl}
                          onError={() => {
                            if (showHeatmap && result) {
                              // Processed video (Supabase URL) failed — show keyframe fallback
                              setProcessedVideoFailed(true);
                            } else {
                              // Original local blob video failed — show ready-to-scan card
                              setVideoPreviewFailed(true);
                            }
                          }}
                          controls
                          controlsList="nodownload nofullscreen"
                          className={`w-full h-full object-cover transition-opacity duration-500 ${isDetecting ? 'opacity-50' : 'opacity-100'}`}
                        />
                      )
                    )}
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
                    {result && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextState = !showHeatmap;
                          setShowHeatmap(nextState);
                          if (nextState) {
                            // Switching to processed view — reset original-video fallback
                            setVideoPreviewFailed(false);
                          } else {
                            // Switching to original video — reset processed-video fallback so
                            // it retries when user goes back to the overlay view
                            setProcessedVideoFailed(false);
                          }
                        }}
                        className="absolute bottom-4 right-4 px-4 py-2 bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white hover:bg-zinc-900 transition-all z-20 flex items-center space-x-2"
                      >
                        <EyeIcon className="w-4 h-4" />
                        <span>
                          {showHeatmap
                            ? 'View Original Video'
                            : (processedVideoFailed ? 'View Keyframe' : 'View Overlay Video')}
                        </span>
                      </button>
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

          {(analysisMode === 'image' || result) && (
            <div className={`relative card-foresight p-8 md:p-10 min-h-[420px] flex flex-col ${analysisMode === 'video' ? 'w-full' : ''}`}
            >
              {result ? (
                <div className="space-y-6 animate-in fade-in duration-700">
                  {analysisMode === 'video' ? (
                    <div className="space-y-6">
                      {renderVerdictPanel(result)}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {renderVerdictPanel(result)}
                      {renderSummaryPanel(result)}
                      {renderTechnicalExplanation(result)}
                      {renderSupportingEvidence(result)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-20 py-12">
                  <BeakerIcon className="w-16 h-16 mb-6" />
                  <p className="text-[10px] font-bold uppercase tracking-[0.4em] heading-font">Awaiting biometric input</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Per-face breakdown */}
        {analysisMode === 'image' && result?.faces && result.faces.length > 0 && (
          <div className="dashboard-panel p-8">
            <FaceBreakdownPanel faces={result.faces} prediction={result.prediction} />
          </div>
        )}

        {/* How Does Our Detection Work? Section */}
        <div className="space-y-6 pt-12 border-t border-zinc-900/10 dark:border-zinc-800/40 animate-in fade-in duration-500">
          <div className="text-center space-y-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-500/70">Detection Pipeline</span>
            <h3 className="text-2xl font-black tracking-tight heading-font">How Does Our Detection Work?</h3>
            <p className="text-xs dashboard-title-desc max-w-2xl mx-auto leading-relaxed">
              Foresight utilizes a multi-layered biometrics analysis pipeline. We evaluate pixel integrity, spectral noise, and geometry transitions in real-time.
            </p>
          </div>

          <div className="pt-4">
            {analysisMode === 'image' ? (
              <ImagePipeline theme={theme} selectedModel={selectedModel} />
            ) : (
              <VideoPipeline theme={theme} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default Product;
