
export enum ModelType {
  ViT = 'ViT',
  Swin = 'Swin Transformer'
}

export interface FaceResult {
  face_id: number;
  face_verdict: 'Deepfake' | 'Suspicious' | 'Real';
  box: [number, number, number, number];
  cnn_label: string;
  cnn_conf: number;
  geom_score: number;
  fused_score: number;
  geometry: {
    eye_asymmetry: number;
    lip_distance: number;
  };
}

export interface DetectionResult {
  prediction: 'Real' | 'Fake' | 'Suspicious';
  confidence: number;
  inferenceTime: number;
  attentionMapUrl: string;
  explanation?: string;
  suspicious_domains?: string[];
  model_consensus?: string;
  // Pipeline-extended fields
  final_label?: 'Real' | 'Deepfake' | 'Suspicious' | 'NoFaces';
  faces?: FaceResult[];
  face_count?: number;
  no_faces_detected?: boolean;
}


export interface ModelMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  size: string;
  speed: string;
  robustness: string;
}

export interface UserProfile {
  name: string;
  email: string;
  role: string;
  theme: 'dark' | 'light';
  defaultModel: ModelType;
  notifications: boolean;
  bio?: string;
}
