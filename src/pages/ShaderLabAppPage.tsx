import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';

export const ShaderLabAppPage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [amplitude, setAmplitude] = useState(32);
  const [frequency, setFrequency] = useState(0.035);
  const [speed, setSpeed] = useState(1.2);
  const [wireframeOnly, setWireframeOnly] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let time = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(320, Math.floor(rect.width * window.devicePixelRatio));
      canvas.height = Math.max(240, Math.floor(rect.height * window.devicePixelRatio));
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      time += 0.016 * speed;
      const w = canvas.width;
      const h = canvas.height;
      ctx.fillStyle = '#09090B';
      ctx.fillRect(0, 0, w, h);

      const cols = 38;
      const rows = 26;
      const cellW = w / cols;
      const cellH = (h * 0.65) / rows;
      const offsetY = h * 0.25;

      const points: Array<Array<{ x: number; y: number; z: number }>> = [];
      for (let r = 0; r <= rows; r++) {
        const rowPts = [];
        for (let c = 0; c <= cols; c++) {
          const nx = c * cellW;
          const wave =
            Math.sin(c * frequency * 8 + time) * Math.cos(r * frequency * 8 + time * 0.8) * amplitude * window.devicePixelRatio;
          const perspectiveX = (c - cols / 2) * (cellW * (0.75 + (r / rows) * 0.45)) + w / 2;
          const perspectiveY = offsetY + r * cellH + wave;
          rowPts.push({ x: perspectiveX, y: perspectiveY, z: wave });
        }
        points.push(rowPts);
      }

      ctx.lineWidth = Math.max(1, window.devicePixelRatio * 0.85);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p1 = points[r][c];
          const p2 = points[r][c + 1];
          const p3 = points[r + 1][c];
          const intensity = Math.min(1, Math.max(0.18, 0.45 + p1.z / (amplitude * 2.2)));
          ctx.strokeStyle = `rgba(129, 140, 248, ${intensity.toFixed(2)})`;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.lineTo(p3.x, p3.y);
          if (!wireframeOnly) {
            ctx.fillStyle = `rgba(99, 102, 241, ${(intensity * 0.16).toFixed(2)})`;
            ctx.fill();
          }
          ctx.stroke();
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [amplitude, frequency, speed, wireframeOnly]);

  const exportPreset = () => {
    const data = JSON.stringify({ amplitude, frequency, speed, wireframeOnly }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'g-wave-preset.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#09090B] text-zinc-100 flex flex-col">
      <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/products/g-wave-shaderlab"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Product Page</span>
          </Link>
          <span className="text-sm font-semibold font-display">G-Wave ShaderLab Live</span>
        </div>
        <button
          type="button"
          onClick={exportPreset}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Preset JSON</span>
        </button>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12">
        <div className="lg:col-span-9 relative min-h-[420px]">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
        <aside className="lg:col-span-3 p-6 border-t lg:border-t-0 lg:border-s border-zinc-800 bg-[#111114] space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-white mb-4">Procedural Mesh Parameters</h2>
            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-zinc-400">Wave Amplitude</span>
                  <span className="font-mono tabular-nums">{amplitude}</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={80}
                  value={amplitude}
                  onChange={(e) => setAmplitude(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-zinc-400">Spatial Frequency</span>
                  <span className="font-mono tabular-nums">{frequency.toFixed(3)}</span>
                </div>
                <input
                  type="range"
                  min={0.01}
                  max={0.09}
                  step={0.005}
                  value={frequency}
                  onChange={(e) => setFrequency(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-zinc-400">Phase Speed</span>
                  <span className="font-mono tabular-nums">{speed.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <label className="flex items-center justify-between pt-2 cursor-pointer">
                <span className="text-zinc-300">Wireframe Only</span>
                <input
                  type="checkbox"
                  checked={wireframeOnly}
                  onChange={(e) => setWireframeOnly(e.target.checked)}
                  className="accent-indigo-500"
                />
              </label>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
