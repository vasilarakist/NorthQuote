'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import { RotateCcw } from 'lucide-react'

interface Props {
  onSave: (dataUrl: string) => void
  width?: number
  height?: number
}

export function SignaturePad({ onSave, width = 500, height = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPoint = useRef<{ x: number; y: number } | null>(null)
  const [hasContent, setHasContent] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0F1C2E'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    isDrawing.current = true
    lastPoint.current = getPos(e)
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y)
    setHasContent(true)
    canvas.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPoint.current = pos
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    if (!isDrawing.current) return
    isDrawing.current = false
    lastPoint.current = null
    // Auto-save on each stroke
    const canvas = canvasRef.current!
    onSave(canvas.toDataURL('image/png'))
  }

  const handleClear = useCallback(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
    onSave('')
  }, [onSave])

  return (
    <div className="space-y-2">
      <div className="relative rounded-lg border-2 border-dashed border-gray-300 bg-white overflow-hidden touch-none"
        style={{ aspectRatio: `${width}/${height}` }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className="w-full h-full cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
        {!hasContent && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-300 text-sm select-none">Sign here</p>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>Draw your signature above</span>
        {hasContent && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RotateCcw size={11} /> Clear
          </button>
        )}
      </div>
    </div>
  )
}
