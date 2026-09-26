import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TRIANGULATION } from '../utils/triangulation'

interface FaceMesh3DProps {
  geometry: {
    positions: Float32Array
    uvs: Float32Array
    indices: Uint16Array
  }
}

export default function FaceMesh3D({ geometry }: FaceMesh3DProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const pointsRef = useRef<THREE.Points>(null)
  
  // Setup geometry ONCE. We use TRIANGULATION to connect the 478 points into a solid mesh.
  const bufferGeo = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const indices = new Uint16Array(TRIANGULATION)
    geo.setIndex(new THREE.BufferAttribute(indices, 1))
    geo.setAttribute('position', new THREE.BufferAttribute(geometry.positions.slice(0), 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(geometry.uvs.slice(0), 2))
    geo.computeVertexNormals()
    return geo
  }, [])

  // Every frame, just update the positions (Real-time performance optimization)
  useEffect(() => {
    if (!meshRef.current) return
    const posAttr = meshRef.current.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < geometry.positions.length; i++) {
      posAttr.array[i] = geometry.positions[i]
    }
    posAttr.needsUpdate = true
    meshRef.current.geometry.computeVertexNormals()
  }, [geometry])

  // Rotate slowly if not tracking webcam (for uploaded photos)
  useFrame((state, delta) => {
    if (meshRef.current && !geometry.indices.length) {
      meshRef.current.rotation.y += delta * 0.2
    }
  })

  return (
    <group scale={1.5}>
      {/* Solid Low-Poly Mask with Flat Shading */}
      <mesh ref={meshRef} geometry={bufferGeo} castShadow>
        <meshStandardMaterial 
          color="#00ffff" 
          flatShading 
          roughness={0.3} 
          metalness={0.8} 
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Glowing Wireframe overlay to show the tech/math structure */}
      <mesh geometry={bufferGeo} scale={1.001}>
        <meshBasicMaterial color="#ff00ff" wireframe transparent opacity={0.3} />
      </mesh>
    </group>
  )
}
