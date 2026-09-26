import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { Canvas } from '@react-three/fiber'
import {
  OrbitControls,
  PerspectiveCamera,
} from '@react-three/drei'
import {
  AnimatePresence,
  motion,
} from 'framer-motion'
import * as vision from '@mediapipe/tasks-vision'

import BlankHead from './components/BlankHead'
import FaceMesh3D, {
  type FaceData,
} from './components/FaceMesh3D'

import {
  BootLoader,
  HudButton,
  RotateOverlay,
  StatusBox,
} from './components/ui/Overlay'

type Mode =
  | 'idle'
  | 'upload'
  | 'webcam'

interface SavedAsset {
  id: string
  name: string
  createdAt: string
  sourceImage: string
  positions: number[]
  uvs: number[]
  mirrored: boolean
}

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

const ASSET_STORAGE_KEY =
  'neural-face-scanner-assets-v1'

function normalizeLandmarks(
  landmarks: vision.NormalizedLandmark[],
  mirrored: boolean,
): FaceData {
  const positions = new Float32Array(
    landmarks.length * 3,
  )

  const uvs = new Float32Array(
    landmarks.length * 2,
  )

  const nose = landmarks[1] ?? landmarks[4]

  const noseX = mirrored
    ? 1 - nose.x
    : nose.x

  const noseY = nose.y
  const noseZ = nose.z

  const leftEye =
    landmarks[33]

  const rightEye =
    landmarks[263]

  const leftX = mirrored
    ? 1 - leftEye.x
    : leftEye.x

  const rightX = mirrored
    ? 1 - rightEye.x
    : rightEye.x

  const eyeDistance = Math.max(
    0.08,
    Math.abs(rightX - leftX),
  )

  const scale =
    1.62 / eyeDistance

  for (
    let i = 0;
    i < landmarks.length;
    i += 1
  ) {
    const landmark = landmarks[i]

    const xNorm =
      (mirrored
        ? 1 - landmark.x
        : landmark.x) - noseX

    const yNorm =
      landmark.y - noseY

    const zNorm =
      landmark.z - noseZ

    positions[i * 3] =
      xNorm * scale

    positions[i * 3 + 1] =
      -yNorm * scale

    positions[i * 3 + 2] =
      -zNorm * scale * 1.35

    const imageX = mirrored
      ? 1 - landmark.x
      : landmark.x

    uvs[i * 2] = imageX
    uvs[i * 2 + 1] =
      1 - landmark.y
  }

  return {
    positions,
    uvs,
    mirrored,
  }
}

function readFileAsDataUrl(
  file: File,
): Promise<string> {
  return new Promise(
    (resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () => {
        if (
          typeof reader.result ===
          'string'
        ) {
          resolve(reader.result)
        } else {
          reject(
            new Error(
              'Could not create image data.',
            ),
          )
        }
      }

      reader.onerror = () =>
        reject(
          reader.error ??
            new Error(
              'Could not read image.',
            ),
        )

      reader.readAsDataURL(file)
    },
  )
}

