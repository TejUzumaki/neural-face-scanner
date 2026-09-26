import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TRIANGULATION } from '../utils/triangulation'

interface FaceMesh3DProps {
  faceData: { positions: Float32Array, uvs: Float32Array }
  texture: string | null
}

export default function FaceMesh3D({ faceData, texture }: FaceMesh3DProps) {
  const solidMeshRef = useRef<THREE.Mesh>(null)
  const wireframeRef = useRef<THREE.Mesh>(null)
  const morphProgress = useRef(0)

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(TRIANGULATION), 1))
    // Initialize flat positions
    const initPos = new Float32Array(faceData.positions.length)
    for(let i=0; i<initPos.length; i+=3) {
      initPos[i] = faceData.positions[i]
      initPos[i+1] = faceData.positions[i+1]
      initPos[i+2] = 0 // Start flat
    }
    geo.setAttribute('position', new THREE.BufferAttribute(initPos, 3))
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

  useEffect(() => { morphProgress.current = 0 }, [faceData])

  useFrame((_, delta) => {
    if (!solidMeshRef.current || !wireframeRef.current) return

    // Smoothly animate morph progress
    if (morphProgress.current < 1) {
      morphProgress.current = Math.min(1, morphProgress.current + delta * 0.8)
    }

    const targetPositions = faceData.positions
    const currentPositions = solidMeshRef.current.geometry.attributes.position.array as Float32Array
    
    // Lerp Z position for the morphing effect
    for (let i = 0; i < targetPositions.length; i += 3) {
      currentPositions[i] = targetPositions[i]
      currentPositions[i + 1] = targetPositions[i + 1]
      currentPositions[i + 2] = THREE.MathUtils.lerp(0, targetPositions[i + 2], morphProgress.current)
    }

    solidMeshRef.current.geometry.attributes.position.needsUpdate = true
    solidMeshRef.current.geometry.computeVertexNormals()

    wireframeRef.current.geometry.attributes.position.array.set(currentPositions)
    wireframeRef.current.geometry.attributes.position.needsUpdate = true

    // Material opacity transitions
    const solidMat = solidMeshRef.current.material as THREE.MeshStandardMaterial
    const wireMat = wireframeRef.current.material as THREE.MeshBasicMaterial
    
    solidMat.opacity = THREE.MathUtils.lerp(0, 1, morphProgress.current)
    wireMat.opacity = THREE.MathUtils.lerp(1, 0.2, morphProgress.current)
  })

  return (
    <group scale={1.5}>
      <mesh ref={solidMeshRef} geometry={geometry} castShadow>
        <meshStandardMaterial 
          map={loadedTexture}
          color={loadedTexture ? "#ffffff" : "#00ffff"}
          roughness={0.4} 
          metalness={0.1} 
          transparent 
          opacity={0}
          side={THREE.DoubleSide}
          flatShading
        />
      </mesh>
      
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
