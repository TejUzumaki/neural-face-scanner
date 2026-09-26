import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stage } from '@react-three/drei'
import { Suspense, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import FaceMesh3D from './components/FaceMesh3D'
import * as vision from '@mediapipe/tasks-vision'

type Mode = 'idle' | 'upload' | 'webcam'

function App() {
  const [faceGeometry, setFaceGeometry] = useState<{ positions: Float32Array, uvs: Float32Array, indices: Uint16Array } | null>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [isLoading, setIsLoading] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<vision.FaceLandmarker | null>(null)

  // Load AI Model once
  useEffect(() => {
    const loadModel = async () => {
      const filesetResolver = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      )
      landmarkerRef.current = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numFaces: 1
      })
    }
    loadModel()
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [])

  const processLandmarks = (landmarks: vision.NormalizedLandmark[]) => {
    const positions = new Float32Array(landmarks.length * 3)
    const uvs = new Float32Array(landmarks.length * 2)
    
    for (let i = 0; i < landmarks.length; i++) {
      positions[i * 3] = (landmarks[i].x - 0.5) * 3
      positions[i * 3 + 1] = -(landmarks[i].y - 0.5) * 3
      positions[i * 3 + 2] = -landmarks[i].z * 3
      uvs[i * 2] = landmarks[i].x
      uvs[i * 2 + 1] = 1.0 - landmarks[i].y
    }
    return { positions, uvs, indices: new Uint16Array(0) } // Indices handled by FaceMesh3D
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !landmarkerRef.current) return

    setIsLoading(true)
    setMode('upload')
    const reader = new FileReader()
    reader.onload = async (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = async () => {
        imageRef.current = img
        const result = landmarkerRef.current.detect(img)
        if (result.faceLandmarks.length > 0) {
          setFaceGeometry(processLandmarks(result.faceLandmarks[0]))
        }
        setIsLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const startWebcam = async () => {
    if (!landmarkerRef.current) return
    setMode('webcam')
    setIsLoading(true)
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play()
          setIsLoading(false)
          detectWebcam()
        }
      }
    } catch (error) {
      console.error("Webcam access denied:", error)
      setIsLoading(false)
      setMode('idle')
    }
  }

  const detectWebcam = () => {
    if (!videoRef.current || !landmarkerRef.current || mode !== 'webcam') return
    
    const video = videoRef.current
    if (video.readyState >= 2) {
      const result = landmarkerRef.current.detectForVideo(video, performance.now())
      if (result.faceLandmarks.length > 0) {
        setFaceGeometry(processLandmarks(result.faceLandmarks[0]))
      }
    }
    requestAnimationFrame(detectWebcam)
  }

  const stopWebcam = () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
    setMode('idle')
    setFaceGeometry(null)
  }

  return (
    <div className="relative w-full h-full bg-gray-900 flex flex-col md:flex-row overflow-hidden">
      {/* LEFT SIDEBAR */}
      <div className="w-full md:w-72 h-auto md:h-full bg-black/40 backdrop-blur-md border-r border-white/10 p-4 flex flex-col gap-4 z-10">
        <h2 className="text-white text-xl font-bold">🧠 Neural Scanner</h2>
        
        <div className="flex flex-col gap-2 mt-4">
          <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
          >
            📸 Upload Selfie
          </motion.button>

          {mode !== 'webcam' ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={startWebcam}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors"
            >
              🎥 Live Webcam
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={stopWebcam}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors"
            >
              ⏹️ Stop Camera
            </motion.button>
          )}
        </div>

        <div className="mt-4">
          <h3 className="text-white text-sm font-bold mb-2">Status:</h3>
          <div className="text-gray-400 text-xs">
            {isLoading ? "🧠 AI Scanning..." : mode === 'webcam' ? "🟢 Live Tracking" : "⚪ Waiting for input"}
          </div>
        </div>
      </div>

      {/* CENTER - 3D Canvas */}
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
        
        {/* Hidden video element for webcam processing */}
        <video ref={videoRef} className="hidden" playsInline muted />
        
        {/* Source Image Preview */}
        {mode === 'upload' && imageRef.current && (
          <div className="absolute bottom-4 right-4 w-32 h-32 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl">
            <img src={imageRef.current.src} className="w-full h-full object-cover" alt="Source" />
          </div>
        )}

        {!faceGeometry && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.p 
              initial={{ opacity: 0.5 }} 
              animate={{ opacity: 1 }} 
              transition={{ duration: 1, repeat: Infinity, repeatType: "reverse" }}
              className="text-gray-600 text-2xl font-bold"
            >
              Awaiting Neural Input...
            </motion.p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
