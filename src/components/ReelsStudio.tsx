import React, { useEffect, useRef, useState } from 'react';
import { Download, Film, Square, Upload, Video } from 'lucide-react';
import { ActiveBattle, BattleHistoryEntry, CameraPreset } from '../types/battle';
import { updateBattleHistoryReels, uploadReelsToStorage } from '../services/battleStore';
import { Battlefield3D } from './Battlefield3D';

interface ReelsStudioProps {
  battle: ActiveBattle;
  history: BattleHistoryEntry[];
  onNotify: (msg: string) => void;
}

export const ReelsStudio: React.FC<ReelsStudioProps> = ({ battle, history, onNotify }) => {
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number>(0);

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('cinematic');
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>('');
  const [uploadedUrl, setUploadedUrl] = useState<string>('');

  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [recording]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    };
  }, [recordedUrl]);

  const drawVerticalReelsFrame = () => {
    const src = sourceCanvasRef.current;
    const dst = compositeCanvasRef.current;
    if (!src || !dst) return;
    const ctx = dst.getContext('2d');
    if (!ctx) return;

    const W = dst.width; // 720
    const H = dst.height; // 1280

    ctx.fillStyle = '#070B12';
    ctx.fillRect(0, 0, W, H);

    // Center-crop 3D WebGL canvas into 9:16 vertical frame
    const srcRatio = src.width / Math.max(1, src.height);
    const dstRatio = W / H;
    let sx = 0;
    let sy = 0;
    let sw = src.width;
    let sh = src.height;
    if (srcRatio > dstRatio) {
      sw = src.height * dstRatio;
      sx = (src.width - sw) / 2;
    } else {
      sh = src.width / dstRatio;
      sy = (src.height - sh) / 2;
    }
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, W, H);

    // Top & bottom cinematic scrims
    const topGrad = ctx.createLinearGradient(0, 0, 0, 260);
    topGrad.addColorStop(0, 'rgba(7,11,18,0.92)');
    topGrad.addColorStop(1, 'rgba(7,11,18,0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, W, 260);

    const botGrad = ctx.createLinearGradient(0, H - 240, 0, H);
    botGrad.addColorStop(0, 'rgba(7,11,18,0)');
    botGrad.addColorStop(1, 'rgba(7,11,18,0.92)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, H - 240, W, 240);

    // Matchup Header Overlay
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      `${battle.opponentFlag} ${battle.opponentCountryName.toUpperCase()}  VS  ${battle.homeCountryName.toUpperCase()} ${battle.homeFlag}`,
      W / 2,
      82
    );

    ctx.font = 'bold 42px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fb7185';
    ctx.textAlign = 'left';
    ctx.fillText(battle.opponentRemaining.toLocaleString('tr-TR'), 48, 148);

    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(battle.homeRemaining.toLocaleString('tr-TR'), W - 48, 148);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 22px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('@kirmizivemavitakim · Canlı 3B Savaş', W / 2, H - 64);
  };

  const startRecording = () => {
    const composite = compositeCanvasRef.current;
    if (!composite || !sourceCanvasRef.current) {
      onNotify('3B sahne henüz hazır değil.');
      return;
    }

    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedBlob(null);
    setRecordedUrl('');
    setUploadedUrl('');
    setElapsedSec(0);
    chunksRef.current = [];

    const renderLoop = () => {
      drawVerticalReelsFrame();
      rafRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    const stream = composite.captureStream(30);
    const mimeCandidates = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm',
    ];
    const selectedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    const recorder = selectedMime
      ? new MediaRecorder(stream, { mimeType: selectedMime, videoBitsPerSecond: 3_500_000 })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      cancelAnimationFrame(rafRef.current);
      const blob = new Blob(chunksRef.current, { type: selectedMime || 'video/mp4' });
      setRecordedBlob(blob);
      setRecordedUrl(URL.createObjectURL(blob));
      setRecording(false);
    };

    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  const handleUploadToFirebase = async () => {
    if (!recordedBlob) return;
    setUploading(true);
    try {
      const ext = recordedBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = `reels_${battle.opponentCountryCode}_vs_${battle.homeCountryCode}.${ext}`;
      const result = await uploadReelsToStorage(recordedBlob, filename);
      setUploadedUrl(result.url);
      if (selectedHistoryId) {
        await updateBattleHistoryReels(selectedHistoryId, result.url, result.path);
      }
      onNotify('Reels videosu Firebase Storage alanına başarıyla yüklendi.');
    } catch (err) {
      onNotify(
        err instanceof Error
          ? `Firebase Storage yükleme hatası: ${err.message}`
          : 'Firebase Storage yüklemesi başarısız.'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4 sm:gap-6">
      {/* Live 3D Stage Preview */}
      <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-3.5 sm:p-4 space-y-3 sm:space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-white">3B Reels Kayıt Sahnesi</h3>
            <p className="text-[11px] sm:text-xs text-slate-400">
              9:16 dikey Instagram Reels videosu yakalamak için canlı 3B sahneyi kullanır.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Video className="w-4 h-4" />
                <span>Kaydı Başlat</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Square className="w-4 h-4" />
                <span>Durdur ({elapsedSec} sn)</span>
              </button>
            )}
          </div>
        </div>

        <div className="h-[240px] sm:h-[380px] rounded-xl overflow-hidden border border-slate-800">
          <Battlefield3D
            battle={battle}
            cameraPreset={cameraPreset}
            onCameraPresetChange={setCameraPreset}
            onCanvasReady={(c) => {
              sourceCanvasRef.current = c;
            }}
          />
        </div>

        <canvas ref={compositeCanvasRef} width={720} height={1280} className="hidden" />
      </div>

      {/* Export & Firebase Storage Upload Panel */}
      <div className="rounded-xl bg-[#0D1422] border border-slate-800 p-3.5 sm:p-4 space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 sm:w-5 sm:h-5 text-sky-400" />
          <h3 className="font-display text-base sm:text-lg font-bold text-white">Dikey Reels Çıktısı</h3>
        </div>

        {recordedUrl ? (
          <div className="space-y-3 sm:space-y-4">
            <div className="mx-auto w-40 sm:w-56 aspect-[9/16] rounded-xl overflow-hidden border border-slate-700 bg-black">
              <video src={recordedUrl} controls className="w-full h-full object-cover" />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Savaş Geçmişi Kaydına Bağla (İsteğe Bağlı)
              </label>
              <select
                value={selectedHistoryId}
                onChange={(e) => setSelectedHistoryId(e.target.value)}
                className="w-full rounded-lg bg-[#090E18] border border-slate-700 px-3 py-2 text-sm sm:text-xs text-slate-200"
              >
                <option value="">Geçmiş kaydı seçilmedi</option>
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.opponentCountryName} vs {h.homeCountryName} · Kazanan: {h.winnerName}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={recordedUrl}
                download={`reels_${battle.opponentCountryCode}_vs_${battle.homeCountryCode}.mp4`}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Videoyu İndir</span>
              </a>

              <button
                type="button"
                disabled={uploading}
                onClick={handleUploadToFirebase}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>{uploading ? 'Yükleniyor...' : 'Storage’a Yükle'}</span>
              </button>
            </div>

            {uploadedUrl && (
              <div className="rounded-lg bg-emerald-950/40 border border-emerald-500/40 p-3 text-xs text-emerald-300 break-all">
                Yüklendi:{' '}
                <a href={uploadedUrl} target="_blank" rel="noreferrer" className="underline">
                  {uploadedUrl}
                </a>
              </div>
            )}
          </div>
        ) : (
          <div className="h-[180px] sm:h-[320px] flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 text-center p-4 sm:p-6 space-y-2">
            <Film className="w-7 h-7 sm:w-8 sm:h-8 text-slate-600" />
            <p className="text-sm font-medium text-slate-300">Henüz Reels Kaydı Yok</p>
            <p className="text-xs text-slate-500 max-w-xs">
              3B sahneden "Kaydı Başlat" butonuna basarak 9:16 dikey video oluşturabilir ve cihazınıza indirebilirsiniz. Storage yüklemesi için Güvenlik sekmesinden Google hesabınızı bağlayın.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
