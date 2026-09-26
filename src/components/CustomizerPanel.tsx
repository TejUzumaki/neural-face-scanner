interface CustomizerPanelProps {
  title: string
  colors: string[]
  activeColor: string
  onColorChange: (color: string) => void
}

export default function CustomizerPanel({ title, colors, activeColor, onColorChange }: CustomizerPanelProps) {
  return (
    <div className="mb-6">
      <h3 className="text-white text-xs font-bold mb-2">{title}</h3>
      <div className="grid grid-cols-4 gap-2">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            className={`w-10 h-10 rounded-full border-2 transition-transform hover:scale-110 ${activeColor === c ? 'border-white scale-110' : 'border-transparent'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  )
}
