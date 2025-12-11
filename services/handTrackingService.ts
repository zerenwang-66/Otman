import pkg from '@mediapipe/hands';
import { HandGesture } from '../types';

// Robust extraction of the Hands class from the imported package
// Handles various ESM/CJS interop structures provided by CDNs
const Hands = (pkg as any)?.Hands || (pkg as any)?.default?.Hands || (window as any)?.Hands;

export class HandTrackingService {
  private hands: any;
  private videoElement: HTMLVideoElement;
  private animationFrameId: number | null = null;
  private stream: MediaStream | null = null;
  private isRunning: boolean = false;
  private lastProcessTime: number = 0;

  constructor(videoElement: HTMLVideoElement, onResults: (results: any) => void) {
    this.videoElement = videoElement;

    // Fail silently instead of crashing the app if MediaPipe didn't load
    if (!Hands) {
      console.warn("MediaPipe Hands not found. Hand tracking will be disabled.");
      return;
    }

    try {
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
    } catch (e) {
        console.warn("Failed to initialize MediaPipe instance:", e);
        this.hands = null;
    }
  }

  public async start() {
    if (this.isRunning || !this.hands) return; // Don't start if no hands instance
    this.isRunning = true;

    try {
      // Check if browser supports getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
         console.warn("Camera API not available (Non-secure context?)");
         return;
      }

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
          this.videoElement.play().then(() => resolve()).catch(e => console.warn("Play failed", e));
        };
      });

      this.processFrame();
    } catch (err) {
      console.warn("Error initializing camera (Hand tracking disabled):", err);
      // Do not re-throw, just stop running to keep the 3D scene alive
      this.isRunning = false;
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
    
    try {
        if (this.hands && typeof this.hands.close === 'function') {
            this.hands.close();
        }
    } catch(e) {
        // Ignore closure errors
    }
  }

  private processFrame = async () => {
    if (!this.isRunning || !this.hands) return;

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

  public static detectGesture(landmarks: any[]): HandGesture {
    if (!landmarks || landmarks.length === 0) return HandGesture.NONE;
    
    const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const wrist = landmarks[0];
    const isFingerFolded = (tipIdx: number, pipIdx: number) => {
        const dTip = dist(landmarks[tipIdx], wrist);
        const dPip = dist(landmarks[pipIdx], wrist);
        return dTip < dPip * 1.1; 
    };

    const isIndexFolded = isFingerFolded(8, 6);
    const isMiddleFolded = isFingerFolded(12, 10);
    const isRingFolded = isFingerFolded(16, 14);
    const isPinkyFolded = isFingerFolded(20, 18);

    if (!isIndexFolded && !isMiddleFolded && isRingFolded && isPinkyFolded) {
        return HandGesture.TWO_FINGERS;
    }

    let foldedCount = 0;
    if (isIndexFolded) foldedCount++;
    if (isMiddleFolded) foldedCount++;
    if (isRingFolded) foldedCount++;
    if (isPinkyFolded) foldedCount++;

    if (foldedCount >= 3) return HandGesture.FIST;
    if (foldedCount <= 1) return HandGesture.OPEN_PALM;

    return HandGesture.OPEN_PALM; 
  }
}