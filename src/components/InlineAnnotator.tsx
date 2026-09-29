import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Square,
  MoveRight,
  PenTool,
  EyeOff,
  Type,
  Undo2,
  Trash2,
  Check,
  X,
} from 'lucide-react';

type Tool = 'box' | 'arrow' | 'pen' | 'blur' | 'text';

interface Point {
  x: number;
  y: number;
}

const COLORS = [
  { hex: '#EB5757', label: 'Bug Red' },
  { hex: '#F2994A', label: 'Orange' },
  { hex: '#5E6AD2', label: 'Linear Indigo' },
  { hex: '#27AE60', label: 'Green' },
  { hex: '#FFFFFF', label: 'White' },
];

interface InlineAnnotatorProps {
  imageSrc: string;
  onSave: (annotatedDataUrl: string) => void;
  onCancel: () => void;
}

export const InlineAnnotator: React.FC<InlineAnnotatorProps> = ({
  imageSrc,
  onSave,
  onCancel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [currentTool, setCurrentTool] = useState<Tool>('box');
  const [currentColor, setCurrentColor] = useState<string>('#EB5757');
  const [canUndo, setCanUndo] = useState(false);

  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const historyRef = useRef<ImageData[]>([]);
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<Point>({ x: 0, y: 0 });

  const saveHistoryState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const state = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(state);
    if (historyRef.current.length > 25) {
      historyRef.current.shift();
    }
    setCanUndo(historyRef.current.length > 1);
  }, []);

  const restoreLastState = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || historyRef.current.length === 0) return;

    const last = historyRef.current[historyRef.current.length - 1];
    ctx.putImageData(last, 0, 0);
  };

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      baseImageRef.current = img;
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        saveHistoryState();
      }
    };
    img.src = imageSrc;
  }, [imageSrc, saveHistoryState]);

  const getCanvasPoint = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!baseImageRef.current) return;
    isDrawingRef.current = true;
    const pt = getCanvasPoint(e);
    startPointRef.current = pt;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (currentTool === 'text') {
      const text = prompt('Enter annotation note:');
      if (text && text.trim()) {
        ctx.save();
        ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const metrics = ctx.measureText(text);
        const padding = 8;
        const boxWidth = metrics.width + padding * 2;
        const boxHeight = 32;

        ctx.fillStyle = currentColor;
        ctx.beginPath();
        ctx.roundRect(pt.x, pt.y - boxHeight + 4, boxWidth, boxHeight, 4);
        ctx.fill();

        ctx.fillStyle = currentColor === '#FFFFFF' ? '#000000' : '#FFFFFF';
        ctx.fillText(text, pt.x + padding, pt.y - 6);
        ctx.restore();
        saveHistoryState();
      }
      isDrawingRef.current = false;
      return;
    }

    if (currentTool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const current = getCanvasPoint(e);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (currentTool === 'pen') {
      ctx.lineTo(current.x, current.y);
      ctx.stroke();
      return;
    }

    restoreLastState();

    if (currentTool === 'box') {
      const x = Math.min(startPointRef.current.x, current.x);
      const y = Math.min(startPointRef.current.y, current.y);
      const w = Math.abs(current.x - startPointRef.current.x);
      const h = Math.abs(current.y - startPointRef.current.y);

      ctx.save();
      ctx.strokeStyle = currentColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    } else if (currentTool === 'arrow') {
      const headLength = 20;
      const dx = current.x - startPointRef.current.x;
      const dy = current.y - startPointRef.current.y;
      const angle = Math.atan2(dy, dx);

      ctx.save();
      ctx.strokeStyle = currentColor;
      ctx.fillStyle = currentColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(startPointRef.current.x, startPointRef.current.y);
      ctx.lineTo(current.x, current.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(current.x, current.y);
      ctx.lineTo(
        current.x - headLength * Math.cos(angle - Math.PI / 6),
        current.y - headLength * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        current.x - headLength * Math.cos(angle + Math.PI / 6),
        current.y - headLength * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (currentTool === 'blur') {
      const x = Math.min(startPointRef.current.x, current.x);
      const y = Math.min(startPointRef.current.y, current.y);
      const w = Math.abs(current.x - startPointRef.current.x);
      const h = Math.abs(current.y - startPointRef.current.y);

      ctx.save();
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }
  };

  const handleMouseUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    saveHistoryState();
  };

  const handleUndo = () => {
    if (historyRef.current.length > 1) {
      historyRef.current.pop();
      const prev = historyRef.current[historyRef.current.length - 1];
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      if (ctx && prev) {
        ctx.putImageData(prev, 0, 0);
      }
      setCanUndo(historyRef.current.length > 1);
    }
  };

  const handleClear = () => {
    if (!baseImageRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(baseImageRef.current, 0, 0);
      historyRef.current = [];
      saveHistoryState();
    }
  };

  const handleFinish = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSave(dataUrl);
  };

  return (
    <div className="inline-annotator-overlay">
      {/* Top Toolbar */}
      <div className="inline-annotator-toolbar">
        <div className="tool-group">
          <button
            type="button"
            className={`tool-btn-sm ${currentTool === 'box' ? 'active' : ''}`}
            onClick={() => setCurrentTool('box')}
            title="Box"
          >
            <Square size={14} />
          </button>
          <button
            type="button"
            className={`tool-btn-sm ${currentTool === 'arrow' ? 'active' : ''}`}
            onClick={() => setCurrentTool('arrow')}
            title="Arrow"
          >
            <MoveRight size={14} />
          </button>
          <button
            type="button"
            className={`tool-btn-sm ${currentTool === 'pen' ? 'active' : ''}`}
            onClick={() => setCurrentTool('pen')}
            title="Pen"
          >
            <PenTool size={14} />
          </button>
          <button
            type="button"
            className={`tool-btn-sm ${currentTool === 'blur' ? 'active' : ''}`}
            onClick={() => setCurrentTool('blur')}
            title="Redact PII"
          >
            <EyeOff size={14} />
          </button>
          <button
            type="button"
            className={`tool-btn-sm ${currentTool === 'text' ? 'active' : ''}`}
            onClick={() => setCurrentTool('text')}
            title="Text"
          >
            <Type size={14} />
          </button>
        </div>

        <div className="tool-divider" />

        {/* Colors */}
        <div className="color-group">
          {COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              className={`color-dot-sm ${currentColor === c.hex ? 'active' : ''}`}
              style={{ backgroundColor: c.hex }}
              onClick={() => setCurrentColor(c.hex)}
            />
          ))}
        </div>

        <div className="tool-divider" />

        <div className="action-group">
          <button
            type="button"
            className="action-btn-sm"
            onClick={handleUndo}
            disabled={!canUndo}
            title="Undo"
          >
            <Undo2 size={14} />
          </button>
          <button
            type="button"
            className="action-btn-sm"
            onClick={handleClear}
            title="Clear"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Canvas viewport */}
      <div className="inline-canvas-container">
        <canvas
          ref={canvasRef}
          className="inline-canvas"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />
      </div>

      {/* Bottom Footer Actions */}
      <div className="inline-annotator-footer">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onCancel}
        >
          <X size={14} />
          <span>Cancel</span>
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleFinish}
        >
          <Check size={14} />
          <span>Save & Attach</span>
        </button>
      </div>
    </div>
  );
};
