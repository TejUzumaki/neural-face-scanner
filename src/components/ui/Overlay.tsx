import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export function BootLoader() {
  const [progress, setProgress] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    let frame = 0
    let started = 0

    const tick = (time: number) => {
      if (!started) {
        started = time
      }

      const elapsed = time - started
      const next = Math.min(
        100,
        Math.round((elapsed / 1300) * 100),
      )

      setProgress(next)

      if (next < 100) {
        frame = requestAnimationFrame(tick)
      } else {
        window.setTimeout(() => {
          setVisible(false)
        }, 280)
      }
    }

    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center bg-[#070708]"
          initial={{ opacity: 1 }}
          exit={{
            opacity: 0,
            transition: {
              duration: 0.5,
            },
          }}
        >
          <div className="w-[min(420px,78vw)]">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-zinc-500">
                  Neural Face Scanner
                </p>

                <p className="mt-2 font-mono text-xs uppercase tracking-[0.22em] text-zinc-300">
                  Initializing vision core
                </p>
              </div>

              <span className="font-mono text-4xl font-light tracking-tighter text-white">
                {progress}%
              </span>
            </div>

            <div className="h-px overflow-hidden bg-white/10">
              <motion.div
                className="h-full bg-accent"
                animate={{
                  width: `${progress}%`,
                }}
                transition={{
                  duration: 0.08,
                  ease: 'linear',
                }}
              />
            </div>

            <p className="mt-4 text-right font-mono text-[9px] uppercase tracking-[0.32em] text-zinc-600">
              Browser-local landmark processing
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function RotateOverlay() {
  const [portrait, setPortrait] = useState(false)

  useEffect(() => {
    const update = () => {
      setPortrait(
        window.innerHeight > window.innerWidth,
      )
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener(
      'orientationchange',
      update,
    )

    return () => {
      window.removeEventListener(
        'resize',
        update,
      )

      window.removeEventListener(
        'orientationchange',
        update,
      )
    }
  }, [])

  return (
    <AnimatePresence>
      {portrait && (
        <motion.div
          className="pointer-events-none fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-full border border-white/10 bg-black/70 px-4 py-2 backdrop-blur-xl"
          initial={{
            opacity: 0,
            y: 20,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          exit={{
            opacity: 0,
            y: 20,
          }}
        >
          <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-zinc-400">
            Landscape gives the scanner more room
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface StatusBoxProps {
  status: string
  subStatus: string
  landmarks?: number
}

export function StatusBox({
  status,
  subStatus,
  landmarks,
}: StatusBoxProps) {
  return (
    <motion.div
      layout
      className="glass-panel min-w-[240px] border-white/10 px-5 py-3 text-center"
    >
      <div className="flex items-center justify-center gap-2">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent shadow-[0_0_14px_rgba(140,255,106,.85)]" />

        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-white">
          {status}
        </p>
      </div>

      <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.24em] text-zinc-500">
        {subStatus}

        {typeof landmarks === 'number'
          ? ` · ${landmarks} POINTS`
          : ''}
      </p>
    </motion.div>
  )
}

interface HudButtonProps {
  children: ReactNode
  onClick: () => void
  variant?: 'default' | 'danger' | 'accent'
  disabled?: boolean
  title?: string
}

export function HudButton({
  children,
  onClick,
  variant = 'default',
  disabled = false,
  title,
}: HudButtonProps) {
  const tone =
    variant === 'danger'
      ? 'border-red-400/20 text-red-300 hover:bg-red-400/10'
      : variant === 'accent'
        ? 'border-accent/30 text-accent hover:bg-accent/10'
        : 'border-white/10 text-white hover:bg-white/10'

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`glass-panel pointer-events-auto inline-flex min-h-11 items-center justify-center gap-2 border px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      {children}
    </button>
  )
}
