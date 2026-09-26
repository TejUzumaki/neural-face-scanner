import {
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TRIANGULATION } from '../utils/triangulation'

export interface FaceData {
  positions: Float32Array
  uvs: Float32Array
}

interface FaceMesh3DProps {
  faceData: FaceData
  texture?: string | null
  accent?: string
}

export default function FaceMesh3D({
  faceData,
  texture = null,
  accent = '#8cff6a',
}: FaceMesh3DProps) {
  const meshRef = useRef<THREE.Mesh>(null)
  const wireRef = useRef<THREE.Mesh>(null)
  const pointsRef = useRef<THREE.Points>(null)
  const progress = useRef(0)

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()

    const initial = new Float32Array(
      faceData.positions.length,
    )

    for (
      let i = 0;
      i < faceData.positions.length;
      i += 3
    ) {
      initial[i] = faceData.positions[i]
      initial[i + 1] =
        faceData.positions[i + 1]
      initial[i + 2] = 0
    }

    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(initial, 3),
    )

    geo.setAttribute(
      'uv',
      new THREE.BufferAttribute(
        faceData.uvs,
        2,
      ),
    )

    geo.setIndex(
      new THREE.BufferAttribute(
        new Uint16Array(TRIANGULATION),
        1,
      ),
    )

    geo.computeVertexNormals()

    return geo
  }, [faceData])

  const pointGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const initial = new Float32Array(
      faceData.positions.length,
    )

    initial.set(faceData.positions)

    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(initial, 3),
    )

    return geo
  }, [faceData])

  const sourceTexture = useMemo(() => {
    if (!texture) {
      return null
    }

    const loader = new THREE.TextureLoader()
    const loaded = loader.load(texture)

    loaded.colorSpace =
      THREE.SRGBColorSpace

    loaded.minFilter =
      THREE.LinearFilter

    loaded.magFilter =
      THREE.LinearFilter

    return loaded
  }, [texture])

  useEffect(() => {
    progress.current = 0

    return () => {
      geometry.dispose()
      pointGeometry.dispose()
      sourceTexture?.dispose()
    }
  }, [
    faceData,
    geometry,
    pointGeometry,
    sourceTexture,
  ])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    const wire = wireRef.current
    const points = pointsRef.current

    if (!mesh || !wire || !points) {
      return
    }

    progress.current = Math.min(
      1,
      progress.current + delta * 0.72,
    )

    const p = progress.current

    const eased =
      p * p * (3 - 2 * p)

    const meshPositions =
      mesh.geometry.attributes.position
        .array as Float32Array

    const wirePositions =
      wire.geometry.attributes.position
        .array as Float32Array

    const pointPositions =
      points.geometry.attributes.position
        .array as Float32Array

    for (
      let i = 0;
      i < faceData.positions.length;
      i += 3
    ) {
      meshPositions[i] =
        faceData.positions[i]

      meshPositions[i + 1] =
        faceData.positions[i + 1]

      meshPositions[i + 2] =
        THREE.MathUtils.lerp(
          0,
          faceData.positions[i + 2],
          eased,
        )

      wirePositions[i] =
        meshPositions[i]

      wirePositions[i + 1] =
        meshPositions[i + 1]

      wirePositions[i + 2] =
        meshPositions[i + 2]

      pointPositions[i] =
        meshPositions[i]

      pointPositions[i + 1] =
        meshPositions[i + 1]

      pointPositions[i + 2] =
        meshPositions[i + 2]
    }

    mesh.geometry.attributes.position.needsUpdate =
      true

    wire.geometry.attributes.position.needsUpdate =
      true

    points.geometry.attributes.position.needsUpdate =
      true

    mesh.geometry.computeVertexNormals()

    const material =
      mesh.material as THREE.MeshStandardMaterial

    material.opacity =
      THREE.MathUtils.lerp(
        0.05,
        0.88,
        eased,
      )

    const wireMaterial =
      wire.material as THREE.MeshBasicMaterial

    wireMaterial.opacity =
      THREE.MathUtils.lerp(
        0.95,
        0.28,
        eased,
      )

    const pointMaterial =
      points.material as THREE.PointsMaterial

    pointMaterial.opacity =
      THREE.MathUtils.lerp(
        1,
        0.2,
        eased,
      )
  })

  return (
    <group
      position={[0, 0, 0.25]}
      scale={1.58}
    >
      <mesh
        ref={meshRef}
        geometry={geometry}
        renderOrder={3}
      >
        <meshStandardMaterial
          map={sourceTexture}
          color={
            sourceTexture
              ? '#ffffff'
              : '#9b7cff'
          }
          roughness={0.34}
          metalness={0.28}
          transparent
          opacity={0}
          depthWrite={false}
          side={THREE.DoubleSide}
          flatShading
          emissive={accent}
          emissiveIntensity={0.06}
        />
      </mesh>

      <mesh
        ref={wireRef}
        geometry={geometry}
        scale={1.002}
        renderOrder={4}
      >
        <meshBasicMaterial
          color={accent}
          wireframe
          transparent
          opacity={1}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>

      <points
        ref={pointsRef}
        geometry={pointGeometry}
        renderOrder={5}
      >
        <pointsMaterial
          color="#ffffff"
          size={0.014}
          sizeAttenuation
          transparent
          opacity={1}
          depthWrite={false}
        />
      </points>
    </group>
  )
}