function App() {
  const [mode, setMode] =
    useState<Mode>('idle')

  const [faceData, setFaceData] =
    useState<FaceData | null>(null)

  const [imageSrc, setImageSrc] =
    useState<string | null>(null)

  const [sourceName, setSourceName] =
    useState('Untitled Face')

  const [assetSaved, setAssetSaved] =
    useState(false)

  const [status, setStatus] =
    useState('AWAITING NEURAL INPUT')

  const [subStatus, setSubStatus] =
    useState('STATE: IDLE')

  const [modelReady, setModelReady] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [showWireframe, setShowWireframe] =
    useState(true)

  const [showPoints, setShowPoints] =
    useState(false)

  const [showBlankHead, setShowBlankHead] =
    useState(true)

  const [sourceTimestamp, setSourceTimestamp] =
    useState('')

  const [assetVersion, setAssetVersion] =
    useState(0)

  const inputRef =
    useRef<HTMLInputElement>(null)

  const videoRef =
    useRef<HTMLVideoElement | null>(null)

  const streamRef =
    useRef<MediaStream | null>(null)

  const landmarkerRef =
    useRef<vision.FaceLandmarker | null>(
      null,
    )

  const modeRef =
    useRef<Mode>('idle')

  const rafRef =
    useRef<number | null>(null)

  const lastVideoTimeRef =
    useRef(-1)

  const objectUrlRef =
    useRef<string | null>(null)

  const sourceDataUrlRef =
    useRef<string | null>(null)

  const setScannerMode =
    useCallback((next: Mode) => {
      modeRef.current = next
      setMode(next)
    }, [])

  const stopAnimationLoop =
    useCallback(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(
          rafRef.current,
        )

        rafRef.current = null
      }
    }, [])

  const stopCameraTracks =
    useCallback(() => {
      streamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.stop()
        })

      streamRef.current = null
      lastVideoTimeRef.current = -1
    }, [])

  const clearObjectUrl =
    useCallback(() => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(
          objectUrlRef.current,
        )

        objectUrlRef.current = null
      }
    }, [])

  const stopWebcam =
    useCallback(() => {
      stopAnimationLoop()
      stopCameraTracks()

      if (
        modeRef.current ===
        'webcam'
      ) {
        setScannerMode('idle')
      }
    }, [
      setScannerMode,
      stopAnimationLoop,
      stopCameraTracks,
    ])

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      try {
        const fileset =
          await vision.FilesetResolver.forVisionTasks(
            WASM_URL,
          )

        const landmarker =
          await vision.FaceLandmarker.createFromOptions(
            fileset,
            {
              baseOptions: {
                modelAssetPath:
                  MODEL_URL,
                delegate: 'GPU',
              },

              runningMode: 'IMAGE',

              numFaces: 1,

              minFaceDetectionConfidence:
                0.5,

              minFacePresenceConfidence:
                0.5,

              minTrackingConfidence:
                0.5,
            },
          )

        if (cancelled) {
          landmarker.close()
          return
        }

        landmarkerRef.current =
          landmarker

        setModelReady(true)
      } catch (err) {
        console.error(err)

        setError(
          'Vision core failed to initialize. Check your network connection and reload.',
        )

        setStatus(
          'VISION CORE ERROR',
        )

        setSubStatus(
          'STATE: ERROR',
        )
      }
    }

    void initialize()

    return () => {
      cancelled = true

      stopAnimationLoop()
      stopCameraTracks()

      landmarkerRef.current?.close()
      landmarkerRef.current = null

      clearObjectUrl()
    }
  }, [
    clearObjectUrl,
    stopAnimationLoop,
    stopCameraTracks,
  ])

  const switchRunningMode =
    useCallback(
      async (
        runningMode:
          | 'IMAGE'
          | 'VIDEO',
      ) => {
        if (!landmarkerRef.current) {
          return
        }

        await landmarkerRef.current.setOptions(
          {
            runningMode,
          },
        )
      },
      [],
    )

  const handleImageUpload =
    useCallback(
      async (
        event: ChangeEvent<HTMLInputElement>,
      ) => {
        const file =
          event.target.files?.[0]

        event.target.value = ''

        if (!file) return

        if (
          !landmarkerRef.current ||
          !modelReady
        ) {
          setStatus(
            'VISION CORE LOADING',
          )

          setSubStatus(
            'STATE: WAIT',
          )

          return
        }

        stopWebcam()
        clearObjectUrl()

        setError(null)
        setAssetSaved(false)
        setScannerMode('upload')
        setStatus('ANALYZING IMAGE')
        setSubStatus(
          'STATE: LANDMARK EXTRACTION',
        )
        setFaceData(null)

        try {
          await switchRunningMode(
            'IMAGE',
          )

          const objectUrl =
            URL.createObjectURL(file)

          objectUrlRef.current =
            objectUrl

          const dataUrl =
            await readFileAsDataUrl(
              file,
            )

          sourceDataUrlRef.current =
            dataUrl

          const image =
            new Image()

          image.src = objectUrl

          await image.decode()

          const result =
            landmarkerRef.current.detect(
              image,
            )

          const landmarks =
            result.faceLandmarks?.[0]

          if (!landmarks?.length) {
            setStatus(
              'NO FACE DETECTED',
            )

            setSubStatus(
              'STATE: TRY ANOTHER IMAGE',
            )

            return
          }

          const data =
            normalizeLandmarks(
              landmarks,
              false,
            )

          setImageSrc(dataUrl)
          setFaceData(data)

          setSourceName(
            file.name.replace(
              /\.[^/.]+$/,
              '',
            ) || 'Untitled Face',
          )

          setSourceTimestamp(
            new Date().toLocaleString(
              undefined,
              {
                dateStyle: 'medium',
                timeStyle: 'short',
              },
            ),
          )

          setAssetVersion(
            (value) => value + 1,
          )

          setStatus(
            'TRIANGULATING FACE',
          )

          setSubStatus(
            'STATE: 478-POINT SURFACE',
          )

          window.setTimeout(() => {
            if (
              modeRef.current ===
              'upload'
            ) {
              setStatus(
                '3D RECONSTRUCTION READY',
              )

              setSubStatus(
                'STATE: INSPECT MODEL',
              )
            }
          }, 1600)
        } catch (err) {
          console.error(err)

          setStatus(
            'IMAGE PROCESSING ERROR',
          )

          setSubStatus(
            'STATE: ERROR',
          )

          setError(
            'The image could not be decoded or processed.',
          )
        }
      },
      [
        clearObjectUrl,
        modelReady,
        setScannerMode,
        stopWebcam,
        switchRunningMode,
      ],
    )

  const scanVideoFrame =
    useCallback(() => {
      const video =
        videoRef.current

      const landmarker =
        landmarkerRef.current

      if (
        !video ||
        !landmarker ||
        modeRef.current !==
          'webcam'
      ) {
        return
      }

      if (
        video.readyState >= 2 &&
        video.currentTime !==
          lastVideoTimeRef.current
      ) {
        try {
          const result =
            landmarker.detectForVideo(
              video,
              performance.now(),
            )

          lastVideoTimeRef.current =
            video.currentTime

          const landmarks =
            result.faceLandmarks?.[0]

          if (landmarks?.length) {
            const data =
              normalizeLandmarks(
                landmarks,
                true,
              )

            setFaceData(data)

            setStatus(
              'LIVE NEURAL TRACKING',
            )

            setSubStatus(
              'STATE: MIRRORED COORDINATES',
            )
          } else {
            setFaceData(null)

            setStatus(
              'SEARCHING FOR FACE',
            )

            setSubStatus(
              'STATE: NO LANDMARKS',
            )
          }
        } catch (err) {
          console.error(err)

          setStatus(
            'TRACKING ERROR',
          )

          setSubStatus(
            'STATE: RETRYING',
          )
        }
      }

      rafRef.current =
        requestAnimationFrame(
          scanVideoFrame,
        )
    }, [])

  const startWebcam =
    useCallback(async () => {
      if (
        !modelReady ||
        !landmarkerRef.current
      ) {
        setStatus(
          'VISION CORE LOADING',
        )

        setSubStatus(
          'STATE: WAIT',
        )

        return
      }

      if (
        !navigator.mediaDevices?.getUserMedia
      ) {
        setStatus(
          'CAMERA UNAVAILABLE',
        )

        setSubStatus(
          'STATE: HTTPS REQUIRED',
        )

        return
      }

      stopAnimationLoop()
      stopCameraTracks()
      clearObjectUrl()

      setError(null)
      setAssetSaved(false)
      setScannerMode('webcam')
      setStatus('REQUESTING CAMERA')
      setSubStatus(
        'STATE: PERMISSION',
      )

      setFaceData(null)
      setImageSrc(null)
      sourceDataUrlRef.current = null

      try {
        await switchRunningMode(
          'VIDEO',
        )

        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              audio: false,
              video: {
                facingMode: {
                  ideal: 'user',
                },
                width: {
                  ideal: 1280,
                },
                height: {
                  ideal: 720,
                },
              },
            },
          )

        streamRef.current =
          stream

        const video =
          videoRef.current

        if (!video) {
          throw new Error(
            'Video element is unavailable.',
          )
        }

        video.srcObject = stream

        await video.play()

        setStatus(
          'LIVE NEURAL TRACKING',
        )

        setSubStatus(
          'STATE: MIRRORED COORDINATES',
        )

        lastVideoTimeRef.current =
          -1

        rafRef.current =
          requestAnimationFrame(
            scanVideoFrame,
          )
      } catch (err) {
        console.error(err)

        stopCameraTracks()

        setScannerMode('idle')

        setStatus(
          'CAMERA ACCESS FAILED',
        )

        setSubStatus(
          'STATE: ERROR',
        )

        setError(
          'Camera permission was denied or the camera is unavailable.',
        )
      }
    }, [
      clearObjectUrl,
      modelReady,
      scanVideoFrame,
      setScannerMode,
      stopAnimationLoop,
      stopCameraTracks,
      switchRunningMode,
    ])

  const saveAsset =
    useCallback(() => {
      if (
        !faceData ||
        !sourceDataUrlRef.current
      ) {
        setError(
          'A reconstructed source image is required before saving.',
        )

        return
      }

      const asset: SavedAsset = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}`,
        name:
          sourceName.trim() ||
          'Untitled Face',
        createdAt:
          new Date().toISOString(),
        sourceImage:
          sourceDataUrlRef.current,
        positions: Array.from(
          faceData.positions,
        ),
        uvs: Array.from(
          faceData.uvs,
        ),
        mirrored:
          Boolean(faceData.mirrored),
      }

      let assets: SavedAsset[] = []

      try {
        const existing =
          localStorage.getItem(
            ASSET_STORAGE_KEY,
          )

        if (existing) {
          assets =
            JSON.parse(existing)
        }
      } catch {
        assets = []
      }

      assets.push(asset)

      try {
        localStorage.setItem(
          ASSET_STORAGE_KEY,
          JSON.stringify(assets),
        )

        setAssetSaved(true)
        setStatus('ASSET SAVED')
        setSubStatus(
          'STATE: LOCAL FACE LIBRARY',
        )
      } catch {
        setError(
          'The asset is too large for browser storage. Try a smaller source image.',
        )
      }
    }, [
      faceData,
      sourceName,
    ])

  const reset =
    useCallback(() => {
      stopWebcam()
      clearObjectUrl()

      setFaceData(null)
      setImageSrc(null)
      sourceDataUrlRef.current = null
      setAssetSaved(false)
      setError(null)
      setSourceName('Untitled Face')
      setSourceTimestamp('')

      setStatus(
        'AWAITING NEURAL INPUT',
      )

      setSubStatus('STATE: IDLE')
    }, [
      clearObjectUrl,
      stopWebcam,
    ])

  const modelReadyText =
    modelReady
      ? 'VISION CORE ONLINE'
      : 'LOADING VISION CORE'

  const landmarkCount =
    faceData
      ? faceData.positions.length / 3
      : undefined

  const sourcePanel =
    mode !== 'idle' &&
    (imageSrc || mode === 'webcam')

  const modelLabel =
    faceData
      ? 'RECONSTRUCTED HEAD'
      : 'BLANK HEAD'

  const controlHint =
    'DRAG ROTATE · PINCH / WHEEL ZOOM'

  const timestampLabel =
    useMemo(
      () =>
        sourceTimestamp ||
        'Waiting for source',
      [sourceTimestamp],
    )

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070708] text-white">
      <BootLoader />
      <RotateOverlay />

      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_65%_45%,rgba(120,95,255,.14),transparent_32%),radial-gradient(circle_at_18%_30%,rgba(140,255,106,.07),transparent_26%)]" />

      <div className="absolute inset-0 z-0">
        {mode === 'webcam' && (
          <video
            ref={videoRef}
            className="pointer-events-none h-full w-full object-cover opacity-[0.14]"
            style={{
              transform:
                'scaleX(-1)',
            }}
            playsInline
            muted
            autoPlay
          />
        )}

        <div className="absolute inset-0 bg-[#070708]/65" />
        <div className="scanlines absolute inset-0 opacity-25" />
      </div>

      <Canvas
        className="!absolute inset-0 z-10"
        gl={{
          antialias: true,
          alpha: true,
          powerPreference:
            'high-performance',
        }}
        dpr={[1, 1.5]}
      >
        <Suspense fallback={null}>
          <PerspectiveCamera
            makeDefault
            position={[0, 0, 5.2]}
            fov={42}
          />

          <ambientLight intensity={1.15} />

          <directionalLight
            position={[2, 3, 4]}
            intensity={1.65}
          />

          <pointLight
            position={[-2.5, 0.5, 2]}
            intensity={1.35}
            color="#8cff6a"
          />

          <pointLight
            position={[2.2, 1, 1.5]}
            intensity={1.15}
            color="#9b7cff"
          />

          <BlankHead
            visible={
              showBlankHead ||
              !faceData
            }
          />

          {faceData && (
            <FaceMesh3D
              faceData={faceData}
              texture={
                mode === 'upload'
                  ? imageSrc
                  : null
              }
              showWireframe={
                showWireframe
              }
              showPoints={
                showPoints
              }
              reconstructionKey={`${assetVersion}-${mode}`}
            />
          )}

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.075}
            minDistance={2.4}
            maxDistance={8}
            rotateSpeed={0.72}
            zoomSpeed={0.8}
            panSpeed={0.35}
            enablePan
            screenSpacePanning
          />
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3 sm:p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="glass-panel border-white/10 px-4 py-3 shadow-glass">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_18px_rgba(140,255,106,.8)]" />

              <div>
                <h1 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-white">
                  Neural Face Scanner
                </h1>

                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.24em] text-zinc-500">
                  3D facial surface reconstruction
                </p>
              </div>
            </div>
          </div>

          <div className="glass-panel hidden border-white/10 px-3 py-2 sm:block">
            <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-500">
              {modelReadyText}
            </p>
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center py-6">
          <div className="grid w-full grid-cols-1 gap-3 lg:grid-cols-[minmax(230px,0.78fr)_minmax(360px,1.4fr)]">
            <AnimatePresence mode="wait">
              {sourcePanel ? (
                <motion.aside
                  key="source-panel"
                  initial={{
                    opacity: 0,
                    x: -18,
                  }}
                  animate={{
                    opacity: 1,
                    x: 0,
                  }}
                  className="glass-panel pointer-events-auto flex min-h-[260px] flex-col border-white/10 p-3 shadow-glass"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-accent">
                        SOURCE
                      </p>

                      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-500">
                        Persistent reference
                      </p>
                    </div>

                    <span className="font-mono text-[8px] text-zinc-600">
                      {mode === 'webcam'
                        ? 'LIVE'
                        : 'IMAGE'}
                    </span>
                  </div>

                  <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                    {mode ===
                      'upload' &&
                      imageSrc && (
                        <img
                          src={imageSrc}
                          alt="Uploaded face source"
                          className="h-full min-h-[230px] w-full object-contain"
                        />
                      )}

                    {mode ===
                      'webcam' && (
                      <video
                        ref={
                          videoRef
                        }
                        className="h-full min-h-[230px] w-full object-cover"
                        style={{
                          transform:
                            'scaleX(-1)',
                        }}
                        playsInline
                        muted
                        autoPlay
                      />
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                    <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
                      <span className="rounded-lg border border-white/10 bg-black/55 px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-300 backdrop-blur-md">
                        {landmarkCount
                          ? `${landmarkCount} LANDMARKS`
                          : 'ANALYZING'}
                      </span>

                      <span className="rounded-lg border border-white/10 bg-black/55 px-2 py-1 font-mono text-[8px] text-zinc-500 backdrop-blur-md">
                        {timestampLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="font-mono text-[8px] uppercase tracking-[0.18em] text-zinc-600">
                      Asset name
                    </label>

                    <input
                      value={sourceName}
                      onChange={(event) => {
                        setSourceName(
                          event.target.value,
                        )
                        setAssetSaved(
                          false,
                        )
                      }}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[10px] text-white outline-none transition focus:border-accent/40"
                      maxLength={80}
                    />
                  </div>
                </motion.aside>
              ) : (
                <div className="hidden lg:block" />
              )}
            </AnimatePresence>

            <div className="glass-panel relative min-h-[440px] overflow-hidden border-white/10 shadow-glass lg:min-h-[560px]">
              <div className="pointer-events-none absolute left-4 top-4 z-10">
                <p className="font-mono text-[9px] uppercase tracking-[0.26em] text-accent">
                  3D RECONSTRUCTION
                </p>

                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-zinc-600">
                  {modelLabel}
                </p>
              </div>

              <div className="pointer-events-none absolute right-4 top-4 z-10 text-right">
                <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-zinc-600">
                  {controlHint}
                </p>
              </div>

              <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex gap-2">
                <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.14em] text-zinc-600 backdrop-blur-md">
                  X/Y/Z FACE SPACE
                </span>

                <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[7px] uppercase tracking-[0.14em] text-zinc-600 backdrop-blur-md">
                  TRIANGULATED
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${status}-${subStatus}`}
              initial={{
                opacity: 0,
                y: 12,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                y: -12,
              }}
              className="mx-auto"
            >
              <StatusBox
                status={status}
                subStatus={subStatus}
                landmarks={
                  landmarkCount
                }
              />
            </motion.div>
          </AnimatePresence>

          {error && (
            <div className="glass-panel mx-auto max-w-xl border-red-400/20 px-4 py-3 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-red-200">
              {error}
            </div>
          )}

          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
            {mode === 'idle' && (
              <>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  onChange={
                    handleImageUpload
                  }
                  className="hidden"
                />

                <HudButton
                  onClick={() =>
                    inputRef.current?.click()
                  }
                >
                  UPLOAD IMAGE
                </HudButton>

                <HudButton
                  onClick={startWebcam}
                  variant="accent"
                >
                  LIVE WEBCAM
                </HudButton>
              </>
            )}

            {faceData && (
              <>
                <HudButton
                  onClick={() =>
                    setShowBlankHead(
                      (value) =>
                        !value,
                    )
                  }
                  title="Toggle blank head"
                >
                  {showBlankHead
                    ? 'HEAD ON'
                    : 'HEAD OFF'}
                </HudButton>

                <HudButton
                  onClick={() =>
                    setShowWireframe(
                      (value) =>
                        !value,
                    )
                  }
                  title="Toggle triangulation"
                >
                  {showWireframe
                    ? 'TRIANGLES ON'
                    : 'TRIANGLES OFF'}
                </HudButton>

                <HudButton
                  onClick={() =>
                    setShowPoints(
                      (value) =>
                        !value,
                    )
                  }
                  title="Toggle landmarks"
                >
                  {showPoints
                    ? 'POINTS ON'
                    : 'POINTS OFF'}
                </HudButton>

                {mode ===
                  'upload' && (
                  <HudButton
                    onClick={
                      saveAsset
                    }
                    variant="accent"
                    disabled={
                      assetSaved
                    }
                  >
                    {assetSaved
                      ? 'ASSET SAVED'
                      : 'SAVE ASSET'}
                  </HudButton>
                )}

                <HudButton
                  onClick={reset}
                  variant="danger"
                >
                  RESET
                </HudButton>
              </>
            )}
          </div>

          <footer className="flex items-center justify-between gap-4 py-1">
            <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-zinc-600">
              MediaPipe · Three.js · React · Local Asset Store
            </div>

            <div className="text-right font-mono text-[8px] uppercase tracking-[0.2em] text-zinc-600">
              <div>
                {mode === 'webcam'
                  ? 'MIRROR-SAFE LIVE PIPELINE'
                  : 'SOURCE-LOCKED RECONSTRUCTION'}
              </div>

              <div className="mt-1">
                TEJAS / NEURAL LAB
              </div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  )
}

export default App
