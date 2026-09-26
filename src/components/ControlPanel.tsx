import { useRef } from 'react'

interface ControlPanelProps {
  onTextureChange: (texture: string) => void
  onColorChange: (color: string) => void
  onScaleChange: (scale: number) => void
  onPositionChange: (pos: [number, number]) => void
  textureScale: number
  texturePosition: [number, number]
}

export default function ControlPanel({
  onTextureChange,
  onColorChange,
  onScaleChange,
  onPositionChange,
  textureScale,
  texturePosition
}: ControlPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        if (event.target?.result) {
          onTextureChange(event.target.result as string)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const colors = ['#ffffff', '#111111', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff']

  return (
    <div className="bg-black/70 backdrop-blur-lg rounded-2xl p-4 shadow-2xl border border-white/10">
      <div className="mb-4">
        <h3 className="text-white text-sm font-bold mb-2">T-Shirt Color</h3>
        <div className="grid grid-cols-8 gap-2">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              className="w-7 h-7 rounded-full border border-white/20 hover:scale-110 transition-transform"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="mb-4">
        <h3 className="text-white text-sm font-bold mb-2">Design</h3>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*"
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors active:scale-95"
        >
          Upload Image
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-white text-xs font-bold">Design Size</span>
            <span className="text-white/60 text-xs">{textureScale.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="3"
            step="0.1"
            value={textureScale}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span className="text-white text-xs font-bold">Move Left/Right</span>
            <span className="text-white/60 text-xs">{texturePosition[0].toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="-0.5"
            max="0.5"
            step="0.05"
            value={texturePosition[0]}
            onChange={(e) => onPositionChange([parseFloat(e.target.value), texturePosition[1]])}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
        
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-white text-xs font-bold">Move Up/Down</span>
            <span className="text-white/60 text-xs">{texturePosition[1].toFixed(2)}</span>
          </div>
          <input
            type="range"
            min="-0.5"
            max="0.5"
            step="0.05"
            value={texturePosition[1]}
            onChange={(e) => onPositionChange([texturePosition[0], parseFloat(e.target.value)])}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>
      </div>
    </div>
  )
}
