import pkg from '@mediapipe/hands';
import { HandGesture } from '../types';

// Robust extraction of the Hands class from the imported package
const Hands = (pkg as any).Hands || (pkg as any).default?.Hands || (window as any).Hands;

export class HandTrackingService {
  private hands: any;
  private videoElement: HTMLVideoElement;
  private animationFrameId: number | null = null;
  private stream: MediaStream | null = null;
  private isRunning: boolean = false;
  private lastProcessTime: number = 0;

  constructor(videoElement: HTMLVideoElement, onResults: (results: any) => void) {
    this.videoElement = videoElement;

    if (!Hands) {
      console.error("MediaPipe Hands not found.");
      throw new Error("Failed to load MediaPipe Hands class.");
    }

    this.hands = new Hands({
      locateFile: (file: string) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
      }
    });

    this.hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0, // Lite model for performance
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    this.hands.onResults(onResults);
  }

  public async start() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      this.videoElement.srcObject = this.stream;

      await new Promise<void>((resolve) => {
        this.videoElement.onloadedmetadata = () => {
          this.videoElement.play().then(() => resolve());
        };
      });

      this.processFrame();
    } catch (err) {
      console.error("Error initializing camera:", err);
      this.isRunning = false;
      throw err;
    }
  }

  public stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    // Clean up MediaPipe resources safely
    try {
        if (this.hands && typeof this.hands.close === 'function') {
            this.hands.close();
        }
    } catch(e) {
        // Ignore closure errors if instance is already dead
    }
  }

  private processFrame = async () => {
    if (!this.isRunning) return;

    // Throttle to ~30fps to save CPU/GPU cycles for Three.js
    const now = performance.now();
    if (now - this.lastProcessTime < 33) { 
      this.animationFrameId = requestAnimationFrame(this.processFrame);
      return;
    }

    if (this.videoElement.readyState >= 2) { 
      try {
        await this.hands.send({ image: this.videoElement });
        this.lastProcessTime = performance.now();
      } catch (e) {
        // Suppress ephemeral send errors
      }
    }

    if (this.isRunning) {
      this.animationFrameId = requestAnimationFrame(this.processFrame);
    }
  };

  /**
   * Improved Scale-Invariant Gesture Detection
   * Uses hand size normalization to work at different distances from camera.
   */
  public static detectGesture(landmarks: any[]): HandGesture {
    if (!landmarks || landmarks.length === 0) return HandGesture.NONE;
    
    // Helper: Calculate Euclidean distance
    const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

    // Helper: Check if a finger is folded
    // Compares distance from Tip to Wrist vs PIP (Knuckle) to Wrist
    const wrist = landmarks[0];
    const isFingerFolded = (tipIdx: number, pipIdx: number) => {
        const dTip = dist(landmarks[tipIdx], wrist);
        const dPip = dist(landmarks[pipIdx], wrist);
        // If tip is closer to wrist than the knuckle (PIP), it's definitely folded.
        return dTip < dPip * 1.1; 
    };

    // Check individual finger states
    // Index (8,6), Middle (12,10), Ring (16,14), Pinky (20,18)
    const isIndexFolded = isFingerFolded(8, 6);
    const isMiddleFolded = isFingerFolded(12, 10);
    const isRingFolded = isFingerFolded(16, 14);
    const isPinkyFolded = isFingerFolded(20, 18);

    // 1. TWO_FINGERS (Victory/Peace Sign) Detection
    // Criteria: Index and Middle are OPEN (not folded), Ring and Pinky are FOLDED.
    // We ignore thumb to allow for casual variation.
    if (!isIndexFolded && !isMiddleFolded && isRingFolded && isPinkyFolded) {
        return HandGesture.TWO_FINGERS;
    }

    // Count total folded fingers for general gestures
    let foldedCount = 0;
    if (isIndexFolded) foldedCount++;
    if (isMiddleFolded) foldedCount++;
    if (isRingFolded) foldedCount++;
    if (isPinkyFolded) foldedCount++;

    // 2. FIST Detection
    // Criteria: 3 or more fingers folded (excluding thumb).
    // This catches full fist or thumb-tucked fist.
    if (foldedCount >= 3) {
        return HandGesture.FIST;
    }
    
    // 3. OPEN PALM Detection
    // Criteria: 0 or 1 finger folded.
    if (foldedCount <= 1) {
        return HandGesture.OPEN_PALM;
    }

    // Default fallback (e.g., random hand positions)
    return HandGesture.OPEN_PALM; 
  }
}