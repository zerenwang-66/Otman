import React, { useMemo, useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment, Image as DreiImage } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { AppState, ParticleData, HandTrackingResult } from '../types';
import { CONFIG, COLORS } from '../constants';

interface ExperienceProps {
  appState: AppState;
  photos: string[];
  handDataRef: React.MutableRefObject<HandTrackingResult>;
  activePhotoIndex: number;
  onPhotoSelect: (index: number) => void;
}

// Reusable geometries and materials
const sphereGeo = new THREE.SphereGeometry(1, 16, 16);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
const cylinderGeo = new THREE.CylinderGeometry(0.2, 0.2, 2, 8);

const goldMat = new THREE.MeshStandardMaterial({
  color: COLORS.GOLD,
  metalness: 0.8,
  roughness: 0.2,
  emissive: COLORS.GOLD,
  emissiveIntensity: 0.3
});
const redMat = new THREE.MeshStandardMaterial({
  color: COLORS.RED,
  metalness: 0.3,
  roughness: 0.4,
  emissive: COLORS.RED,
  emissiveIntensity: 0.2
});
const snowMat = new THREE.MeshStandardMaterial({
  color: COLORS.MATTE_GREEN, 
  metalness: 0.1,
  roughness: 0.1,
  emissive: '#FFFFFF',
  emissiveIntensity: 0.1
});

// Helper to shuffle array
function shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// Optimized Instanced Component
const InstancedOrnaments = ({ 
  data, 
  geometry, 
  material, 
  appState 
}: { 
  data: ParticleData[], 
  geometry: THREE.BufferGeometry, 
  material: THREE.Material, 
  appState: AppState 
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const buffer = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (data.length > 0) {
       buffer.current = new Float32Array(data.length * 4); 
       data.forEach((d, i) => {
         buffer.current![i*4] = d.initialPos[0];
         buffer.current![i*4+1] = d.initialPos[1];
         buffer.current![i*4+2] = d.initialPos[2];
         buffer.current![i*4+3] = 0.01; 
         
         dummy.position.set(d.initialPos[0], d.initialPos[1], d.initialPos[2]);
         dummy.scale.setScalar(0.01);
         dummy.updateMatrix();
         if (meshRef.current) meshRef.current.setMatrixAt(i, dummy.matrix);
       });
       if (meshRef.current) meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [data, dummy]);

  useFrame((state, delta) => {
    if (!meshRef.current || !buffer.current) return;

    const time = state.clock.elapsedTime;
    const isTree = appState === AppState.TREE;
    const lerpSpeed = isTree ? 3 * delta : 2 * delta; 

    let needsUpdate = false;

    for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const idx = i * 4;

        // Calculate Target based on AppState
        let tx, ty, tz;
        if (appState === AppState.SCATTER || appState === AppState.ZOOM) {
            tx = d.scatterPos[0] + Math.cos(time * 0.5 + d.id) * 0.2;
            ty = d.scatterPos[1] + Math.sin(time + d.id) * 0.5;
            tz = d.scatterPos[2];
        } else {
            tx = d.treePos[0];
            ty = d.treePos[1];
            tz = d.treePos[2];
        }

        const cx = buffer.current[idx];
        const cy = buffer.current[idx+1];
        const cz = buffer.current[idx+2];
        
        const nx = THREE.MathUtils.lerp(cx, tx, lerpSpeed);
        const ny = THREE.MathUtils.lerp(cy, ty, lerpSpeed);
        const nz = THREE.MathUtils.lerp(cz, tz, lerpSpeed);

        buffer.current[idx] = nx;
        buffer.current[idx+1] = ny;
        buffer.current[idx+2] = nz;

        const targetScaleVal = appState === AppState.ZOOM ? 0.5 : 1.0;
        const targetScale = d.scale * targetScaleVal;
        const currentScale = buffer.current[idx+3];
        const newScale = THREE.MathUtils.lerp(currentScale, targetScale, delta * 3);
        buffer.current[idx+3] = newScale;

        dummy.position.set(nx, ny, nz);
        dummy.rotation.x = d.rotationSpeed[0] * time;
        dummy.rotation.y = d.rotationSpeed[1] * time;
        dummy.scale.setScalar(newScale);
        
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        needsUpdate = true;
    }

    if (needsUpdate) {
        meshRef.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <instancedMesh 
      ref={meshRef} 
      args={[geometry, material, data.length]} 
      castShadow={false} 
      receiveShadow
      frustumCulled={false} 
    />
  );
};

// Component for individual photo with frame
const PhotoDisplay = React.memo(({ data, appState, isSelected }: { data: ParticleData, appState: AppState, isSelected: boolean }) => {
  const meshRef = useRef<THREE.Group>(null);
  const borderRef = useRef<THREE.Mesh>(null);
  
  const targetPosRef = useRef(new THREE.Vector3(...data.treePos));
  const scatterPosRef = useRef(new THREE.Vector3(...data.scatterPos));
  const treePosRef = useRef(new THREE.Vector3(...data.treePos));

  useEffect(() => {
      scatterPosRef.current.set(...data.scatterPos);
      treePosRef.current.set(...data.treePos);
  }, [data]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    let targetPos = new THREE.Vector3().copy(treePosRef.current);
    let targetScale = 1.8; 
    let targetRot = new THREE.Euler(0, -data.id * 0.5, 0); 

    if (borderRef.current) {
        const mat = borderRef.current.material as THREE.MeshStandardMaterial;
        const targetEmissive = isSelected ? 1 : 0;
        mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, targetEmissive, delta * 10);
    }

    if (appState === AppState.SCATTER) {
      targetPos.copy(scatterPosRef.current);
      targetScale = isSelected ? 2.5 : 1.5; 
      
      const time = state.clock.elapsedTime;
      targetPos.y += Math.sin(time + data.id) * 0.3;
      
      if (isSelected) {
         targetRot = new THREE.Euler(0, 0, 0);
      } else {
         targetRot = new THREE.Euler(0, time * 0.1, 0);
      }

    } else if (appState === AppState.ZOOM) {
      if (isSelected) {
        targetPos.set(0, 0, 8); 
        targetScale = 6;
        targetRot = new THREE.Euler(0, 0, 0); 
      } else {
        targetPos.copy(scatterPosRef.current);
        targetPos.multiplyScalar(1.5);
        targetScale = 0.5;
      }
    } else if (appState === AppState.TREE) {
        const angle = Math.atan2(targetPos.x, targetPos.z);
        targetRot = new THREE.Euler(0, angle, 0);
    }

    meshRef.current.position.lerp(targetPos, delta * 3);
    
    if (appState === AppState.ZOOM && isSelected) {
       meshRef.current.lookAt(state.camera.position);
    } else {
       meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetRot.x, delta * 3);
       meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRot.y, delta * 3);
       meshRef.current.rotation.z = THREE.MathUtils.lerp(meshRef.current.rotation.z, targetRot.z, delta * 3);
    }

    const currentScale = meshRef.current.scale.x;
    meshRef.current.scale.setScalar(THREE.MathUtils.lerp(currentScale, targetScale, delta * 4));
  });

  if (!data.photoUrl) return null;

  return (
    <group ref={meshRef} position={data.initialPos}>
       <mesh ref={borderRef} position={[0,0,-0.06]}>
         <boxGeometry args={[1.1, 1.1, 0.05]} />
         <meshStandardMaterial 
            color={COLORS.GOLD} 
            metalness={1} 
            roughness={0.2} 
            emissive={COLORS.GOLD}
            emissiveIntensity={0}
         />
       </mesh>
       <DreiImage 
        url={data.photoUrl} 
        transparent 
        opacity={1}
        side={THREE.DoubleSide}
        scale={[1, 1, 1]}
       />
    </group>
  );
});

