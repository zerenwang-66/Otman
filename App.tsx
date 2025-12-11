import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Loader } from '@react-three/drei';
import Experience from './components/Experience';
import HandController from './components/HandController';
import { AppState, HandGesture, HandTrackingResult } from './types';
import { COLORS } from './constants';

const App = () => {
  const [appState, setAppState] = useState<AppState>(AppState.TREE);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isHandPresent, setIsHandPresent] = useState(false);
  const [currentGesture, setCurrentGesture] = useState<HandGesture>(HandGesture.NONE);
  const [activePhotoIndex, setActivePhotoIndex] = useState<number>(0);
  
  // Refs to keep track of state inside stable callbacks without triggering re-renders of children
  const appStateRef = useRef<AppState>(AppState.TREE);
  const photosRef = useRef<string[]>([]);
  const handDataRef = useRef<HandTrackingResult>({
    gesture: HandGesture.NONE,
    position: { x: 0.5, y: 0.5 },
    isPresent: false
  });

  // Sync refs with state
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Stable callback that NEVER changes reference.
  const onHandUpdateProxy = useCallback((result: HandTrackingResult) => {
      // 1. Update high-frequency ref for 3D loop
      handDataRef.current = result;
      
      // 2. Logic to Select Photo is now handled inside Experience via Raycasting/Projection
      // We no longer do simple X-axis mapping here.

      // 3. UI Updates (Throttled by React)
      setIsHandPresent(prev => prev !== result.isPresent ? result.isPresent : prev);
      
      setCurrentGesture(prev => {
        if (prev !== result.gesture) {
          // GESTURE STATE MACHINE
          const currentAppState = appStateRef.current;
          
          if (result.isPresent) {
            switch (result.gesture) {
                case HandGesture.FIST:
                  if (currentAppState !== AppState.TREE) setAppState(AppState.TREE);
                  break;
                case HandGesture.OPEN_PALM:
                  if (currentAppState !== AppState.SCATTER) setAppState(AppState.SCATTER);
                  break;
                case HandGesture.TWO_FINGERS:
                  // Only allow entering zoom if we have photos
                  if (currentAppState === AppState.SCATTER && photosRef.current.length > 0) {
                      setAppState(AppState.ZOOM);
                  }
                  break;
            }
          }
          return result.gesture;
        }
        return prev;
      });
  }, []);

  const handlePhotoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newUrls = Array.from(e.target.files).map(file => URL.createObjectURL(file as Blob));
      // Just append new photos
      setPhotos(prev => [...prev, ...newUrls]);
    }
  }, []);

  const clearPhotos = useCallback(() => {
      setPhotos([]);
      setActivePhotoIndex(0);
  }, []);

  return (
    <div className="relative w-full h-screen bg-[#1F0B12] text-white overflow-hidden select-none">
      {/* 3D Scene */}
      <Canvas shadows camera={{ position: [0, 0, 25], fov: 45 }} dpr={[1, 1.5]}> 
        <color attach="background" args={[COLORS.BG_DARK]} />
        <fog attach="fog" args={[COLORS.BG_DARK, 10, 50]} />
        <Experience 
            appState={appState} 
            photos={photos} 
            handDataRef={handDataRef} 
            activePhotoIndex={activePhotoIndex}
            onPhotoSelect={setActivePhotoIndex}
        />
      </Canvas>
      <Loader />

      {/* Hand Controller */}
      <HandController onUpdate={onHandUpdateProxy} />

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-8 pointer-events-none">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl md:text-6xl text-[#E6B2B8] font-serif tracking-widest drop-shadow-[0_0_15px_rgba(230,178,184,0.6)]">
              Otman
            </h1>
            <p className="text-[#D14768] font-serif text-lg tracking-widest mt-2 uppercase opacity-90">
              Winter Pink Snow Edition
            </p>
          </div>
          
          <div className="pointer-events-auto flex flex-col items-end gap-2">
             <div className="flex gap-2">
                {photos.length > 0 && (
                    <button 
                        onClick={clearPhotos}
                        className="px-4 py-2 border border-[#D14768]/50 text-[#D14768] rounded-full 
                                bg-black/20 backdrop-blur-sm transition-all duration-300 
                                hover:bg-[#D14768]/50 hover:text-white font-serif uppercase tracking-widest text-xs">
                        Clear All
                    </button>
                )}
                <label className="cursor-pointer group">
                <input type="file" multiple className="hidden" accept="image/*" onChange={handlePhotoUpload} />
                <div className="px-6 py-2 border border-[#E6B2B8] text-[#E6B2B8] rounded-full 
                                bg-black/20 backdrop-blur-sm transition-all duration-300 
                                hover:bg-[#E6B2B8] hover:text-[#1F0B12] font-serif uppercase tracking-widest text-sm shadow-[0_0_15px_rgba(230,178,184,0.2)]">
                    + Upload Photos
                </div>
                </label>
            </div>
            <p className="text-xs text-[#E6B2B8]/60 font-serif mt-1">
                {photos.length} memories loaded
            </p>
          </div>
        </header>
      </div>

      {/* State Indicator */}
      <div className="absolute bottom-8 left-8 max-w-sm pointer-events-none">
        <div className="flex flex-col gap-2">
           <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full transition-colors duration-300 ${isHandPresent ? 'bg-green-400 shadow-[0_0_10px_#4ade80]' : 'bg-[#D14768]'}`} />
              <span className="text-xs tracking-widest uppercase opacity-70">
                {isHandPresent ? `Hand Detected: ${currentGesture}` : 'No Hand Detected'}
              </span>
           </div>
           
           <div className="bg-[#1F0B12]/40 backdrop-blur-md border-l-2 border-[#E6B2B8] p-4 text-sm font-light leading-relaxed mt-4 transition-opacity duration-500 shadow-lg">
             <p className="mb-2"><strong className="text-[#E6B2B8]">Move Hand:</strong> Hover to Select</p>
             <p className="mb-2"><strong className="text-[#E6B2B8]">Two Fingers:</strong> Zoom Selection</p>
             <p className="mb-2"><strong className="text-[#E6B2B8]">Fist:</strong> Coalesce Tree (Randomizes)</p>
             <p><strong className="text-[#E6B2B8]">Open Hand:</strong> Scatter (Randomizes)</p>
           </div>
        </div>
      </div>
      
      {/* Current Selection Indicator (Optional visual aid at bottom) */}
      {isHandPresent && photos.length > 0 && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-none">
             <div className="text-[#E6B2B8] text-xs uppercase tracking-[0.2em] opacity-80 bg-[#1F0B12]/60 px-4 py-1 rounded-full backdrop-blur-sm border border-[#E6B2B8]/30">
                 Selecting {activePhotoIndex + 1} / {photos.length}
             </div>
          </div>
      )}

      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]" />
    </div>
  );
};

export default App;