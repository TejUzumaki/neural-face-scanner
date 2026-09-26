import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

interface TShirtModelProps {
  texture: string | null
  color: string
  textureScale: number
  texturePosition: [number, number]
}

const DAMPING = 0.97
const ITERATIONS = 4
const GRAVITY = -3.2
const TIMESTEP = 0.016

type ClothSim = {
  positions: Float32Array
  prevPositions: Float32Array
  indices: Uint32Array
  uvs: Float32Array
  pinned: Uint8Array
  cA: Uint32Array
  cB: Uint32Array
  cRest: Float32Array
  cols: number
  rows: number
}

// Build a cylindrical cloth grid (Torso or Sleeve)
function buildCylindricalCloth(cols: number, rows: number, radius: number, height: number): ClothSim {
  const n = cols * rows
  const positions = new Float32Array(n * 3)
  const prevPositions = new Float32Array(n * 3)
  const uvs = new Float32Array(n * 2)
  const pinned = new Uint8Array(n)

  for (let v = 0; v < rows; v++) {
    for (let u = 0; u < cols; u++) {
      const i = v * cols + u
      const theta = (u / (cols - 1)) * Math.PI * 2
      const y = (height / 2) - (v / (rows - 1)) * height
      
      positions[i * 3] = Math.cos(theta) * radius
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = Math.sin(theta) * radius
      
      prevPositions[i * 3] = positions[i * 3]
      prevPositions[i * 3 + 1] = positions[i * 3 + 1]
      prevPositions[i * 3 + 2] = positions[i * 3 + 2]

      uvs[i * 2] = u / (cols - 1)
      uvs[i * 2 + 1] = v / (rows - 1)

      // Pin the top row (shoulders/neck)
      if (v === 0) pinned[i] = 1
    }
  }

  const cA: number[] = []
  const cB: number[] = []
  const cRest: number[] = []
  
  const restH = (2 * Math.PI * radius) / (cols - 1)
  const restV = height / (rows - 1)
  const restD = Math.sqrt(restH * restH + restV * restV)

  for (let v = 0; v < rows; v++) {
    for (let u = 0; u < cols; u++) {
      const i = v * cols + u
      // Horizontal
      if (u < cols - 1) {
        cA.push(i); cB.push(i + 1); cRest.push(restH)
      }
      // Vertical
      if (v < rows - 1) {
        cA.push(i); cB.push(i + cols); cRest.push(restV)
      }
      // Shear (Diagonal) - prevents collapsing into paper
      if (u < cols - 1 && v < rows - 1) {
        cA.push(i); cB.push(i + cols + 1); cRest.push(restD)
        cA.push(i + 1); cB.push(i + cols); cRest.push(restD)
      }
    }
  }

  const indices = new Uint32Array((cols - 1) * (rows - 1) * 6)
  let o = 0
  for (let v = 0; v < rows - 1; v++) {
    for (let u = 0; u < cols - 1; u++) {
      const a = v * cols + u
      const b = a + 1
      const c = a + cols
      const d = c + 1
      indices[o++] = a; indices[o++] = c; indices[o++] = b
      indices[o++] = b; indices[o++] = c; indices[o++] = d
    }
  }

  return {
    positions,
    prevPositions,
    indices,
    uvs,
    pinned,
    cA: Uint32Array.from(cA),
    cB: Uint32Array.from(cB),
    cRest: Float32Array.from(cRest),
    cols,
    rows,
  }
}

interface ClothPieceProps {
  cols: number
  rows: number
  radius: number
  height: number
  position: [number, number, number]
  rotation: [number, number, number]
  texture: THREE.Texture | null
  color: string
}

