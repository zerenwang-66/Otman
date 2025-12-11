import React, { useEffect, useRef, useState } from 'react';
import { HandTrackingService } from '../services/handTrackingService';
import { HandGesture, HandTrackingResult } from '../types';

interface Props {
  onUpdate: (result: HandTrackingResult) => void;
}

const HandController: React.FC<Props> = React.memo(({ onUpdate }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  
  // Refs for smoothing and debouncing
  // We use a ref to track mount status to avoid state updates after unmount
  const isMountedRef = useRef(true);
  const prevPositionRef = useRef({ x: 0.5, y: 0.5 });
  const gestureHistoryRef = useRef<HandGesture[]>([]);
  const lastEmittedGestureRef = useRef<HandGesture>(HandGesture.NONE);

  useEffect(() => {
    isMountedRef.current = true;
    let service: HandTrackingService | null = null;

    const startCamera = async () => {
      if (!videoRef.current) return;
      
      try {
        service = new HandTrackingService(videoRef.current, (results) => {
          if (!isMountedRef.current) return;

          let gesture = HandGesture.NONE;
          let rawX = 0.5;
          let rawY = 0.5;
          let isPresent = false;

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            gesture = HandTrackingService.detectGesture(landmarks);
            
            // Raw position from wrist (0) or palm center (9)
            const palm = landmarks[9] || landmarks[0];
            rawX = 1 - palm.x; // Mirror horizontal
            rawY = palm.y;
            isPresent = true;
          }

          // --- 1. Position Smoothing (Lerp) ---
          // Factor: 0.1 gives a heavier, smoother "cinematic" camera feel
          const smoothingFactor = 0.1; 
          
          if (isPresent) {
            const smoothX = prevPositionRef.current.x + (rawX - prevPositionRef.current.x) * smoothingFactor;
            const smoothY = prevPositionRef.current.y + (rawY - prevPositionRef.current.y) * smoothingFactor;
            
            prevPositionRef.current = { x: smoothX, y: smoothY };
          }

          // --- 2. Gesture Debouncing ---
          // We keep a small history buffer to prevent flickering between states
          if (isPresent) {
              gestureHistoryRef.current.push(gesture);
              if (gestureHistoryRef.current.length > 5) {
                  gestureHistoryRef.current.shift();
              }

              // Count occurrences
              const counts = gestureHistoryRef.current.reduce((acc, g) => {
                  acc[g] = (acc[g] || 0) + 1;
                  return acc;
              }, {} as Record<string, number>);

              // Find dominant gesture
              const dominant = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b) as HandGesture;
              
              // Confidence check: dominate gesture must be > 3 frames
              if (counts[dominant] >= 3) {
                  lastEmittedGestureRef.current = dominant;
              }
          } else {
              // Clear history quickly if hand is lost so we don't get stuck
              gestureHistoryRef.current = [];
              lastEmittedGestureRef.current = HandGesture.NONE;
          }

          // Emit stabilized result
          onUpdate({
            gesture: lastEmittedGestureRef.current,
            position: prevPositionRef.current,
            isPresent: isPresent
          });
        });

        await service.start();
        if (isMountedRef.current) setPermissionGranted(true);
      } catch (err) {
        console.error("Camera init failed:", err);
      }
    };

    startCamera();

    return () => {
      isMountedRef.current = false;
      service?.stop();
    };
  }, [onUpdate]);

  return (
    <div className="fixed bottom-4 right-4 z-50 overflow-hidden rounded-xl border-2 border-gold-500/50 shadow-lg shadow-gold-500/20 bg-black">
      <video
        ref={videoRef}
        className={`w-32 h-24 object-cover transform -scale-x-100 transition-opacity duration-500 ${permissionGranted ? 'opacity-100' : 'opacity-0'}`}
        playsInline
        muted
        autoPlay
      />
      {!permissionGranted && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-white">
          Loading...
        </div>
      )}
    </div>
  );
});

export default HandController;