import { Suspense, useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, PerspectiveCamera } from '@react-three/drei'
import * as vision from '@mediapipe/tasks-vision'
import FaceMesh3D, { type FaceData } from './components/FaceMesh3D'

type Mode = 'idle' | 'upload' | 'webcam'
type EngineState = 'checking' | 'downloading' | 'initializing' | 'ready' | 'error'
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
const STORAGE_KEY = 'neural-face-scanner-assets-v2'
const MODEL_CACHE_DB = 'neural-face-scanner-model-cache'
const MODEL_CACHE_STORE = 'assets'
const MODEL_CACHE_KEY = 'face-landmarker-float16-v1'

function openModelCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('IndexedDB is unavailable')); return }
    const request = indexedDB.open(MODEL_CACHE_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(MODEL_CACHE_STORE)) db.createObjectStore(MODEL_CACHE_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open local model cache'))
  })
}

async function readCachedModel(): Promise<ArrayBuffer | null> {
  try {
    const db = await openModelCache()
    return await new Promise((resolve, reject) => {
      const request = db.transaction(MODEL_CACHE_STORE, 'readonly').objectStore(MODEL_CACHE_STORE).get(MODEL_CACHE_KEY)
      request.onsuccess = () => {
        const value = request.result
        db.close()
        resolve(value instanceof ArrayBuffer && value.byteLength > 1_000_000 ? value : null)
      }
      request.onerror = () => { db.close(); reject(request.error) }
    })
  } catch { return null }
}

async function writeCachedModel(buffer: ArrayBuffer): Promise<void> {
  try {
    const db = await openModelCache()
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(MODEL_CACHE_STORE, 'readwrite')
      transaction.objectStore(MODEL_CACHE_STORE).put(buffer, MODEL_CACHE_KEY)
      transaction.oncomplete = () => { db.close(); resolve() }
      transaction.onerror = () => { db.close(); reject(transaction.error) }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
    })
  } catch (error) {
    console.warn('Model cache could not be saved; browser network cache may still help next time.', error)
  }
}

async function downloadModel(onProgress: (progress: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(MODEL_URL, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`Face model download failed (${response.status}). Check your connection and reload.`)
  const total = Number(response.headers.get('content-length') || 0)
  if (!response.body) {
    const buffer = await response.arrayBuffer()
    onProgress(100)
    return buffer
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) { chunks.push(value); received += value.length }
    if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)))
  }
  const output = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length }
  onProgress(100)
  return output.buffer
}

function toFaceData(landmarks: vision.NormalizedLandmark[], mirrored = false): FaceData {
  const positions = new Float32Array(landmarks.length * 3)
  const uvs = new Float32Array(landmarks.length * 2)
  const nose = landmarks[1] ?? landmarks[4]
  const eyeA = landmarks[33]
  const eyeB = landmarks[263]
  const xA = mirrored ? 1 - eyeA.x : eyeA.x
  const xB = mirrored ? 1 - eyeB.x : eyeB.x
  const scale = 1.62 / Math.max(0.08, Math.abs(xB - xA))
  const noseX = mirrored ? 1 - nose.x : nose.x
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i]
    const x = mirrored ? 1 - p.x : p.x
    positions[i * 3] = (x - noseX) * scale
    positions[i * 3 + 1] = -(p.y - nose.y) * scale
    positions[i * 3 + 2] = -(p.z - nose.z) * scale * 1.35
    uvs[i * 2] = x
    uvs[i * 2 + 1] = 1 - p.y
  }
  return { positions, uvs, mirrored }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image could not be decoded.')) }
    image.src = url
  })
}

