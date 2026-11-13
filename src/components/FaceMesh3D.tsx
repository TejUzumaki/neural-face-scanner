import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { TRIANGULATION } from '../utils/triangulation'

export interface FaceData {
  positions: Float32Array
  uvs: Float32Array
  mirrored?: boolean
}

interface Props {
  faceData: FaceData
  texture?: string | null
  showWireframe?: boolean
  showPoints?: boolean
}

export default function FaceMesh3D({ faceData, texture = null, showWireframe = true, showPoints = false }: Props) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faceData.positions), 3))
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(faceData.uvs), 2))
    const validIndices = TRIANGULATION.filter(index => index < faceData.positions.length / 3)
    geo.setIndex(validIndices)
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    return geo
  }, [faceData])

  const map = useMemo(() => {
    if (!texture) return null
    const tex = new THREE.TextureLoader().load(texture)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearMipmapLinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.generateMipmaps = true
    return tex
  }, [texture])

  useEffect(() => () => { geometry.dispose(); map?.dispose() }, [geometry, map])

  return <group>
    <mesh geometry={geometry}>
      <meshStandardMaterial map={map} color={map ? '#ffffff' : '#9b8bd0'} roughness={0.65} metalness={0.04} side={THREE.DoubleSide} transparent opacity={0.98} flatShading={!map}/>
    </mesh>
    {showWireframe && <mesh geometry={geometry} scale={1.001}><meshBasicMaterial color="#b4a1ef" wireframe transparent opacity={0.42} depthWrite={false}/></mesh>}
    {showPoints && <points geometry={geometry}><pointsMaterial color="#e4d9ff" size={0.018} sizeAttenuation transparent opacity={0.9}/></points>}
  </group>
}