const Experience: React.FC<ExperienceProps> = ({ appState, photos, handDataRef, activePhotoIndex, onPhotoSelect }) => {
  const particles = useMemo(() => {
    const count = CONFIG.PARTICLE_COUNT;
    const phi = Math.PI * (3 - Math.sqrt(5));
    const types: ParticleData['type'][] = ['SPHERE', 'CUBE', 'CYLINDER'];

    return Array.from({ length: count }).map((_, i) => {
      const t = i / count;
      const yTree = (t * CONFIG.TREE_HEIGHT) - (CONFIG.TREE_HEIGHT / 2);
      const maxRadius = (1 - t) * CONFIG.TREE_RADIUS_BASE;
      const angle = i * phi;
      const rJitter = maxRadius * (0.3 + 0.7 * Math.sqrt(Math.random()));

      const xTree = rJitter * Math.cos(angle);
      const zTree = rJitter * Math.sin(angle);

      const rScatter = CONFIG.SCATTER_RADIUS;
      const xScatter = (Math.random() - 0.5) * rScatter * 2;
      const yScatter = (Math.random() - 0.5) * rScatter * 1.5;
      const zScatter = (Math.random() - 0.5) * rScatter * 2;

      const type = types[Math.floor(Math.random() * types.length)];
      
      return {
        id: i,
        initialPos: [xScatter, yScatter, zScatter],
        treePos: [xTree, yTree, zTree],
        scatterPos: [xScatter, yScatter, zScatter],
        type,
        color: '', 
        scale: Math.random() * 0.3 + 0.1,
        rotationSpeed: [Math.random(), Math.random(), Math.random()]
      } as ParticleData;
    });
  }, []);

  const { spheres, cubes, cylinders } = useMemo(() => {
      const s: ParticleData[] = [];
      const c: ParticleData[] = [];
      const cyl: ParticleData[] = [];
      particles.forEach(p => {
          if (p.type === 'SPHERE') s.push(p);
          else if (p.type === 'CUBE') c.push(p);
          else if (p.type === 'CYLINDER') cyl.push(p);
      });
      return { spheres: s, cubes: c, cylinders: cyl };
  }, [particles]);

  const [photoParticles, setPhotoParticles] = useState<ParticleData[]>([]);

  useEffect(() => {
    const newParticles = photos.map((url, i): ParticleData => {
        const t = i / photos.length;
        const yTree = ((1 - t) * CONFIG.TREE_HEIGHT) - (CONFIG.TREE_HEIGHT / 2);
        const radius = ((1 - t) * CONFIG.TREE_RADIUS_BASE) + 2.0; 
        const angle = i * 2.5; 
        const xTree = radius * Math.cos(angle);
        const zTree = radius * Math.sin(angle);

        return {
            id: i + 1000,
            initialPos: [0, 0, 0],
            treePos: [xTree, yTree, zTree],
            scatterPos: [(Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*10],
            type: 'PHOTO',
            color: 'white',
            scale: 1,
            photoUrl: url,
            rotationSpeed: [0, 0, 0]
        };
    });
    setPhotoParticles(newParticles);
  }, [photos]);

  useEffect(() => {
      if (photoParticles.length === 0) return;
      setPhotoParticles(prev => {
          const next = prev.map(p => ({...p})); 
          if (appState === AppState.TREE) {
              const treePositions: [number, number, number][] = next.map((_, i) => {
                  const t = i / next.length;
                  const yTree = ((1 - t) * CONFIG.TREE_HEIGHT) - (CONFIG.TREE_HEIGHT / 2);
                  const radius = ((1 - t) * CONFIG.TREE_RADIUS_BASE) + 2.0; 
                  const angle = i * 2.5; 
                  return [radius * Math.cos(angle), yTree, radius * Math.sin(angle)];
              });
              const shuffledPositions = shuffle(treePositions);
              next.forEach((p, i) => {
                  p.treePos = shuffledPositions[i];
              });
          } 
          else if (appState === AppState.SCATTER) {
              next.forEach(p => {
                 p.scatterPos = [(Math.random()-0.5)*15, (Math.random()-0.5)*15, (Math.random()-0.5)*10]; 
              });
          }
          return next;
      });
  }, [appState, photos.length]);

  const vec3Ref = useRef(new THREE.Vector3());
  
  useFrame((state) => {
    if (appState === AppState.ZOOM) return;
    const handData = handDataRef.current;
    if (!handData.isPresent || photoParticles.length === 0) return;
    const ndcX = (handData.position.x * 2) - 1;
    const ndcY = -(handData.position.y * 2) + 1; 

    let minDist = Infinity;
    let closestIndex: number = -1;

    photoParticles.forEach((p, i) => {
        if (appState === AppState.TREE) vec3Ref.current.set(...p.treePos);
        else vec3Ref.current.set(...p.scatterPos);
        
        vec3Ref.current.project(state.camera);
        
        const dx = vec3Ref.current.x - ndcX;
        const dy = vec3Ref.current.y - ndcY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist < minDist) {
            minDist = dist;
            closestIndex = i;
        }
    });

    if (minDist < 0.4 && closestIndex !== -1) {
        onPhotoSelect(closestIndex);
    }
  });

  useFrame((state, delta) => {
    const handData = handDataRef.current;
    if (appState === AppState.SCATTER) {
      const targetX = (handData.position.x - 0.5) * 10; 
      const targetY = (handData.position.y - 0.5) * 5;  
      const r = 25;
      const desiredCamX = Math.sin(targetX * 0.5) * r;
      const desiredCamZ = Math.cos(targetX * 0.5) * r;
      const desiredCamY = -targetY * 2;
      state.camera.position.lerp(new THREE.Vector3(desiredCamX, desiredCamY, desiredCamZ), delta * 2);
      state.camera.lookAt(0, 0, 0);
    } else if (appState === AppState.TREE) {
      const time = state.clock.getElapsedTime();
      const r = 25;
      state.camera.position.x = Math.sin(time * 0.1) * r;
      state.camera.position.z = Math.cos(time * 0.1) * r;
      state.camera.position.y = THREE.MathUtils.lerp(state.camera.position.y, 0, delta);
      state.camera.lookAt(0, 0, 0);
    }
  });

  return (
    <>
      <ambientLight args={[0xffffff, 0.2]} />
      <pointLight position={[10, 10, 10]} intensity={1} color={COLORS.GOLD} />
      <pointLight position={[-10, -10, -10]} intensity={0.5} color={COLORS.RED} />
      <spotLight position={[0, 20, 0]} intensity={1.5} angle={0.5} castShadow />
      <Environment preset="city" />

      <group>
        <InstancedOrnaments data={spheres} geometry={sphereGeo} material={goldMat} appState={appState} />
        <InstancedOrnaments data={cubes} geometry={cubeGeo} material={snowMat} appState={appState} />
        <InstancedOrnaments data={cylinders} geometry={cylinderGeo} material={redMat} appState={appState} />
      </group>

      <group>
        {photoParticles.map((p, idx) => (
             <PhotoDisplay 
                key={p.id} 
                data={p} 
                appState={appState} 
                isSelected={idx === activePhotoIndex} 
             />
        ))}
      </group>

      <EffectComposer enableNormalPass={false}>
        <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
      </EffectComposer>
    </>
  );
};

export default Experience;