export default function App() {
  const [mode, setMode] = useState<Mode>('idle')
  const [face, setFace] = useState<FaceData | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [name, setName] = useState('Untitled scan')
  const [status, setStatus] = useState('Ready for a face image')
  const [error, setError] = useState('')
  const [modelState, setModelState] = useState<EngineState>('checking')
  const [modelProgress, setModelProgress] = useState(0)
  const [modelSource, setModelSource] = useState<'cached' | 'download' | null>(null)
  const [wireframe, setWireframe] = useState(true)
  const [points, setPoints] = useState(false)
  const [saved, setSaved] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Keep the video node mounted permanently. This avoids racing React's render
  // cycle when getUserMedia resolves immediately after the camera button tap.
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const landmarkerRef = useRef<vision.FaceLandmarker | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastVideoTime = useRef(-1)
  const lastDetectionAt = useRef(0)
  const modeRef = useRef<Mode>('idle')

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.srcObject = null
    }
    setCameraReady(false)
    if (modeRef.current === 'webcam') {
      modeRef.current = 'idle'
      setMode('idle')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        setModelState('checking')
        setStatus('Checking this device for the saved face model…')
        let modelBuffer = await readCachedModel()
        const loadedFromCache = Boolean(modelBuffer)
        if (modelBuffer) {
          setModelSource('cached')
          setModelProgress(100)
          setStatus('Local face model found · preparing this session…')
        } else {
          setModelSource('download')
          setModelState('downloading')
          setModelProgress(0)
          setStatus('First-time setup · downloading the face model to this device…')
          modelBuffer = await downloadModel(setModelProgress)
          if (modelBuffer.byteLength < 1_000_000) throw new Error('The downloaded face model looks incomplete. Check your connection and reload.')
          await writeCachedModel(modelBuffer)
        }
        if (cancelled) return
        setModelState('initializing')
        setStatus('Starting the vision engine · this takes a moment…')
        const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL)
        let landmarker: vision.FaceLandmarker
        try {
          landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer), delegate: 'GPU' },
            runningMode: 'IMAGE', numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          })
        } catch (gpuError) {
          console.warn('GPU delegate unavailable; falling back to CPU.', gpuError)
          landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer), delegate: 'CPU' },
            runningMode: 'IMAGE', numFaces: 1,
          })
        }
        if (cancelled) { landmarker.close(); return }
        landmarkerRef.current = landmarker
        setModelState('ready')
        setStatus(loadedFromCache ? 'Vision engine ready · local model restored' : 'Vision engine ready · model saved on this device')
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setModelState('error')
          setError(e instanceof Error ? e.message : 'Face detection could not load. Check your connection and reload.')
          setStatus('Vision engine unavailable')
        }
      }
    }
    void init()
    return () => {
      cancelled = true
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      streamRef.current?.getTracks().forEach(t => t.stop())
      landmarkerRef.current?.close()
    }
  }, [])

  const processImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose a valid image file.'); return }
    if (!landmarkerRef.current) { setError('Face detection is still loading. Try again in a moment.'); return }
    stopCamera()
    setError('')
    setStatus('Analysing portrait…')
    setSaved(false)
    try {
      await landmarkerRef.current.setOptions({ runningMode: 'IMAGE' })
      const image = await loadImage(file)
      const result = landmarkerRef.current.detect(image)
      const landmarks = result.faceLandmarks?.[0]
      if (!landmarks?.length) {
        setError('No face detected. Use a clear, front-facing photograph with the full face visible.')
        setStatus('No face detected')
        return
      }
      const canvas = document.createElement('canvas')
      const maxSide = 1600
      const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.round(image.naturalWidth * ratio)
      canvas.height = Math.round(image.naturalHeight * ratio)
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
      setImageUrl(canvas.toDataURL('image/jpeg', 0.9))
      setFace(toFaceData(landmarks))
      setName(file.name.replace(/\.[^.]+$/, '') || 'Untitled scan')
      modeRef.current = 'upload'
      setMode('upload')
      setStatus(`Surface generated · ${landmarks.length} landmarks`)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Image processing failed.')
      setStatus('Processing failed')
    }
  }

  const startCamera = async () => {
    if (!landmarkerRef.current) { setError('The vision engine is not ready yet. Wait until its status says READY.'); return }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera access is unavailable. Open this app on localhost or HTTPS in a supported browser, then check camera permission.')
      return
    }
    stopCamera()
    setError('')
    setFace(null)
    setImageUrl(null)
    setStatus('Waiting for camera permission…')
    try {
      await landmarkerRef.current.setOptions({ runningMode: 'VIDEO' })
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      modeRef.current = 'webcam'
      setMode('webcam')
      const video = videoRef.current
      if (!video) throw new Error('Camera preview element is unavailable. Reload the page and try again.')
      video.srcObject = stream
      video.muted = true
      video.playsInline = true
      await video.play()
      setCameraReady(true)
      setStatus('Camera active · looking for a face')
      lastVideoTime.current = -1
      lastDetectionAt.current = 0
      const scan = () => {
        if (modeRef.current !== 'webcam' || !videoRef.current || !landmarkerRef.current) return
        const currentVideo = videoRef.current
        const now = performance.now()
        if (currentVideo.readyState >= 2 && currentVideo.currentTime !== lastVideoTime.current && now - lastDetectionAt.current >= 125) {
          lastVideoTime.current = currentVideo.currentTime
          lastDetectionAt.current = now
          try {
            const result = landmarkerRef.current.detectForVideo(currentVideo, now)
            const landmarks = result.faceLandmarks?.[0]
            if (landmarks?.length) {
              setFace(toFaceData(landmarks, true))
              setStatus(`Live tracking · ${landmarks.length} landmarks`)
            } else {
              setFace(null)
              setStatus('Camera active · move your face into view')
            }
          } catch (e) { console.warn('Frame detection failed', e) }
        }
        frameRef.current = requestAnimationFrame(scan)
      }
      frameRef.current = requestAnimationFrame(scan)
    } catch (e) {
      console.error(e)
      stopCamera()
      const message = e instanceof Error ? e.message : 'Camera access failed.'
      setError(message.includes('Permission') || message.includes('denied')
        ? 'Camera permission was denied. Allow camera access for this site in Chrome site settings, then try again.'
        : message)
      setStatus('Camera unavailable')
    }
  }

  const saveScan = () => {
    if (!face || !imageUrl || mode !== 'upload') { setError('Save is available for completed photo scans.'); return }
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as unknown[]
      existing.push({ id: `${Date.now()}`, name: name.trim() || 'Untitled scan', createdAt: new Date().toISOString(), sourceImage: imageUrl, positions: Array.from(face.positions), uvs: Array.from(face.uvs) })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing))
      setSaved(true)
      setError('')
      setStatus('Scan saved in this browser')
    } catch {
      setError('Browser storage is full. Use a smaller image or clear saved scans in this browser.')
    }
  }

  const reset = () => {
    stopCamera()
    setFace(null)
    setImageUrl(null)
    setName('Untitled scan')
    setSaved(false)
    setError('')
    setStatus('Ready for a face image')
    modeRef.current = 'idle'
    setMode('idle')
  }

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Neural Face Studio home">
          <span className="brand-mark"><span>N</span><i /></span>
          <span className="brand-copy"><strong>NEURAL<span>/</span>FACE</strong><small>RECONSTRUCTION STUDIO</small></span>
        </a>
        <div className="topbar-right">
          <span className="build-tag">BROWSER STUDIO <b>01</b></span>
          <div className="top-status"><i className={modelState === 'ready' ? 'online' : modelState === 'error' ? 'offline' : ''} />
            {modelState === 'ready' ? 'ENGINE READY' : modelState === 'error' ? 'ENGINE OFFLINE' : modelState === 'downloading' ? 'DOWNLOADING MODEL' : modelState === 'checking' ? 'CHECKING DEVICE' : 'STARTING ENGINE'}
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <div className="panel-kicker"><span className="eyebrow">WORKSPACE / 01</span><span className="live-indicator"><i /> LOCAL SESSION</span></div>
          <div className="intro-block">
            <p className="overline">2D INPUT <span>→</span> 2.5D OUTPUT</p>
            <h1>Bring a face<br />into <em>focus.</em></h1>
            <p className="intro">Create an interactive facial surface from a portrait or live camera feed.</p>
          </div>

          <div className="input-actions">
            {modelState !== 'ready' && <div className={`engine-loader ${modelState === 'error' ? 'has-error' : ''}`} role="status" aria-live="polite">
              <div className="stone-pile" aria-hidden="true"><i /><i /><i /><i /><i /></div>
              <div className="engine-loader-copy"><strong>{modelState === 'error' ? 'MODEL SETUP NEEDS ATTENTION' : modelState === 'downloading' ? 'PREPARING THIS DEVICE' : modelState === 'checking' ? 'CHECKING LOCAL MODEL' : 'STARTING VISION ENGINE'}</strong><span>{modelState === 'error' ? 'The model could not be prepared. Reload to retry.' : modelState === 'downloading' ? 'First visit: downloading the model. It will be saved locally for future visits.' : modelState === 'checking' ? 'Checking whether the face model is already stored on this device.' : modelSource === 'cached' ? 'Local model found. The browser is starting the vision runtime for this session.' : 'Model ready. Initializing the vision runtime.'}</span></div>
              {modelState === 'downloading' && <div className="engine-progress"><i style={{ width: `${modelProgress}%` }} /></div>}
              {modelState === 'error' && <button className="engine-retry" onClick={() => window.location.reload()}>Retry setup ↻</button>}
            </div>}
            <button className="primary-button" onClick={() => { if (modelState === 'ready') inputRef.current?.click(); else setStatus('The face model is still being prepared. You can use this action as soon as ENGINE READY appears.') }}>
              <span className="button-icon">↑</span><span><strong>Upload portrait</strong><small>JPG, PNG, WEBP</small></span><b className="button-arrow">↗</b>
            </button>
            <button className="secondary-button camera-button" onClick={startCamera}>
              <span className="camera-icon" /><span><strong>{cameraReady ? 'Camera running' : 'Use camera'}</strong><small>Live face tracking</small></span><b className="button-arrow">→</b>
            </button>
            <input ref={inputRef} type="file" accept="image/*" onChange={processImage} hidden />
          </div>

          <div className="section-divider"><span>INPUT SOURCE</span><span>01</span></div>
          <div className="section-heading"><span>PORTRAIT PREVIEW</span><span className={`source-state ${mode}`}>{mode === 'webcam' ? 'LIVE' : mode === 'upload' ? 'LOADED' : 'EMPTY'}</span></div>
          <div className={`source-preview ${mode === 'webcam' ? 'is-live' : ''}`}>
            <video ref={videoRef} className={mode === 'webcam' ? 'source-video visible' : 'source-video'} muted playsInline autoPlay />
            {mode === 'upload' && imageUrl ? <img src={imageUrl} alt="Uploaded source portrait" /> : null}
            {mode === 'idle' && <div className="empty-source"><span className="empty-source-icon">＋</span><b>No source selected</b><small>Your portrait will appear here</small></div>}
            {mode === 'webcam' && <span className="camera-live-label"><i /> CAMERA FEED</span>}
          </div>
          {mode === 'upload' && <label className="field-label">SCAN NAME<input value={name} maxLength={80} onChange={e => { setName(e.target.value); setSaved(false) }} /></label>}

          <div className="section-divider display-divider"><span>VIEW SETTINGS</span><span>02</span></div>
          <div className="section-heading"><span>MODEL DISPLAY</span><span>CONFIGURE</span></div>
          <label className="toggle-row"><span><b className="toggle-title">Triangulation lines</b><small>Show mesh topology</small></span><input type="checkbox" checked={wireframe} onChange={e => setWireframe(e.target.checked)} /><b className="toggle-track" /></label>
          <label className="toggle-row"><span><b className="toggle-title">Landmark points</b><small>Show detected coordinates</small></span><input type="checkbox" checked={points} onChange={e => setPoints(e.target.checked)} /><b className="toggle-track" /></label>

          <div className="panel-bottom"><span><i /> LOCAL PROCESSING</span><span>MEDIAPIPE / THREE.JS</span></div>
        </aside>

        <section className="viewport-panel">
          <div className="viewport-top">
            <div><span className="eyebrow">CANVAS / 02</span><h2>{face ? 'Facial surface' : '3D workspace'}</h2><p>{face ? 'Inspect your generated facial landmark surface.' : 'Your reconstructed model will appear in this space.'}</p></div>
            <div className="viewport-tools"><span className={`view-badge ${face ? 'active' : ''}`}><i />{face ? 'MODEL ACTIVE' : 'AWAITING INPUT'}</span><button className="reset-icon" onClick={reset} aria-label="Reset workspace" title="Reset workspace">↺</button></div>
          </div>

          <div className="viewport-canvas">
            <div className="viewport-grid" />
            <div className="viewport-glow" />
            <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
              <Suspense fallback={null}>
                <PerspectiveCamera makeDefault position={[0, 0, 5.1]} fov={42} />
                <ambientLight intensity={1.2} />
                <directionalLight position={[2, 3, 4]} intensity={1.7} />
                <pointLight position={[-2, 0, 2]} intensity={1.1} color="#16e0a0" />
                <pointLight position={[2, -1, -2]} intensity={0.7} color="#287bff" />
                {face && <FaceMesh3D faceData={face} texture={mode === 'upload' ? imageUrl : null} showWireframe={wireframe} showPoints={points} />}
                <OrbitControls makeDefault enableDamping dampingFactor={0.08} minDistance={2.2} maxDistance={8} enablePan={false} />
              </Suspense>
            </Canvas>
            {!face && <div className="viewport-empty"><div className="empty-orbit"><span /><span /><span /><b>NF</b></div><strong>Nothing on the canvas. Yet.</strong><p>Upload a portrait or activate your camera to generate a facial surface.</p><span className="empty-hint">SUPPORTED INPUT · PHOTO / LIVE CAMERA</span></div>}
            <div className="axis-label">X <i /> Y <i /> Z <span>WORLD COORDINATES</span></div>
            <div className="drag-label">DRAG TO ROTATE <span>·</span> PINCH TO ZOOM</div>
            {face && <div className="canvas-model-chip"><i /> FACIAL MESH <span>LIVE VIEW</span></div>}
          </div>

          <div className="viewport-footer">
            <div className="status-line"><i className={face || cameraReady ? 'online' : ''} /><span>{status}</span></div>
            <div className="model-meta"><span>{face ? `${face.positions.length / 3} VERTICES` : '— VERTICES'}</span><span>{face ? 'LANDMARK SURFACE' : 'NO GEOMETRY'}</span></div>
          </div>
          {error && <div className="error-banner" role="alert"><span>!</span>{error}</div>}
          <div className="bottom-actions"><p className="disclaimer">A landmark-driven facial surface — not a complete volumetric head scan.</p><div className="action-group">{mode === 'webcam' && <button className="text-action danger" onClick={reset}>Stop camera <span>×</span></button>}{mode === 'upload' && <button className="text-action" onClick={saveScan} disabled={!face}>{saved ? '✓ Saved locally' : 'Save scan ↗'}</button>}{mode !== 'idle' && <button className="text-action" onClick={reset}>Reset workspace ↺</button>}</div></div>
        </section>
      </section>
      <footer className="app-footer"><span>NEURAL / FACE <b>·</b> EXPERIMENTAL RECONSTRUCTION TOOL</span><span>PHOTO → LANDMARKS → SURFACE <i /> V 0.2</span></footer>
    </main>
  )
}
