import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface BlankHeadProps {
  visible?: boolean
}

export default function BlankHead({
  visible = true,
}: BlankHeadProps) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (!groupRef.current || !visible) return

    groupRef.current.rotation.y += delta * 0.045
  })

  if (!visible) return null

  return (
    <group ref={groupRef} position={[0, -0.12, -0.32]}>
      <mesh scale={[1.02, 1.18, 0.96]}>
        <icosahedronGeometry args={[1.18, 3]} />
        <meshStandardMaterial
          color="#17171b"
          roughness={0.72}
          metalness={0.12}
          flatShading
          transparent
          opacity={0.9}
          side={THREE.DoubleSide}
        />
      </mesh>

      <mesh position={[0, -1.28, 0]} scale={[0.52, 0.82, 0.5]}>
        <cylinderGeometry args={[0.95, 0.72, 1.55, 10, 3]} />
        <meshStandardMaterial
          color="#111115"
          roughness={0.78}
          metalness={0.08}
          flatShading
          transparent
          opacity={0.86}
        />
      </mesh>

      <mesh scale={[1.025, 1.185, 0.965]}>
        <icosahedronGeometry args={[1.18, 2]} />
        <meshBasicMaterial
          color="#ffffff"
          wireframe
          transparent
          opacity={0.045}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}
