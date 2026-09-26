import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function BootLoader() {
  const [progress, setProgress] = useState(0)
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) { clearInterval(interval); return 100; }
        return prev + 1
      })
    }, 30)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (progress === 100) {
      const timeout = setTimeout(() => setIsVisible(false), 600)
      return () => clearTimeout(timeout)
    }
  }, [progress])

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div 
          className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center"
          exit={{ opacity: 0, visibility: 'hidden', transition: { duration: 0.8, ease: 'easeInOut' } }}
        >
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: [0.165, 0.84, 0.44, 1] }}
            className="text-center"
          >
            <div className="text-6xl font-light tracking-tighter font-mono text-white">{progress}%</div>
            <div className="text-sm mt-2 text-gray-500 uppercase tracking-[0.3em] font-sans">Initializing Core</div>
            <div className="w-64 h-[2px] bg-zinc-800 mt-10 overflow-hidden rounded-full">
              <div className="h-full bg-white transition-all duration-100 ease-linear" style={{ width: `${progress}%` }}></div>
            </div>
          </motion.div>
          <div className="absolute bottom-10 text-center text-xs text-zinc-700 uppercase tracking-[0.2em] leading-relaxed font-sans">
            Neural Scanner<br>Made by Tejas — Enjoy the Tech
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function RotateOverlay() {
  const [isPortrait, setIsPortrait] = useState(false)

  useEffect(() => {
    const check = () => setIsPortrait(window.innerHeight > window.innerWidth)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <AnimatePresence>
      {isPortrait && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] bg-black flex flex-col items-center justify-center gap-6"
        >
          <motion.svg 
            className="w-12 h-12 stroke-white"
            viewBox="0 0 24 24" fill="none" strokeWidth="1.5"
            animate={{ rotate: [0, 90] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <rect x="5" y="2" width="14" height="20" rx="2"></rect>
            <line x1="12" y1="18" x2="12" y2="18"></line>
          </motion.svg>
          <div className="text-sm uppercase tracking-[0.3em] text-gray-400 font-mono">Rotate to Landscape</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface StatusBoxProps { status: string; subStatus?: string; }
export function StatusBox({ status, subStatus }: StatusBoxProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="bg-black/70 border border-white/10 backdrop-blur-md px-5 py-2.5 rounded-lg text-center min-w-[280px] max-w-[90vw] pointer-events-none"
    >
      <div className="text-[13px] font-medium tracking-wider text-white font-mono whitespace-nowrap overflow-hidden text-ellipsis">{status}</div>
      {subStatus && <div className="text-[10px] text-gray-500 font-medium uppercase tracking-[0.2em] font-mono mt-0.5">{subStatus}</div>}
    </motion.div>
  )
}

interface HudButtonProps { children: React.ReactNode; onClick: () => void; variant?: 'default' | 'danger' | 'accent'; }
export function HudButton({ children, onClick, variant = 'default' }: HudButtonProps) {
  const variants = {
    default: 'border-white/10 text-gray-400 hover:text-white hover:border-white',
    danger: 'border-danger/50 text-danger hover:text-white hover:border-danger',
    accent: 'border-accent/50 text-accent hover:text-black hover:bg-accent'
  }
  return (
    <button 
      onClick={onClick}
      className={`w-11 h-11 flex items-center justify-center bg-black/70 border rounded-lg backdrop-blur-md transition-all duration-200 active:scale-90 ${variants[variant]}`}
    >
      {children}
    </button>
  )
}
