import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TRIANGULATION } from '../utils/triangulation'

interface FaceMesh3DProps {
  faceData: {
    positions: Float32Array
    uvs: Float32Array
  }
  texture: string | null
}

export default function FaceMesh3D({ faceData, texture }: FaceMesh3DProps) {
  const solidMeshRef = useRef<THREE.Mesh>(null)
  const wireframeRef = useRef<THREE.Mesh>(null)
  
  // Morphing state (0 = flat image, 1 = full 3D)
  const morphProgress = useRef(0)

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(TRIANGULATION), 1))
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceData.positions.length), 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(faceData.uvs, 2))
    return geo
  }, [faceData])

  const loadedTexture = useMemo(() => {
    if (texture) {
      const tex = new THREE.TextureLoader().load(texture)
      tex.needsUpdate = true
      return tex
    }
    return null
  }, [texture])

  // Reset morph progress when a new face is detected
  useEffect(() => {
    morphProgress.current = 0
  }, [faceData])

  useFrame((_, delta) => {
    if (!solidMeshRef.current || !wireframeRef.current) return

    // Animate morph progress from 0 to 1 over 2 seconds
    if (morphProgress.current < 1) {
      morphProgress.current = Math.min(1, morphProgress.current + delta * 0.5)
    }

    const targetPositions = faceData.positions
    const currentPositions = solidMeshRef.current.geometry.attributes.position.array as Float32Array
    
    // Lerp vertices from flat (z=0) to 3D (z=target)
    for (let i = 0; i < targetPositions.length; i += 3) {
      currentPositions[i] = targetPositions[i]
      currentPositions[i + 1] = targetPositions[i + 1]
      // Lerp Z position for the morphing effect
      currentPositions[i + 2] = targetPositions[i + 2] * morphProgress.current
    }

    solidMeshRef.current.geometry.attributes.position.needsUpdate = true
    solidMeshRef.current.geometry.computeVertexNormals()

    // Copy positions to wireframe
    wireframeRef.current.geometry.attributes.position.array.set(currentPositions)
    wireframeRef.current.geometry.attributes.position.needsUpdate = true

    // Material opacity transitions
    const solidMat = solidMeshRef.current.material as THREE.MeshStandardMaterial
    const wireMat = wireframeRef.current.material as THREE.MeshBasicMaterial
    
    // Solid mesh fades in, wireframe fades out
    solidMat.opacity = morphProgress.current
    wireMat.opacity = 1 - (morphProgress.current * 0.7)
  })

  return (
    <group scale={1.5}>
      {/* Solid Textured Mask (Fades in) */}
      <mesh ref={solidMeshRef} geometry={geometry} castShadow>
        <meshStandardMaterial 
          map={loadedTexture}
          color={loadedTexture ? "#ffffff" : "#00ffff"}
          roughness={0.5} 
          metalness={0.2} 
          transparent 
          opacity={0}
          side={THREE.DoubleSide}
          flatShading
        />
      </mesh>
      
      {/* Glowing Wireframe (Fades out) */}
      <mesh ref={wireframeRef} geometry={geometry} scale={1.001}>
        <meshBasicMaterial 
          color="#00ffff" 
          wireframe 
          transparent 
          opacity={1}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}
