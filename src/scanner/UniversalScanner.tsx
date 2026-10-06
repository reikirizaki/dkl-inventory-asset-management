import React, { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { Camera, RefreshCw, Zap, ZapOff, AlertCircle, Keyboard, CheckCircle, Upload } from 'lucide-react';

interface UniversalScannerProps {
  onScan: (decodedText: string) => void;
  onClose?: () => void;
  active?: boolean;
}

export const UniversalScanner: React.FC<UniversalScannerProps> = ({ onScan, onClose, active = true }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [hasCamera, setHasCamera] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isDecodingFile, setIsDecodingFile] = useState(false);

  // Play audio beep feedback
  const playBeep = useCallback(() => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // AudioContext may be blocked by autoplay rules
    }
  }, []);

  const handleScanSuccess = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || trimmed === lastScanned) return;
      playBeep();
      setLastScanned(trimmed);
      onScan(trimmed);
      setTimeout(() => setLastScanned(null), 2500);
    },
    [lastScanned, onScan, playBeep]
  );

  const stopScanner = useCallback(() => {
    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset();
      } catch (e) {
        console.warn('Error resetting zxing reader:', e);
      }
      zxingReaderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    stopScanner();
    setPermissionError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasCamera(false);
      setPermissionError('Browser ini tidak mendukung akses kamera secara langsung. Silakan gunakan input manual.');
      setShowManualInput(true);
      return;
    }

    try {
      // 0. Pre-check if any videoinput devices are present
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        if (devices.length > 0 && videoDevices.length === 0) {
          setHasCamera(false);
          setPermissionError('Kamera tidak terdeteksi pada perangkat ini. Silakan gunakan input manual di bawah.');
          setShowManualInput(true);
          return;
        }
      } catch {
        // Enumerate error is non-fatal; continue to getUserMedia
      }

      // 1. Attempt back/environment camera first, then fallback to any camera
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
      } catch (firstErr: any) {
        const isDeviceNotFound =
          firstErr.name === 'NotFoundError' ||
          firstErr.name === 'DevicesNotFoundError' ||
          firstErr.name === 'OverconstrainedError' ||
          String(firstErr.message || '').includes('Requested device not found');

        if (isDeviceNotFound) {
          // Retry with generic video constraint (e.g. desktop webcam)
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (secondErr: any) {
            throw secondErr;
          }
        } else {
          throw firstErr;
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setHasCamera(true);

      // Check flashlight support
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities: any = videoTrack?.getCapabilities ? videoTrack.getCapabilities() : {};
      if (capabilities.torch) {
        setHasTorch(true);
      }

      // Check if BarcodeDetector is supported natively in modern Chrome/Android/Edge
      if ('BarcodeDetector' in window) {
        const barcodeDetector = new (window as any).BarcodeDetector({
          formats: ['code_128', 'code_39', 'qr_code', 'ean_13', 'ean_8'],
        });

        const detectFrame = async () => {
          if (!videoRef.current || !streamRef.current) return;
          try {
            if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
              const barcodes = await barcodeDetector.detect(videoRef.current);
              if (barcodes.length > 0) {
                handleScanSuccess(barcodes[0].rawValue);
              }
            }
          } catch (e) {
            console.debug('Native detect error:', e);
          }
          if (streamRef.current) {
            requestAnimationFrame(detectFrame);
          }
        };

        requestAnimationFrame(detectFrame);
        return;
      }

      // 2. Fallback to ZXing reader
      const reader = new BrowserMultiFormatReader();
      zxingReaderRef.current = reader;

      const decodeFrame = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            const result = await reader.decodeFromVideoElement(videoRef.current);
            if (result) {
              handleScanSuccess(result.getText());
            }
          }
        } catch {
          // Expected when frame doesn't contain a valid barcode
        }
        if (streamRef.current) {
          setTimeout(decodeFrame, 250);
        }
      };

      decodeFrame();
    } catch (err: any) {
      setHasCamera(false);
      const isNotFound =
        err.name === 'NotFoundError' ||
        err.name === 'DevicesNotFoundError' ||
        err.name === 'OverconstrainedError' ||
        String(err.message || '').includes('Requested device not found');

      if (isNotFound) {
        console.info('UniversalScanner: kamera hardware tidak terdeteksi pada perangkat ini.');
        setPermissionError('Kamera tidak ditemukan pada perangkat ini. Silakan gunakan tombol Input Manual di bawah.');
        setShowManualInput(true);
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        console.info('UniversalScanner: izin kamera belum diberikan oleh pengguna.');
        setPermissionError('Izin akses kamera ditolak. Silakan izinkan kamera di pengaturan browser Anda atau gunakan input manual.');
        setShowManualInput(true);
      } else {
        console.warn('UniversalScanner: kamera tidak dapat dibuka:', err.message || err.name);
        setPermissionError('Tidak dapat membuka kamera. Pastikan kamera tidak sedang digunakan oleh aplikasi lain.');
        setShowManualInput(true);
      }
    }
  }, [handleScanSuccess, stopScanner]);

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (e) {
        console.warn('Torch constraint error:', e);
      }
    }
  };

  useEffect(() => {
    if (active) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [active, startScanner, stopScanner]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      handleScanSuccess(manualCode.trim());
      setManualCode('');
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDecodingFile(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result as string;
        try {
          const zxing = new BrowserMultiFormatReader();
          const img = new Image();
          img.src = dataUrl;
          await new Promise((res) => {
            img.onload = res;
          });
          const result = await zxing.decodeFromImageElement(img);
          if (result && result.getText()) {
            handleScanSuccess(result.getText());
          } else {
            alert('Tidak dapat mendeteksi Barcode atau QR Code pada foto yang dipilih. Silakan gunakan foto yang lebih jelas atau ketik manual.');
          }
        } catch {
          alert('Barcode atau QR Code tidak terdeteksi pada gambar. Pastikan gambar cukup terang dan fokus.');
        } finally {
          setIsDecodingFile(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsDecodingFile(false);
    }
  };

  return (
    <div className="relative w-full max-w-lg mx-auto bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-sky-800">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />
      {/* Scanner Viewport */}
      <div className="relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

        {/* Reticle Overlay */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="relative w-64 h-64 border-2 border-sky-400/80 rounded-2xl shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]">
            {/* Animated Laser scanning line */}
            <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent animate-pulse" />
            <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-sky-300" />
            <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-sky-300" />
            <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-sky-300" />
            <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-sky-300" />
          </div>
        </div>

        {/* Last scanned feedback banner */}
        {lastScanned && (
          <div className="absolute top-4 inset-x-4 bg-emerald-500/90 text-white font-semibold text-sm px-4 py-2 rounded-xl flex items-center gap-2 backdrop-blur-md shadow-lg animate-bounce">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <span className="truncate">Terdeteksi: {lastScanned}</span>
          </div>
        )}

        {/* Permission / Error Notice */}
        {permissionError && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center text-white">
            <AlertCircle className="w-12 h-12 text-rose-400 mb-3" />
            <p className="text-sm font-medium mb-4 text-slate-200">{permissionError}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                type="button"
                onClick={startScanner}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
              >
                <RefreshCw className="w-4 h-4" /> Coba Lagi
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isDecodingFile}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
              >
                <Upload className="w-4 h-4" /> {isDecodingFile ? 'Memproses...' : 'Unggah Foto Barcode'}
              </button>
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition"
              >
                <Keyboard className="w-4 h-4" /> Input Manual
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-slate-300">
        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2.5 rounded-xl text-sm font-medium transition ${
                torchOn ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Flashlight"
            >
              {torchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
            </button>
          )}

          <button
            type="button"
            onClick={startScanner}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            title="Restart Kamera"
          >
            <RefreshCw className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDecodingFile}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1 text-xs"
            title="Unggah Foto Barcode / QR"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span className="hidden sm:inline">Foto</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowManualInput(!showManualInput)}
          className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-950/60 border border-sky-800/60 transition"
        >
          <Keyboard className="w-4 h-4" />
          {showManualInput ? 'Tutup Manual' : 'Input Manual'}
        </button>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
          >
            Tutup
          </button>
        )}
      </div>

      {/* Manual Code Input Bar */}
      {showManualInput && (
        <form onSubmit={handleManualSubmit} className="p-4 bg-slate-950 border-t border-slate-800 flex gap-2">
          <input
            type="text"
            placeholder="Masukkan Kode Aset / Barcode..."
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
            autoFocus
          />
          <button
            type="submit"
            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm rounded-xl transition shadow-md shadow-sky-900/40"
          >
            Cari
          </button>
        </form>
      )}
    </div>
  );
};