function ClothPiece({ cols, rows, radius, height, position, rotation, texture, color }: ClothPieceProps) {
  const geoRef = useRef<THREE.BufferGeometry>(null)
  const sim = useMemo(() => buildCylindricalCloth(cols, rows, radius, height), [cols, rows, radius, height])

  useFrame((state) => {
    const geo = geoRef.current
    if (!geo) return
    
    const t = state.clock.getElapsedTime()
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute
    const positions = posAttr.array as Float32Array
    const prev = sim.prevPositions
    const dt2 = TIMESTEP * TIMESTEP
    
    // Wind forces
    const windX = Math.sin(t * 0.7) * 2.0
    const windZ = (Math.sin(t * 1.3) * 0.5 + 0.6) * 4.0

    // Verlet Integration
    for (let i = 0; i < sim.positions.length / 3; i++) {
      if (sim.pinned[i]) continue
      
      const io = i * 3
      const ax = windX
      const ay = GRAVITY
      const az = windZ * (0.5 + 0.5 * Math.sin(t * 2 + positions[io + 1] * 0.8))
      
      const px = positions[io]
      const py = positions[io + 1]
      const pz = positions[io + 2]
      
      const vx = (px - prev[io]) * DAMPING
      const vy = (py - prev[io + 1]) * DAMPING
      const vz = (pz - prev[io + 2]) * DAMPING
      
      positions[io] = px + vx + ax * dt2
      positions[io + 1] = py + vy + ay * dt2
      positions[io + 2] = pz + vz + az * dt2
      
      prev[io] = px
      prev[io + 1] = py
      prev[io + 2] = pz
    }

    // Constraint Relaxation
    for (let iter = 0; iter < ITERATIONS; iter++) {
      for (let k = 0; k < sim.cRest.length; k++) {
        const a = sim.cA[k]
        const b = sim.cB[k]
        const ao = a * 3
        const bo = b * 3
        
        const dx = positions[bo] - positions[ao]
        const dy = positions[bo + 1] - positions[ao + 1]
        const dz = positions[bo + 2] - positions[ao + 2]
        
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz) || 1e-6
        const diff = (dist - sim.cRest[k]) / dist
        const pa = sim.pinned[a]
        const pb = sim.pinned[b]
        
        if (pa && pb) continue
        const w = pa || pb ? 1 : 0.5
        const mx = dx * diff * w
        const my = dy * diff * w
        const mz = dz * diff * w
        
        if (!pa) {
          positions[ao] += mx
          positions[ao + 1] += my
          positions[ao + 2] += mz
        }
        if (!pb) {
          positions[bo] -= mx
          positions[bo + 1] -= my
          positions[bo + 2] -= mz
        }
      }
    }

    posAttr.needsUpdate = true
    geo.computeVertexNormals()
  })

  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <bufferGeometry ref={geoRef}>
        <bufferAttribute attach="attributes-position" args={[sim.positions, 3]} />
        <bufferAttribute attach="attributes-uv" args={[sim.uvs, 2]} />
        <bufferAttribute attach="index" args={[sim.indices, 1]} />
      </bufferGeometry>
      <meshStandardMaterial
        map={texture}
        color={color}
        roughness={0.75}
        metalness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export default function TShirtModel({ texture, color, textureScale, texturePosition }: TShirtModelProps) {
  const loadedTexture = useMemo(() => {
    if (texture) {
      const tex = new THREE.TextureLoader().load(texture)
      tex.center.set(0.5, 0.5)
      tex.repeat.set(textureScale, textureScale)
      tex.offset.set(texturePosition[0], texturePosition[1])
      tex.needsUpdate = true
      return tex
    }
    return null
  }, [texture, textureScale, texturePosition])

  return (
    <group position={[0, -0.5, 0]}>
      {/* Torso */}
      <ClothPiece 
        cols={20} 
        rows={25} 
        radius={1.1} 
        height={2.5} 
        position={[0, 0, 0]} 
        rotation={[0, 0, 0]} 
        texture={loadedTexture}
        color={color}
      />
      
      {/* Left Sleeve */}
      <ClothPiece 
        cols={12} 
        rows={15} 
        radius={0.45} 
        height={1.1} 
        position={[-1.1, 0.6, 0]} 
        rotation={[0, 0, Math.PI / 2.2]} 
        texture={loadedTexture}
        color={color}
      />
      
      {/* Right Sleeve */}
      <ClothPiece 
        cols={12} 
        rows={15} 
        radius={0.45} 
        height={1.1} 
        position={[1.1, 0.6, 0]} 
        rotation={[0, 0, -Math.PI / 2.2]} 
        texture={loadedTexture}
        color={color}
      />
    </group>
  )
}
