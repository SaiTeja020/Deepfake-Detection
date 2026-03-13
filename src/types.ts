
export enum ModelType {
  ViT = 'ViT',
  Swin = 'Swin Transformer'
}

export interface DetectionResult {
  prediction: 'Real' | 'Fake';
  confidence: number;
  inferenceTime: number;
  attentionMapUrl: string;
  explanation?: string;
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
