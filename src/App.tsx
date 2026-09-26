import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import { Canvas } from '@react-three/fiber'
import {
  AnimatePresence,
  motion,
} from 'framer-motion'
import * as vision from '@mediapipe/tasks-vision'

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

const WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm'

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'

function normalizeLandmarks(
  landmarks: vision.NormalizedLandmark[],
): FaceData {
  const positions = new Float32Array(
    landmarks.length * 3,
  )

  const uvs = new Float32Array(
    landmarks.length * 2,
  )

  for (
    let i = 0;
    i < landmarks.length;
    i += 1
  ) {
    const landmark = landmarks[i]

    const x =
      (landmark.x - 0.5) * 2.65

    const y =
      -(landmark.y - 0.5) * 2.65

    const z =
      -landmark.z * 2.05

    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z

    uvs[i * 2] = landmark.x
    uvs[i * 2 + 1] =
      1 - landmark.y
  }

  return {
    positions,
    uvs,
  }
}

function App() {
  const [mode, setMode] =
    useState<Mode>('idle')

  const [faceData, setFaceData] =
    useState<FaceData | null>(null)

  const [imageSrc, setImageSrc] =
    useState<string | null>(null)

  const [status, setStatus] =
    useState('AWAITING NEURAL INPUT')

  const [subStatus, setSubStatus] =
    useState('STATE: IDLE')

  const [modelReady, setModelReady] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const inputRef =
    useRef<HTMLInputElement>(null)

  const imageRef =
    useRef<HTMLImageElement | null>(null)

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

  const stopWebcam =
    useCallback(() => {
      stopAnimationLoop()

      streamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.stop()
        })

      streamRef.current = null

      lastVideoTimeRef.current = -1

      setScannerMode('idle')
      setFaceData(null)

      setStatus(
        'AWAITING NEURAL INPUT',
      )

      setSubStatus('STATE: IDLE')
    }, [
      setScannerMode,
      stopAnimationLoop,
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

      streamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.stop()
        })

      streamRef.current = null

      landmarkerRef.current?.close()

      landmarkerRef.current = null

      if (objectUrlRef.current) {
        URL.revokeObjectURL(
          objectUrlRef.current,
        )
      }
    }
  }, [stopAnimationLoop])

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

        if (!file) {
          return
        }

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

        setError(null)

        setScannerMode('upload')

        setStatus(
          'ANALYZING IMAGE',
        )

        setSubStatus(
          'STATE: LANDMARK EXTRACTION',
        )

        setFaceData(null)

        try {
          await switchRunningMode(
            'IMAGE',
          )

          const url =
            URL.createObjectURL(
              file,
            )

          if (objectUrlRef.current) {
            URL.revokeObjectURL(
              objectUrlRef.current,
            )
          }

          objectUrlRef.current = url

          const image =
            new Image()

          imageRef.current = image

          image.src = url

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

          setImageSrc(url)

          setFaceData(
            normalizeLandmarks(
              landmarks,
            ),
          )

          setStatus(
            'MORPHING INTO 3D',
          )

          setSubStatus(
            'STATE: RECONSTRUCTION',
          )

          window.setTimeout(() => {
            if (
              modeRef.current ===
              'upload'
            ) {
              setStatus(
                '3D RECONSTRUCTION COMPLETE',
              )

              setSubStatus(
                'STATE: READY',
              )
            }
          }, 1500)
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
            setFaceData(
              normalizeLandmarks(
                landmarks,
              ),
            )

            setStatus(
              'LIVE NEURAL TRACKING',
            )

            setSubStatus(
              'STATE: TRACKING',
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

      streamRef.current
        ?.getTracks()
        .forEach((track) => {
          track.stop()
        })

      setError(null)

      setScannerMode('webcam')

      setStatus(
        'REQUESTING CAMERA',
      )

      setSubStatus(
        'STATE: PERMISSION',
      )

      setFaceData(null)
      setImageSrc(null)

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
          'STATE: CALIBRATING',
        )

        lastVideoTimeRef.current =
          -1

        rafRef.current =
          requestAnimationFrame(
            scanVideoFrame,
          )
      } catch (err) {
        console.error(err)

        streamRef.current
          ?.getTracks()
          .forEach((track) => {
            track.stop()
          })

        streamRef.current = null

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
      modelReady,
      scanVideoFrame,
      setScannerMode,
      stopAnimationLoop,
      switchRunningMode,
    ])

  const reset =
    useCallback(() => {
      stopWebcam()

      setFaceData(null)
      setImageSrc(null)
      setError(null)

      setStatus(
        'AWAITING NEURAL INPUT',
      )

      setSubStatus(
        'STATE: IDLE',
      )
    }, [stopWebcam])

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070708] text-white">
      <BootLoader />

      <RotateOverlay />

      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_50%_45%,rgba(120,95,255,.12),transparent_34%),radial-gradient(circle_at_20%_20%,rgba(140,255,106,.06),transparent_28%)]" />

      <div className="absolute inset-0 z-0">
        {mode === 'webcam' && (
          <video
            ref={videoRef}
            className="h-full w-full object-cover opacity-60"
            style={{
              transform:
                'scaleX(-1)',
            }}
            playsInline
            muted
            autoPlay
          />
        )}

        {mode === 'upload' &&
          imageSrc && (
            <img
              src={imageSrc}
              alt="Uploaded face source"
              className="h-full w-full object-cover opacity-55"
            />
          )}

        <div className="absolute inset-0 bg-[#070708]/25" />

        <div className="scanlines absolute inset-0 opacity-30" />
      </div>

      <Canvas
        className="!absolute inset-0 z-10"
        camera={{
          position: [0, 0, 5],
          fov: 42,
        }}
        dpr={[1, 1.5]}
        gl={{
          antialias: true,
          alpha: true,
          powerPreference:
            'high-performance',
        }}
      >
        <Suspense fallback={null}>
          <ambientLight
            intensity={1.1}
          />

          <directionalLight
            position={[2, 3, 4]}
            intensity={1.7}
          />

          <pointLight
            position={[-2, 0, 2]}
            intensity={1.3}
            color="#8cff6a"
          />

          <pointLight
            position={[2, 1, 1]}
            intensity={1.1}
            color="#9b7cff"
          />

          {faceData && (
            <FaceMesh3D
              faceData={faceData}
              texture={
                mode === 'upload'
                  ? imageSrc
                  : null
              }
            />
          )}
        </Suspense>
      </Canvas>

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6">
        <header className="flex items-start justify-between gap-3">
          <div className="glass-panel border-white/10 px-4 py-3 shadow-glass">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_18px_rgba(140,255,106,.8)]" />

              <div>
                <h1 className="font-mono text-xs font-bold uppercase tracking-[0.28em] text-white">
                  Neural Face Scanner
                </h1>

                <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.24em] text-zinc-500">
                  478-point browser reconstruction
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {mode !== 'idle' && (
              <HudButton
                onClick={reset}
                variant="danger"
                title="Reset scanner"
              >
                RESET
              </HudButton>
            )}
          </div>
        </header>

        <section className="mx-auto flex w-full max-w-3xl flex-col items-center gap-4">
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
            >
              <StatusBox
                status={status}
                subStatus={subStatus}
                landmarks={
                  faceData?.positions
                    .length
                    ? faceData.positions
                        .length / 3
                    : undefined
                }
              />
            </motion.div>
          </AnimatePresence>

          {error && (
            <div className="glass-panel max-w-xl border-red-400/20 px-4 py-3 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-red-200">
              {error}
            </div>
          )}

          {mode === 'idle' && (
            <motion.div
              initial={{
                opacity: 0,
                y: 20,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              transition={{
                delay: 1.7,
              }}
              className="pointer-events-auto flex flex-col gap-2 sm:flex-row"
            >
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
            </motion.div>
          )}
        </section>

        <footer className="flex items-end justify-between gap-4">
          <div className="glass-panel border-white/10 px-3 py-2 font-mono text-[8px] uppercase tracking-[0.2em] text-zinc-500">
            MediaPipe · Three.js · React
          </div>

          <div className="text-right font-mono text-[8px] uppercase tracking-[0.2em] text-zinc-600">
            <div>
              LOCAL VISION PIPELINE
            </div>

            <div className="mt-1">
              TEJAS / NEURAL LAB
            </div>
          </div>
        </footer>
      </div>
    </main>
  )
}

export default App
