import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

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

  const bufferGeo = new THREE.BufferGeometry()
  bufferGeo.setAttribute('position', new THREE.BufferAttribute(geometry.positions, 3))
  bufferGeo.setAttribute('uv', new THREE.BufferAttribute(geometry.uvs, 2))
  bufferGeo.setIndex(new THREE.BufferAttribute(geometry.indices, 1))
  bufferGeo.computeVertexNormals()

  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.005
    if (pointsRef.current) pointsRef.current.rotation.y += 0.005
  })

  return (
    <group>
      <mesh ref={meshRef} geometry={bufferGeo} scale={1.5}>
        <meshStandardMaterial color="#00ffff" wireframe={true} transparent opacity={0.8} />
      </mesh>
      <points ref={pointsRef} geometry={bufferGeo} scale={1.51}>
        <pointsMaterial color="#ff00ff" size={0.02} sizeAttenuation transparent opacity={0.9} />
      </points>
    </group>
  )
}
