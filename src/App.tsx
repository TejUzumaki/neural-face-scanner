import { Canvas } from '@react-three/fiber'
import { Suspense, useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import FaceMesh3D from './components/FaceMesh3D'
import { BootLoader, RotateOverlay, StatusBox, HudButton } from './components/ui/Overlay'
import * as vision from '@mediapipe/tasks-vision'

type Mode = 'idle' | 'upload' | 'webcam'

function App() {
  const [faceData, setFaceData] = useState<{ positions: Float32Array, uvs: Float32Array } | null>(null)
  const [mode, setMode] = useState<Mode>('idle')
  const [status, setStatus] = useState('AWAITING NEURAL INPUT')
  const [subStatus, setSubStatus] = useState('STATE: IDLE')
  const [isLoading, setIsLoading] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<vision.FaceLandmarker | null>(null)

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
    return () => streamRef.current?.getTracks().forEach(t => t.stop())
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
    return { positions, uvs }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !landmarkerRef.current) return
    setIsLoading(true); setMode('upload')
    setStatus('SCANNING IMAGE...'); setSubStatus('STATE: PROCESSING')
    
    const reader = new FileReader()
    reader.onload = async (event) => {
      const img = new Image()
      img.src = event.target?.result as string
      img.onload = async () => {
        imageRef.current = img
        const result = landmarkerRef.current.detect(img)
        if (result.faceLandmarks.length > 0) {
          setFaceData(processLandmarks(result.faceLandmarks[0]))
          setStatus('MORPHING SEQUENCE INITIATED')
          setSubStatus('STATE: RECONSTRUCTING')
          setTimeout(() => { setStatus('3D RECONSTRUCTION COMPLETE'); setSubStatus('STATE: READY') }, 2500)
        } else {
          setStatus('NO FACE DETECTED'); setSubStatus('STATE: ERROR')
        }
        setIsLoading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const startWebcam = async () => {
    if (!landmarkerRef.current) return
    setMode('webcam'); setIsLoading(true)
    setStatus('REQUESTING CAMERA ACCESS...'); setSubStatus('STATE: BOOTING')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play(); setIsLoading(false)
          setStatus('LIVE NEURAL TRACKING ACTIVE'); setSubStatus('STATE: LIVE')
          detectWebcam()
        }
      }
    } catch (error) {
      setStatus('CAMERA ACCESS DENIED'); setSubStatus('STATE: ERROR')
      setIsLoading(false); setMode('idle')
    }
  }

  const detectWebcam = () => {
    if (!videoRef.current || !landmarkerRef.current || mode !== 'webcam') return
    const video = videoRef.current
    if (video.readyState >= 2) {
      const result = landmarkerRef.current.detectForVideo(video, performance.now())
      if (result.faceLandmarks.length > 0) {
        setFaceData(processLandmarks(result.faceLandmarks[0]))
      }
    }
    requestAnimationFrame(detectWebcam)
  }

  const stopWebcam = () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    setMode('idle'); setFaceData(null)
    setStatus('AWAITING NEURAL INPUT'); setSubStatus('STATE: IDLE')
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <BootLoader />
      <RotateOverlay />
      
      {/* Background Visual Layer */}
      <div className="absolute inset-0 z-0">
        {mode === 'webcam' && (
          <video ref={videoRef} className="w-full h-full object-cover -scale-x-100" playsInline muted />
        )}
        {mode === 'upload' && imageRef.current && (
          <img src={imageRef.current.src} className="w-full h-full object-cover opacity-70" alt="Source" />
        )}
      </div>

      {/* 3D Canvas Layer */}
      <Canvas className="absolute inset-0 z-10" camera={{ position: [0, 0, 5], fov: 45 }} dpr={[1, 2]}>
        <Suspense fallback={null}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 5, 3]} intensity={1.5} />
          {faceData && <FaceMesh3D faceData={faceData} texture={mode === 'upload' ? imageRef.current?.src : null} />}
        </Suspense>
      </Canvas>

      {/* UI Overlay Layer */}
      <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-6">
        
        {/* Top Header */}
        <div className="flex justify-between items-start">
          <motion.div 
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.5, duration: 0.8 }}
            className="bg-black/70 border border-white/10 backdrop-blur-md px-4 py-2 rounded-lg"
          >
            <h1 className="text-sm font-bold tracking-[0.2em] text-accent font-sans">NEURAL SCANNER</h1>
          </motion.div>
          
          {mode === 'webcam' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pointer-events-auto">
              <HudButton onClick={stopWebcam} variant="danger">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              </HudButton>
            </motion.div>
          )}
        </div>

        {/* Bottom Controls & Status */}
        <div className="flex flex-col items-center gap-5">
          <AnimatePresence mode="wait">
            <motion.div key={status} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <StatusBox status={status} subStatus={subStatus} />
            </motion.div>
          </AnimatePresence>

          {mode === 'idle' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.7, duration: 0.8 }}
              className="flex gap-4 pointer-events-auto"
            >
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
              <motion.button 
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => fileInputRef.current?.click()} 
                className="bg-black/70 border border-white/10 backdrop-blur-md px-6 py-3 rounded-lg text-xs font-bold tracking-[0.2em] text-white hover:bg-white/10 transition-colors font-sans"
              >
                UPLOAD IMAGE
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={startWebcam} 
                className="bg-accent text-black px-6 py-3 rounded-lg text-xs font-bold tracking-[0.2em] hover:bg-white transition-colors font-sans"
              >
                LIVE WEBCAM
              </motion.button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
