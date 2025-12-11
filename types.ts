export enum AppState {
  TREE = 'TREE',       // Fist: Coalesce into a tree
  SCATTER = 'SCATTER', // Open Hand: Float around
  ZOOM = 'ZOOM'        // Two Fingers: Inspect a photo
}

export enum HandGesture {
  NONE = 'NONE',
  FIST = 'FIST',
  OPEN_PALM = 'OPEN_PALM',
  TWO_FINGERS = 'TWO_FINGERS' // Replaces PINCH (Victory sign / Peace sign)
}

export interface ParticleData {
  id: number;
  initialPos: [number, number, number];
  treePos: [number, number, number];
  scatterPos: [number, number, number];
  type: 'SPHERE' | 'CUBE' | 'CYLINDER' | 'PHOTO';
  color: string;
  scale: number;
  photoUrl?: string;
  rotationSpeed: [number, number, number];
}

export interface HandTrackingResult {
  gesture: HandGesture;
  position: { x: number; y: number }; // Normalized 0-1
  isPresent: boolean;
}