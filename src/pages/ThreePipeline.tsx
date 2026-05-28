import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
// RoundedBoxGeometry imported for potential future use
// import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

let lastKnownMouseX = 0;
let lastKnownMouseY = 0;

if (typeof window !== 'undefined') {
  const updateLastKnownMouse = (e: MouseEvent) => {
    lastKnownMouseX = e.clientX;
    lastKnownMouseY = e.clientY;
  };
  window.addEventListener('mousemove', updateLastKnownMouse);
}

const ThreePipeline: React.FC<{ theme: 'dark' | 'light' }> = ({ theme }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 550;
    const isDark = theme === 'dark';

    // Scene & Camera init
    const tempV = new THREE.Vector3();
    const interactiveMeshes: THREE.Object3D[] = [];
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(14, 10, 18);
    camera.lookAt(4, 0, 0);

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

    // ---------------------------------------------------------------------------
    // Advanced Structural Accent Injectors
    // ---------------------------------------------------------------------------

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
    const nInput = createSciFiNode(-10, 0, 0, COL.orange, 'Input Video', 1.8);
    const nFace = createSciFiNode(-6, 0, 0, COL.green, 'Face Detection', 1.9);
    const nFrames = createSciFiNode(-2, 0, 0, 0x00d4ff, 'Frame Grouping', 1.8);
    const nSpatial = createSciFiNode(2.5, 3.5, 0, COL.cyan, 'Spatial Branch', 1.8);
    const nFrequency = createSciFiNode(2.5, 0, 0, COL.purple, 'Frequency Branch', 1.8);
    const nTemporal = createSciFiNode(2.5, -3.5, 0, 0xff2e88, 'Temporal Branch', 1.8);
    const nFusion = createSciFiNode(7, 0, 0, 0x00ffaa, 'Feature Fusion', 1.9);
    const nVerdict = createSciFiNode(10.5, 0, 0, 0xffffff, 'Final Verdict', 2.0);

    // Apply unique holographic interior details
    injectInputBlueprint(nInput, COL.orange);
    injectFaceMesh(nFace, COL.green);
    injectFrequencyRings(nSpatial, COL.cyan);
    injectAICore(nFrequency, COL.purple);

    // Dynamic state parameters on hover
    nodeInfoMap.set(nInput.group, {
      nodeMat: nInput.mat,
      accentHex: '#ff6a00',
      info: {
        label: 'Input Video',
        description:'Accepts uploaded video files and prepares frame sequences for deepfake forensic analysis.',
        stats: [
          { key: 'Formats', val: 'MP4, AVI, MOV' },
          { key: 'Input', val: 'Video File' },
          { key: 'Frames', val: 'Extracted' },
          { key: 'Processing', val: 'Multi-frame' },
          { key: 'Status', val: '● Ready' },
        ],
      },
    });
    nodeInfoMap.set(nFace.group, {
      nodeMat: nFace.mat,
      accentHex: '#00ff88',
      info: {
        label: 'Face Detection',
        description:
          'Facial regions are detected and extracted from video frames to create aligned face sequences for downstream analysis.',
        stats: [
          { key: 'Input', val: 'Video Frames' },
          { key: 'Output', val: 'Face Sequences' },
          { key: 'Support', val: 'Multiple Faces' },
          { key: 'Purpose', val: 'Face Tracking' },
          { key: 'Status', val: '● Active' },
        ],
      },
    });
    nodeInfoMap.set(nFrames.group, {
      nodeMat: nFrames.mat,
      accentHex: '#00d4ff',
      info: {
        label: 'Frame Grouping',
        description:
          'Videos are divided into 16-frame sequences for temporal analysis and manipulation detection.',
        stats: [
          { key: 'Sequence', val: '16 Frames' },
          { key: 'Sampling', val: 'Uniform / Block' },
          { key: 'Purpose', val: 'Temporal Context' },
          { key: 'Output', val: 'Frame Windows' },
          { key: 'Status', val: '● Active' },
        ],
      },
    });
    nodeInfoMap.set(nSpatial.group, {
      nodeMat: nSpatial.mat,
      accentHex: '#00e5ff',
      info: {
        label: 'Spatial Analysis',
        description:
          'Swin Transformer analyzes facial appearance, texture consistency and visual manipulation artifacts.',
        stats: [
          { key: 'Backbone', val: 'Swin Transformer' },
          { key: 'Features', val: '1024-D' },
          { key: 'Focus', val: 'Visual Artifacts' },
          { key: 'Analysis', val: 'Spatial Domain' },
          { key: 'Status', val: '● Running' },
        ],
      },
    });
    nodeInfoMap.set(nTemporal.group, {
      nodeMat: nTemporal.mat,
      accentHex: '#ff2e88',
      info: {
        label: 'Temporal Analysis',
        description:
          'Temporal Transformer evaluates frame sequences to identify flickering, motion inconsistencies and temporal manipulation artifacts.',
        stats: [
          { key: 'Model', val: 'Temporal Transformer' },
          { key: 'Input', val: '16 Frames' },
          { key: 'Focus', val: 'Motion Consistency' },
          { key: 'Analysis', val: 'Temporal Domain' },
          { key: 'Status', val: '● Running' },
        ],
      },
    });
    nodeInfoMap.set(nFusion.group, {
      nodeMat: nFusion.mat,
      accentHex: '#00ffaa',
      info: {
        label: 'Feature Fusion',
        description:
          'Spatial, frequency and temporal representations are combined into a unified forensic embedding.',
        stats: [
          { key: 'Inputs', val: '3 Branches' },
          { key: 'Fusion', val: 'Concatenation' },
          { key: 'Output', val: 'Unified Vector' },
          { key: 'Purpose', val: 'Classification' },
          { key: 'Status', val: '● Running' },
        ],
      },
    });
    nodeInfoMap.set(nVerdict.group, {
      nodeMat: nVerdict.mat,
      accentHex: '#ffffff',
      info: {
        label: 'Final Verdict',
        description:
          'Evidence from all analysis branches is aggregated to generate the final authenticity prediction.',
        stats: [
          { key: 'Output', val: 'Real / Fake' },
          { key: 'Confidence', val: 'Probability Score' },
          { key: 'Evidence', val: 'Multi-Modal' },
          { key: 'Decision', val: 'Authenticity' },
          { key: 'Status', val: '● Complete' },
        ],
      },
    });
    nodeInfoMap.set(nFrequency.group, {
      nodeMat: nFrequency.mat,
      accentHex: '#aa00ff',
      info: {
        label: 'Frequency Analysis',
        description:
          'FFT transforms facial imagery into the frequency domain where synthetic generation artifacts become visible.',
        stats: [
          { key: 'Method', val: 'FFT + CNN' },
          { key: 'Features', val: '768-D' },
          { key: 'Detects', val: 'GAN Artifacts' },
          { key: 'Domain', val: 'Frequency Space' },
          { key: 'Status', val: '● Running' },
        ],
      },
    });

    // Connector piping pipelines setup
    const t1 = createTube([new THREE.Vector3(-8.4, 0, 0), new THREE.Vector3(-7.2, 0, 0)], COL.orange);
    const t2 = createTube([new THREE.Vector3(-4.4, 0, 0), new THREE.Vector3(-3.2, 0, 0)], COL.green);
    const tSpatial = createTube([new THREE.Vector3(-0.4, 0, 0), new THREE.Vector3(0.8, 1.2, 0), new THREE.Vector3(1.6, 2.4, 0)], COL.cyan);
    const tFreq = createTube([new THREE.Vector3(-0.4, 0, 0), new THREE.Vector3(1.6, 0, 0)], COL.purple);
    const tTemp = createTube([new THREE.Vector3(-0.4, 0, 0), new THREE.Vector3(0.8, -1.2, 0), new THREE.Vector3(1.6, -2.4, 0)], 0xff2e88);
    const tMergeSpatial = createTube([new THREE.Vector3(4.2, 2.4, 0), new THREE.Vector3(5.4, 1.4, 0), new THREE.Vector3(6.2, 0.5, 0)], COL.cyan);
    const tMergeFreq = createTube([new THREE.Vector3(4.2, 0, 0), new THREE.Vector3(6.2, 0, 0)], COL.purple);
    const tMergeTemp = createTube([new THREE.Vector3(4.2, -2.4, 0), new THREE.Vector3(5.4, -1.4, 0), new THREE.Vector3(6.2, -0.5, 0)], 0xff2e88);
    const tVerdict = createTube([new THREE.Vector3(8.8, 0, 0), new THREE.Vector3(9.6, 0, 0), new THREE.Vector3(10.2, 0, 0)], 0xffffff);

    // Particle pulses configurations
    const pulses = [
      { pulse: createPulse(COL.orange), curve: t1.curve, t: 0, speed: 0.004 },
      { pulse: createPulse(COL.cyan), curve: tSpatial.curve, t: 0.3, speed: 0.005 },
      { pulse: createPulse(COL.purple), curve: tFreq.curve, t: 0.6, speed: 0.005 },
      { pulse: createPulse(COL.cyan), curve: tMergeSpatial.curve, t: 0.1, speed: 0.005 },
      { pulse: createPulse(COL.purple), curve: tMergeFreq.curve, t: 0.7, speed: 0.005 },
      { pulse: createPulse(0xffffff), curve: tVerdict.curve, t: 0.4, speed: 0.005 },
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

    addLabel('Input Video', -10, -1.3, 0, COL.orange);
    addLabel('Face Detection', -6, -1.3, 0, COL.green);
    addLabel('Frame Grouping', -2, -1.3, 0, 0x00d4ff);
    addLabel('Spatial Branch', 2.5, 5.2, 0, COL.cyan);
    addLabel('Frequency Branch', 2.5, -1.6, 0, COL.purple);
    addLabel('Temporal Branch', 2.5, -5.8, 0, 0xff2e88);
    addLabel('Feature Fusion', 7, -1.3, 0, 0x00ffaa);
    addLabel('Final Verdict', 10.5, -1.5, 0, 0xffffff);

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
    controls.minDistance = 8;
    controls.maxDistance = 50;
    controls.target.set(3, 0.5, 0);
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

    let hoveredNode: any = null;

    // Interactive Raycaster definitions
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
        { node: nFrames, base: 0.13 },
        { node: nSpatial, base: 0.13 },
        { node: nFrequency, base: 0.13 },
        { node: nTemporal, base: 0.13 },
        { node: nFusion, base: 0.15 },
        { node: nVerdict, base: 0.18 },
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
      [t1, tSpatial, tFreq, tMergeSpatial, tMergeFreq, tVerdict].forEach((t, i) => {
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
  }, [theme]);

  return (
    <div className="card-foresight relative w-full h-[550px] overflow-hidden rounded-2xl border border-zinc-900/10 dark:border-zinc-800/40 bg-white/5 dark:bg-black/5">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};

export default ThreePipeline;
