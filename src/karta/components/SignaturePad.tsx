import { useEffect, useRef, useState } from 'react';
import { Eraser, PenTool, ShieldAlert } from 'lucide-react';
import { SignatureConfig } from '../shared/types';

interface Props {
  value: SignatureConfig;
  onChange: (next: SignatureConfig) => void;
}

export function SignaturePad({ value, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [typedText, setTypedText] = useState(value.signerName || '');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#1E3A8A';
  }, [mode]);

  const getCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!drawing) return;
    setDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange({ ...value, signatureDataUrl: canvas.toDataURL('image/png') });
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setTypedText('');
    onChange({ ...value, signatureDataUrl: '' });
  };

  const generateTypedSignaturePng = (name: string) => {
    setTypedText(name);
    if (!name.trim()) {
      onChange({ ...value, signerName: '', signatureDataUrl: '' });
      return;
    }
    const offscreen = document.createElement('canvas');
    offscreen.width = 440;
    offscreen.height = 130;
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, offscreen.width, offscreen.height);
      ctx.fillStyle = '#1E3A8A';
      ctx.font = 'italic 42px "Source Serif 4", Georgia, serif';
      ctx.textBaseline = 'middle';
      ctx.fillText(name.trim().slice(0, 28), 18, 66);
      ctx.strokeStyle = '#93C5FD';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(16, 102);
      ctx.lineTo(410, 102);
      ctx.stroke();
    }
    onChange({
      ...value,
      signerName: value.signerName || name,
      signatureDataUrl: offscreen.toDataURL('image/png'),
    });
  };

  return (
    <div className="space-y-4">
      <div className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-lg text-xs text-[#92400E] flex items-start gap-2">
        <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-[#B45309]" />
        <div>
          <strong className="text-[#78350F]">Draft Visual Signature Only (Not Aadhaar e-Sign / DSC):</strong>{' '}
          Aadhaar e-Sign / DSC APIs are not configured. Capturing a signature embeds a visual placeholder into your exported DOCX/PDF; execute final documents via wet ink or a licensed CCA e-Sign ESP.
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div>
          <label className="block font-medium text-[#202124] mb-1">Executant / Signer Name</label>
          <input
            type="text"
            value={value.signerName}
            onChange={(e) => onChange({ ...value, signerName: e.target.value })}
            placeholder="Full legal name"
            className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
          />
        </div>
        <div>
          <label className="block font-medium text-[#202124] mb-1">Signer Role</label>
          <input
            type="text"
            value={value.signerRole}
            onChange={(e) => onChange({ ...value, signerRole: e.target.value })}
            placeholder="e.g., Deponent / Licensor / Executant"
            className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
          />
        </div>
        <div>
          <label className="block font-medium text-[#202124] mb-1">Place of Signing</label>
          <input
            type="text"
            value={value.signedAtPlace}
            onChange={(e) => onChange({ ...value, signedAtPlace: e.target.value })}
            placeholder="e.g., Silvassa / Bengaluru"
            className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setMode('draw')}
              className={`px-3 py-1 text-xs font-semibold rounded-md ${
                mode === 'draw' ? 'bg-white text-[#202124] shadow-2xs' : 'text-slate-600'
              }`}
            >
              Draw Signature
            </button>
            <button
              type="button"
              onClick={() => setMode('type')}
              className={`px-3 py-1 text-xs font-semibold rounded-md ${
                mode === 'type' ? 'bg-white text-[#202124] shadow-2xs' : 'text-slate-600'
              }`}
            >
              Type Signature
            </button>
          </div>

          <button
            type="button"
            onClick={clearSignature}
            className="inline-flex items-center gap-1 text-xs text-[#FF671F] hover:underline cursor-pointer"
          >
            <Eraser className="w-3.5 h-3.5" />
            Clear Signature
          </button>
        </div>

        {mode === 'draw' ? (
          <div className="bg-white border border-slate-200 rounded-xl p-2">
            <canvas
              ref={canvasRef}
              width={480}
              height={130}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              className="w-full h-28 bg-[#F7F8FA] rounded-lg border border-dashed border-slate-300 touch-none cursor-crosshair"
            />
            <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1">
              <PenTool className="w-3 h-3" />
              Draw inside the box above with mouse, trackpad, or touch.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={typedText}
              onChange={(e) => generateTypedSignaturePng(e.target.value)}
              placeholder="Type your name to render signature..."
              className="w-full h-10 px-3 text-sm bg-white border border-slate-300 rounded-lg text-[#202124]"
            />
            {value.signatureDataUrl && (
              <div className="p-2 bg-white border border-slate-200 rounded-lg inline-block">
                <img
                  src={value.signatureDataUrl}
                  alt="Generated draft signature preview"
                  className="h-14 object-contain"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
        <div>
          <label className="block font-medium text-slate-700 mb-1">Witness 1 Name (Optional)</label>
          <input
            type="text"
            value={value.witness1Name || ''}
            onChange={(e) => onChange({ ...value, witness1Name: e.target.value })}
            placeholder="Independent Witness 1 full name"
            className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
          />
        </div>
        <div>
          <label className="block font-medium text-slate-700 mb-1">Witness 2 Name (Optional)</label>
          <input
            type="text"
            value={value.witness2Name || ''}
            onChange={(e) => onChange({ ...value, witness2Name: e.target.value })}
            placeholder="Independent Witness 2 full name"
            className="w-full h-9 px-2.5 bg-white border border-slate-300 rounded-lg text-[#202124]"
          />
        </div>
      </div>
    </div>
  );
}
