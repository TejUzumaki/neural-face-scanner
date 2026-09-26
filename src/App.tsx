import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stage } from '@react-three/drei'
import { Suspense, useState, useRef } from 'react'
import FaceMesh3D from './components/FaceMesh3D'
import * as vision from '@mediapipe/tasks-vision'

function App() {
  const [faceGeometry, setFaceGeometry] = useState<{ positions: Float32Array, uvs: Float32Array, indices: Uint16Array } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(null)

  const loadModel = async () => {
    const filesetResolver = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
    )
    return await vision.FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU"
      },
      outputFaceBlendshapes: false,
      runningMode: "IMAGE",
      numFaces: 1
    })
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    const reader = new FileReader()
    reader.onload = async (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = async () => {
        setImageSrc(img.src)
        try {
          const landmarker = await loadModel()
          const result = landmarker.detect(img)
          
          if (result.faceLandmarks.length > 0) {
            const landmarks = result.faceLandmarks[0]
            const positions = new Float32Array(landmarks.length * 3)
            const uvs = new Float32Array(landmarks.length * 2)
            
            for (let i = 0; i < landmarks.length; i++) {
              positions[i * 3] = (landmarks[i].x - 0.5) * 3
              positions[i * 3 + 1] = -(landmarks[i].y - 0.5) * 3
              positions[i * 3 + 2] = -landmarks[i].z * 3
              uvs[i * 2] = landmarks[i].x
              uvs[i * 2 + 1] = 1.0 - landmarks[i].y
            }

            const indices = new Uint16Array(landmarks.length)
            for (let i = 0; i < landmarks.length; i++) indices[i] = i

            setFaceGeometry({ positions, uvs, indices })
          }
        } catch (error) {
          console.error("AI Model Error:", error)
        }
        setIsLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="relative w-full h-full bg-gray-900 flex flex-col md:flex-row overflow-hidden">
      <div className="w-full md:w-72 h-auto md:h-full bg-black/40 backdrop-blur-md border-r border-white/10 p-4 flex flex-col gap-4 z-10">
        <h2 className="text-white text-xl font-bold">🧠 Neural Scanner</h2>
        <p className="text-gray-400 text-xs">Upload a front-facing selfie. The AI will extract 478 3D data points from your face instantly in the browser.</p>
        
        <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold rounded-xl transition-colors"
        >
          {isLoading ? "🧠 AI Scanning..." : "Upload Selfie"}
        </button>

        {imageSrc && (
          <div className="mt-4">
            <h3 className="text-white text-sm font-bold mb-2">Source Image:</h3>
            <img src={imageSrc} className="w-full rounded-xl border border-white/10" alt="Source" />
          </div>
        )}
      </div>

      <div className="flex-1 h-full relative">
        <Canvas shadows camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]}>
          <color attach="background" args={['#05050a']} />
          <Suspense fallback={null}>
            <Stage intensity={0.5} environment="city">
              {faceGeometry ? <FaceMesh3D geometry={faceGeometry} /> : null}
            </Stage>
          </Suspense>
          <OrbitControls enablePan={false} minDistance={2} maxDistance={8} />
        </Canvas>
        
        {!faceGeometry && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-600 text-2xl font-bold animate-pulse">Waiting for Neural Input...</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
