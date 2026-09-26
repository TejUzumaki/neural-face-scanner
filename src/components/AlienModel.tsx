import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface AlienModelProps {
  bodyColor: string
  eyeColor: string
  headSize: number
  bodyWidth: number
  hasAntennae: boolean
  hasHorns: boolean
}

export default function AlienModel({ bodyColor, eyeColor, headSize, bodyWidth, hasAntennae, hasHorns }: AlienModelProps) {
  const groupRef = useRef<THREE.Group>(null)
  const leftEyeRef = useRef<THREE.Mesh>(null)
  const rightEyeRef = useRef<THREE.Mesh>(null)

  // Make the eyes blink occasionally
  useFrame((state) => {
    const t = state.clock.getElapsedTime()
    const blink = Math.sin(t * 2) > 0.95 ? 0.1 : 1 // Quick blink
    
    if (leftEyeRef.current) leftEyeRef.current.scale.y = blink
    if (rightEyeRef.current) rightEyeRef.current.scale.y = blink
  })

  return (
    <group ref={groupRef} position={[0, -0.5, 0]}>
      
      {/* --- BODY (Squishy Capsule) --- */}
      <mesh castShadow scale={[bodyWidth, 1, bodyWidth]} position={[0, -0.5, 0]}>
        <capsuleGeometry args={[0.5, 0.5, 8, 16]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} metalness={0.1} />
      </mesh>

      {/* --- HEAD (Big Squishy Sphere) --- */}
      <mesh castShadow scale={headSize} position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.7, 32, 32]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} metalness={0.1} />
      </mesh>

      {/* --- EYES --- */}
      {/* Left Eye White */}
      <mesh position={[-0.25, 0.45, 0.6 * headSize]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="white" roughness={0.1} />
      </mesh>
      {/* Left Pupil */}
      <mesh ref={leftEyeRef} position={[-0.25, 0.45, 0.75 * headSize]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color={eyeColor} roughness={0.1} />
      </mesh>

      {/* Right Eye White */}
      <mesh position={[0.25, 0.45, 0.6 * headSize]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="white" roughness={0.1} />
      </mesh>
      {/* Right Pupil */}
      <mesh ref={rightEyeRef} position={[0.25, 0.45, 0.75 * headSize]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial color={eyeColor} roughness={0.1} />
      </mesh>

      {/* --- ANTENNAE --- */}
      {hasAntennae && (
        <>
          <group position={[-0.2, 0.8 * headSize, 0]}>
            <mesh castShadow position={[0, 0.15, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
            <mesh castShadow position={[0, 0.35, 0]}>
              <sphereGeometry args={[0.08, 16, 16]} />
              <meshStandardMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.5} />
            </mesh>
          </group>
          <group position={[0.2, 0.8 * headSize, 0]}>
            <mesh castShadow position={[0, 0.15, 0]}>
              <cylinderGeometry args={[0.02, 0.02, 0.3, 8]} />
              <meshStandardMaterial color={bodyColor} />
            </mesh>
            <mesh castShadow position={[0, 0.35, 0]}>
              <sphereGeometry args={[0.08, 16, 16]} />
              <meshStandardMaterial color={bodyColor} emissive={bodyColor} emissiveIntensity={0.5} />
            </mesh>
          </group>
        </>
      )}

      {/* --- DEVIL HORNS --- */}
      {hasHorns && (
        <>
          <mesh castShadow position={[-0.3, 0.9 * headSize, 0]} rotation={[0, 0, -Math.PI / 4]}>
            <coneGeometry args={[0.1, 0.3, 16]} />
            <meshStandardMaterial color="#8B0000" roughness={0.2} metalness={0.5} />
          </mesh>
          <mesh castShadow position={[0.3, 0.9 * headSize, 0]} rotation={[0, 0, Math.PI / 4]}>
            <coneGeometry args={[0.1, 0.3, 16]} />
            <meshStandardMaterial color="#8B0000" roughness={0.2} metalness={0.5} />
          </mesh>
        </>
      )}

      {/* --- LITTLE ARMS --- */}
      <mesh castShadow position={[-0.4 * bodyWidth, -0.4, 0]} rotation={[0, 0, Math.PI / 3]}>
        <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} />
      </mesh>
      <mesh castShadow position={[0.4 * bodyWidth, -0.4, 0]} rotation={[0, 0, -Math.PI / 3]}>
        <capsuleGeometry args={[0.1, 0.3, 4, 8]} />
        <meshStandardMaterial color={bodyColor} roughness={0.3} />
      </mesh>

    </group>
  )
}
