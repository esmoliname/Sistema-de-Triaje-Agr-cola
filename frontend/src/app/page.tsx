'use client';

import { useState, useRef, useEffect } from 'react';

interface TriageResponse {
  diagnostico: string;
  confianza: number;
  fase: string;
  tratamiento: string;
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [result, setResult] = useState<TriageResponse | null>(null);
  const [error, setError] = useState<string>('');

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const currentStream = videoRef.current.srcObject as MediaStream;
      currentStream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setError('');
    setResult(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setError(
        'El navegador actual no soporta acceso a dispositivos de cámara (MediaDevices API).'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      streamRef.current = stream;
      setIsCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setError(
        'No se pudo acceder a la cámara. Verifica los permisos del navegador o conecta un dispositivo de captura.'
      );
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {
        // Reproducción automática gestionada por el atributo autoPlay/playsInline
      });
    }
  }, [isCameraActive]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current) {
      setError('El visor de cámara no está disponible para capturar el frame.');
      return;
    }

    setError('');
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const context = canvas.getContext('2d');
    if (!context) {
      setError('No se pudo inicializar el contexto gráfico 2D del lienzo.');
      return;
    }

    // a) Dibuja el frame actual del <video> en el <canvas>
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // b) Extrae la imagen en Base64 usando canvas.toDataURL('image/jpeg')
    const base64Image = canvas.toDataURL('image/jpeg');

    // c) Activa el estado de carga y detiene la cámara temporalmente
    setIsLoading(true);
    stopCamera();

    try {
      // d) Petición POST al backend FastAPI (soporta túnel HTTPS dinámico o proxy Next.js)
      const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || '';
      const response = await fetch(`${BACKEND_URL}/api/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image_base64: base64Image }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.detail || `Error del servidor (${response.status})`
        );
      }

      // e) Recibe TriageResponse y la guarda en result
      const data: TriageResponse = await response.json();
      setResult(data);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Error al conectar con el servidor de análisis fitosanitario.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewScan = () => {
    setResult(null);
    setError('');
    startCamera();
  };

  return (
    <main className="min-h-screen w-full px-4 py-10 sm:px-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-4xl flex flex-col gap-8">
        {/* Encabezado Principal */}
        <header className="text-center space-y-2">
          <p className="text-xs font-mono uppercase tracking-[0.25em] text-emerald-400/80">
            Hydrogen Vision · Bio-Telemetry Unit
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight cyber-text-glow">
            Sistema de Triaje Fitosanitario
          </h1>
          <p className="text-sm sm:text-base text-emerald-100/70 max-w-2xl mx-auto">
            Diagnóstico asistido por visión artificial para detección temprana de
            patógenos foliares en cultivos de banano y piña.
          </p>
        </header>

        {/* Contenedor Central del Escáner */}
        <section className="cyber-glass-panel rounded-2xl p-6 sm:p-8 flex flex-col items-center gap-6">
          {/* Visor de Cámara / Estado del Escáner */}
          <div className="relative w-full max-w-2xl aspect-video rounded-xl overflow-hidden bg-black/70 border border-emerald-500/30 flex items-center justify-center">
            {isCameraActive ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {/* Superposición (Overlay) tipo Visor de Escáner */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="relative w-3/4 h-3/4 border border-emerald-400/35 rounded-lg">
                    {/* Esquinas del visor biométrico */}
                    <span className="absolute -top-0.5 -left-0.5 w-6 h-6 border-t-2 border-l-2 border-emerald-400 rounded-tl" />
                    <span className="absolute -top-0.5 -right-0.5 w-6 h-6 border-t-2 border-r-2 border-emerald-400 rounded-tr" />
                    <span className="absolute -bottom-0.5 -left-0.5 w-6 h-6 border-b-2 border-l-2 border-emerald-400 rounded-bl" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 border-b-2 border-r-2 border-emerald-400 rounded-br" />

                    {/* Línea de barrido láser */}
                    <div className="cyber-scan-line" />

                    {/* Etiqueta de telemetría */}
                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-emerald-300/90">
                      <span>OPTICAL SENSOR: ACTIVE</span>
                      <span>TARGET: FOLIAR TISSUE</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center px-6 py-12 gap-3">
                {isLoading ? (
                  <>
                    <div className="w-12 h-12 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                    <p className="text-base font-medium cyber-text-glow">
                      Procesando matriz OpenCV y consultando Hydrogen API...
                    </p>
                    <p className="text-xs font-mono text-emerald-200/60">
                      EVALUANDO PATRONES DE NECROSIS Y CLOROSIS FOLIAR
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 flex items-center justify-center text-emerald-300 font-mono text-sm">
                      CAM
                    </div>
                    <p className="text-sm sm:text-base text-emerald-100/80">
                      {result
                        ? 'Captura completada. Revisa el informe fitosanitario inferior o inicia un nuevo escaneo.'
                        : 'Activa la cámara trasera para enfocar la muestra foliar dentro del retículo de escaneo.'}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Canvas oculto para captura de frame */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Mensajes de Error */}
          {error && (
            <div
              role="alert"
              className="w-full max-w-2xl rounded-xl border border-red-400/40 bg-red-950/40 px-4 py-3 text-sm text-red-200 flex items-center justify-between gap-4"
            >
              <span>{error}</span>
            </div>
          )}

          {/* Botones de Acción */}
          <div className="flex flex-wrap items-center justify-center gap-4 w-full">
            {!isCameraActive && !result && (
              <button
                id="btn-activate-camera"
                type="button"
                onClick={startCamera}
                disabled={isLoading}
                className="cyber-button"
              >
                Activar Cámara
              </button>
            )}

            {isCameraActive && (
              <button
                id="btn-scan-leaf"
                type="button"
                onClick={captureAndAnalyze}
                disabled={isLoading}
                className="cyber-button"
              >
                {isLoading ? 'Analizando...' : 'Escanear Hoja'}
              </button>
            )}

            {(result || isCameraActive || error) && (
              <button
                id="btn-new-scan"
                type="button"
                onClick={handleNewScan}
                disabled={isLoading}
                className="cyber-button"
              >
                Nuevo Escaneo
              </button>
            )}
          </div>
        </section>

        {/* Panel de Resultados Condicional */}
        {result && (
          <section
            aria-label="Resultados del Triaje Fitosanitario"
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            {/* Tarjeta: Diagnóstico */}
            <article className="cyber-glass-panel rounded-2xl p-6 flex flex-col justify-between gap-3">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400/80">
                Diagnóstico Detectado
              </span>
              <h2 className="text-xl sm:text-2xl font-bold cyber-text-glow">
                {result.diagnostico}
              </h2>
            </article>

            {/* Tarjeta: Confianza con Barra de Progreso Visual */}
            <article className="cyber-glass-panel rounded-2xl p-6 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono uppercase tracking-wider text-emerald-400/80">
                  Nivel de Confianza Biométrica
                </span>
                <span className="text-xl font-bold font-mono cyber-text-glow">
                  {result.confianza.toFixed(1)}%
                </span>
              </div>
              <div className="w-full h-3 rounded-full bg-emerald-950/80 border border-emerald-500/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-300 transition-all duration-500"
                  style={{
                    width: `${Math.min(Math.max(result.confianza, 0), 100)}%`,
                  }}
                />
              </div>
            </article>

            {/* Tarjeta: Fase */}
            <article className="cyber-glass-panel rounded-2xl p-6 flex flex-col justify-between gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400/80">
                Fase de Desarrollo Patológico
              </span>
              <p className="text-base sm:text-lg font-semibold text-emerald-50">
                {result.fase}
              </p>
            </article>

            {/* Tarjeta: Tratamiento */}
            <article className="cyber-glass-panel rounded-2xl p-6 flex flex-col justify-between gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400/80">
                Protocolo de Tratamiento Recomendado
              </span>
              <p className="text-sm sm:text-base leading-relaxed text-emerald-100/90">
                {result.tratamiento}
              </p>
            </article>
          </section>
        )}
      </div>
    </main>
  );
}
