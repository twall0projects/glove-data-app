"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Square, RefreshCcw, UploadCloud, ArrowLeft, Layers,
  Keyboard, Loader2, ChevronRight, ChevronLeft, FileVideo, Zap
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import JSZip from "jszip";

// ─── Teleprompter Word List ───────────────────────────────────────────────────
const WORD_LIST: { category: string; signs: string[] }[] = [
  { category: "Greetings/Closing",  signs: ["Hello", "Goodbye", "See you later", "See you tomorrow", "Nice to meet you"] },
  { category: "Politeness",         signs: ["Please", "Thank you", "You're welcome", "Sorry", "Excuse me"] },
  { category: "Basics",             signs: ["Yes", "No", "Maybe", "Good", "Bad", "Same", "Different"] },
  { category: "People",             signs: ["I/Me", "You", "He/She/It", "We/Us", "They/Them", "Friend", "Family", "Man", "Woman", "Child"] },
  { category: "Questions",          signs: ["Who", "What", "Where", "When", "Why", "How", "Which"] },
  { category: "Verbs",              signs: ["Go", "Come", "Have", "Want", "Need", "Like", "Love", "Eat", "Drink", "See", "Stop", "Help", "Make", "Play", "Feel", "Think", "Chat", "Sign", "Ask", "Sleep", "Wake up", "Sit", "Stand", "Buy", "Sell", "Start", "Finish"] },
  { category: "Time/Place",         signs: ["Day", "Night", "Morning", "Afternoon", "Home", "School", "Work", "Time"] },
  { category: "Descriptors",        signs: ["Big", "Small", "Hot", "Cold", "New", "Old", "More", "Few", "Many", "Excited", "Tired", "Angry", "Scared", "Surprised"] },
  { category: "Numbers/Alpha",      signs: ["1","2","3","4","5","6","7","8","9","10","Fingerspelling A-Z"] },
  { category: "Conversations",      signs: [
    "HELLO MY NAME IS [Fingerspell Name]",
    "HOW YOU?", "PLEASE SIGN SLOW", "PLEASE SIGN AGAIN",
    "UNDERSTAND?", "MEANING WHAT?", "BATHROOM WHERE?",
    "TIME WHAT?", "I DON'T UNDERSTAND",
  ]},
];

const ALL_SIGNS = WORD_LIST.flatMap(c => c.signs);
const CONV_SIGNS = new Set(WORD_LIST.find(c => c.category === "Conversations")?.signs ?? []);

interface UnifiedPayload {
  video: { blob: Blob; url: string };
  frameSequence: Blob[];
}

export default function RecordPage() {
  const router      = useRouter();
  const videoRef    = useRef<HTMLVideoElement>(null);
  const uploadVideoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null);
  const frameSequenceRef   = useRef<Blob[]>([]);
  const sequenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef          = useRef<MediaStream | null>(null);
  const countdownTimerRef  = useRef<NodeJS.Timeout | null>(null);

  // Identity
  const [contributor, setContributor] = useState<string>("guest");
  const [email,       setEmail]       = useState<string>("");
  const [fluency,     setFluency]     = useState<string>("new");

  // Annotation
  const [label,      setLabel]      = useState<string>("");
  const [isSentence, setIsSentence] = useState(false);

  // Teleprompter
  const [teleprompterOn,    setTeleprompterOn]    = useState(false);
  const [teleprompterIndex, setTeleprompterIndex] = useState(0);

  // Mode
  const [mode,       setMode]       = useState<"camera" | "upload">("camera");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);

  // Recording state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecording,    setIsRecording]    = useState(false);
  const [recordingTime,  setRecordingTime]  = useState(0);
  const [timerInterval,  setTimerInterval]  = useState<NodeJS.Timeout | null>(null);
  const [countdown,      setCountdown]      = useState<number | null>(null);
  const [countdownSecs,  setCountdownSecs]  = useState<number>(3);

  // Payload / preview
  const [capturedPayload, setCapturedPayload] = useState<UnifiedPayload | null>(null);
  const [previewFrame,    setPreviewFrame]    = useState(0);
  const [frameUrls,       setFrameUrls]       = useState<string[]>([]);
  const [isUploading,     setIsUploading]     = useState(false);

  // Camera settings (always visible)
  const [brightness, setBrightness] = useState(100);
  const [contrast,   setContrast]   = useState(100);
  const [zoom,       setZoom]       = useState(1.0);

  // Face blur
  const [faceBlur, setFaceBlur] = useState(false);
  const faceBlurRef = useRef(false);
  faceBlurRef.current = faceBlur;

  // Stale-closure guards
  const isRecordingRef       = useRef(false);  isRecordingRef.current = isRecording;
  const capturedPayloadRef   = useRef<UnifiedPayload | null>(null); capturedPayloadRef.current = capturedPayload;
  const isCameraActiveRef    = useRef(false);  isCameraActiveRef.current = isCameraActive;
  const zoomRef              = useRef(1.0);    zoomRef.current = zoom;

  // ─── Identity ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const c = localStorage.getItem("glove_contributor");
    const e = localStorage.getItem("glove_email");
    const f = localStorage.getItem("glove_fluency");
    if (!c || !e) { router.push("/"); return; }
    setContributor(c);
    setEmail(e);
    setFluency(f || "new");
  }, [router]);

  // ─── Teleprompter sync ───────────────────────────────────────────────────────
  useEffect(() => {
    if (teleprompterOn) {
      const sign = ALL_SIGNS[teleprompterIndex];
      setLabel(sign);
      setIsSentence(CONV_SIGNS.has(sign));
    }
  }, [teleprompterOn, teleprompterIndex]);

  // ─── Frame Preview ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (capturedPayload && capturedPayload.frameSequence.length > 0) {
      const urls = capturedPayload.frameSequence.map(b => URL.createObjectURL(b));
      setFrameUrls(urls);
      setPreviewFrame(0);
      const id = setInterval(() => setPreviewFrame(p => (p + 1) % urls.length), 100);
      return () => { clearInterval(id); urls.forEach(u => URL.revokeObjectURL(u)); };
    }
  }, [capturedPayload]);

  // ─── Camera ──────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; setIsCameraActive(true); }
    } catch (err) { console.error("Camera error:", err); }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    if (mode === "camera") startCamera();
    return () => stopCamera();
  }, [mode, startCamera, stopCamera]);

  // ─── Frame Grab (with real face blur) ────────────────────────────────────────
  const grabFrame = async (sourceEl?: HTMLVideoElement): Promise<Blob | null> => {
    const el = sourceEl || videoRef.current;
    if (!el || el.videoWidth === 0) return null;

    const w = el.videoWidth;
    const h = el.videoHeight;

    const canvas = document.createElement("canvas");
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Apply zoom by cropping from center
    const z = zoomRef.current;
    const sw = w / z, sh = h / z;
    const sx = (w - sw) / 2, sy = (h - sh) / 2;
    ctx.drawImage(el, sx, sy, sw, sh, 0, 0, w, h);

    // ── Face blur: pixelate the top 45% of the frame ──────────────────────────
    if (faceBlurRef.current) {
      const blurH = Math.floor(h * 0.45);
      const BLOCK = 20; // pixel block size for mosaic anonymization

      // Grab existing pixels from the already-drawn frame top portion
      const imageData = ctx.getImageData(0, 0, w, blurH);
      const data = imageData.data;

      // Pixelate: average each BLOCK×BLOCK region
      for (let by = 0; by < blurH; by += BLOCK) {
        for (let bx = 0; bx < w; bx += BLOCK) {
          let r = 0, g = 0, b = 0, count = 0;
          for (let py = by; py < Math.min(by + BLOCK, blurH); py++) {
            for (let px = bx; px < Math.min(bx + BLOCK, w); px++) {
              const i = (py * w + px) * 4;
              r += data[i]; g += data[i+1]; b += data[i+2]; count++;
            }
          }
          r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
          for (let py = by; py < Math.min(by + BLOCK, blurH); py++) {
            for (let px = bx; px < Math.min(bx + BLOCK, w); px++) {
              const i = (py * w + px) * 4;
              data[i] = r; data[i+1] = g; data[i+2] = b;
            }
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    return new Promise(resolve => canvas.toBlob(b => resolve(b), "image/jpeg", 0.90));
  };

  // ─── Unified Capture ─────────────────────────────────────────────────────────
  const startUnifiedCapture = useCallback(async () => {
    if (!videoRef.current?.srcObject) return;
    frameSequenceRef.current = [];
    sequenceIntervalRef.current = setInterval(async () => {
      const blob = await grabFrame();
      if (blob) frameSequenceRef.current.push(blob);
    }, 100);

    const stream = streamRef.current;
    if (!stream) return;

    let opts: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) opts = { mimeType: "video/webm;codecs=vp9" };
    else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) opts = { mimeType: "video/webm;codecs=vp8" };
    else if (MediaRecorder.isTypeSupported("video/webm")) opts = { mimeType: "video/webm" };
    else if (MediaRecorder.isTypeSupported("video/mp4"))  opts = { mimeType: "video/mp4" };

    const mr = new MediaRecorder(stream, opts);
    mediaRecorderRef.current = mr;
    const chunks: BlobPart[] = [];
    mr.ondataavailable = e => { if (e.data?.size > 0) chunks.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunks, { type: mr.mimeType || "video/webm" });
      setCapturedPayload({ video: { blob, url: URL.createObjectURL(blob) }, frameSequence: [...frameSequenceRef.current] });
      stopCamera();
    };
    mr.start(200);
    setIsRecording(true);
    setRecordingTime(0);
    setTimerInterval(setInterval(() => setRecordingTime(p => p + 1), 1000));
  }, [stopCamera]);

  const stopUnifiedCapture = useCallback(() => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerInterval) clearInterval(timerInterval);
      if (sequenceIntervalRef.current) clearInterval(sequenceIntervalRef.current);
    }
  }, [timerInterval]);

  // ─── Countdown → Start ────────────────────────────────────────────────────────
  const triggerCapture = useCallback(() => {
    if (capturedPayloadRef.current || !isCameraActiveRef.current) return;
    if (isRecordingRef.current) { stopUnifiedCapture(); return; }
    if (countdownSecs === 0) { startUnifiedCapture(); return; }
    setCountdown(countdownSecs);
    let rem = countdownSecs;
    countdownTimerRef.current = setInterval(() => {
      rem--;
      if (rem <= 0) { clearInterval(countdownTimerRef.current!); setCountdown(null); startUnifiedCapture(); }
      else setCountdown(rem);
    }, 1000);
  }, [countdownSecs, startUnifiedCapture, stopUnifiedCapture]);

  // ─── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (["INPUT","TEXTAREA","SELECT"].includes(tag)) return;
      if (e.code === "Space")       { e.preventDefault(); if (mode === "camera") triggerCapture(); }
      if (e.code === "ArrowRight" && teleprompterOn) setTeleprompterIndex(i => (i + 1) % ALL_SIGNS.length);
      if (e.code === "ArrowLeft"  && teleprompterOn) setTeleprompterIndex(i => (i - 1 + ALL_SIGNS.length) % ALL_SIGNS.length);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, triggerCapture, teleprompterOn]);

  // ─── File Upload ──────────────────────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    setUploadFile(file);
    setIsExtractingFrames(true);
    const videoEl = uploadVideoRef.current!;
    videoEl.src = URL.createObjectURL(file);
    await new Promise(r => { videoEl.onloadedmetadata = r; });
    const duration = videoEl.duration;
    const frames: Blob[] = [];
    for (let t = 0; t < duration; t += 0.1) {
      videoEl.currentTime = t;
      await new Promise(r => { videoEl.onseeked = r; });
      const blob = await grabFrame(videoEl);
      if (blob) frames.push(blob);
    }
    const videoBlob = new Blob([file], { type: file.type });
    setCapturedPayload({ video: { blob: videoBlob, url: URL.createObjectURL(videoBlob) }, frameSequence: frames });
    setIsExtractingFrames(false);
  };

  // ─── Upload to HF ─────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!label.trim()) { alert("Please set an ASL sign label before uploading."); return; }
    if (!capturedPayload) return;
    setIsUploading(true);
    try {
      const uuid = uuidv4();
      const cleanLabel = isSentence ? "conversations" : label.trim().toLowerCase().replace(/\s+/g, "_");

      const zip = new JSZip();
      capturedPayload.frameSequence.forEach((blob, i) => zip.file(`frame_${i.toString().padStart(4,"0")}.jpg`, blob));
      const zipBlob = await zip.generateAsync({ type: "blob" });

      const metadata: Record<string, unknown> = {
        uuid, contributor, email, fluency, faceBlurred: faceBlur,
        label: isSentence ? label.trim() : cleanLabel,
        timestamp: new Date().toISOString(),
        videoSize: capturedPayload.video.blob.size,
        frameCount: capturedPayload.frameSequence.length,
      };
      if (isSentence) metadata.transcript = label.trim();

      const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });
      const fd = new FormData();
      fd.append("uuid",      uuid);
      fd.append("label",     cleanLabel);
      fd.append("email",     email);
      fd.append("video",     capturedPayload.video.blob, `${uuid}.webm`);
      fd.append("framesZip", zipBlob,  `${uuid}_frames.zip`);
      fd.append("metadata",  metaBlob, `${uuid}.json`);

      const resp = await fetch("/api/upload", { method: "POST", body: fd });
      let result: { error?: string } = {};
      try { result = await resp.json(); } catch { result = { error: "Server error" }; }
      if (!resp.ok) throw new Error(result.error || "Upload failed");

      alert(`✅ Uploaded!\nLabel: ${cleanLabel}\nUUID: ${uuid}`);
      setCapturedPayload(null); setLabel(""); setUploadFile(null);
      if (mode === "camera") startCamera();
      if (teleprompterOn) setTeleprompterIndex(i => (i + 1) % ALL_SIGNS.length);
    } catch (err: unknown) {
      alert("Pipeline Error: " + (err instanceof Error ? err.message : String(err)));
    } finally { setIsUploading(false); }
  };

  const handleRetake = () => {
    setCapturedPayload(null); setUploadFile(null);
    if (mode === "camera") startCamera();
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  const videoFilter = `brightness(${brightness}%) contrast(${contrast}%)`;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col p-3 sm:p-5 max-w-7xl mx-auto gap-4">
      <video ref={uploadVideoRef} className="hidden" muted playsInline />

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between">
        <button onClick={() => router.push("/")} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2 text-sm">
          <ArrowLeft size={18} /> Exit
        </button>
        <div className="flex items-center gap-2">
          <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium text-zinc-300">
              {contributor} · <span className="capitalize text-zinc-400">{fluency}</span>
            </span>
          </div>
        </div>
      </header>

      {/* ── Teleprompter Banner ───────────────────────────────────────────────── */}
      {teleprompterOn && (
        <div className="glass-panel p-4 flex items-center gap-3 border border-blue-500/30">
          <button onClick={() => setTeleprompterIndex(i => (i - 1 + ALL_SIGNS.length) % ALL_SIGNS.length)}
            className="text-zinc-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10">
            <ChevronLeft size={24} />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">
              {WORD_LIST.find(c => c.signs.includes(ALL_SIGNS[teleprompterIndex]))?.category} · {teleprompterIndex + 1} / {ALL_SIGNS.length}
            </p>
            <p className="text-3xl sm:text-4xl font-black text-white tracking-wide">{ALL_SIGNS[teleprompterIndex]}</p>
            <p className="text-[10px] text-zinc-500 mt-1">← → navigate · Spacebar to record</p>
          </div>
          <button onClick={() => setTeleprompterIndex(i => (i + 1) % ALL_SIGNS.length)}
            className="text-zinc-400 hover:text-white transition-colors p-2 rounded-lg hover:bg-white/10">
            <ChevronRight size={24} />
          </button>
        </div>
      )}

      {/* ── Main Grid ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">

        {/* ── Left: All Controls ────────────────────────────────────────────────*/}
        <div className="col-span-1 flex flex-col gap-3">

          {/* Mode: Sign vs Sentence — BIG TOGGLE */}
          <div className="glass-panel p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 ml-1">Recording Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setIsSentence(false)}
                className={`py-4 rounded-xl font-bold text-sm flex flex-col items-center gap-1.5 transition-all border-2 ${!isSentence ? "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/30" : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"}`}
              >
                <span className="text-2xl">🤟</span>
                <span>Sign</span>
                <span className="text-[10px] font-normal opacity-70">Single word</span>
              </button>
              <button
                onClick={() => setIsSentence(true)}
                className={`py-4 rounded-xl font-bold text-sm flex flex-col items-center gap-1.5 transition-all border-2 ${isSentence ? "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-500/30" : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"}`}
              >
                <span className="text-2xl">💬</span>
                <span>Sentence</span>
                <span className="text-[10px] font-normal opacity-70">Conversation</span>
              </button>
            </div>
          </div>

          {/* Input Mode: Camera vs Upload */}
          <div className="glass-panel p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-2 ml-1">Input Source</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setMode("camera"); setCapturedPayload(null); }}
                className={`py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border-2 ${mode === "camera" ? "bg-emerald-600 border-emerald-500 text-white" : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"}`}>
                <Camera size={16} /> Live Cam
              </button>
              <button onClick={() => { setMode("upload"); stopCamera(); setCapturedPayload(null); }}
                className={`py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border-2 ${mode === "upload" ? "bg-orange-600 border-orange-500 text-white" : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"}`}>
                <FileVideo size={16} /> Upload
              </button>
            </div>
          </div>

          {/* Label */}
          <div className="glass-panel p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="label" className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
                {isSentence ? "Sentence / Transcript" : "ASL Sign Label"}
              </label>
              <button
                onClick={() => setTeleprompterOn(!teleprompterOn)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold flex items-center gap-1 transition-all ${teleprompterOn ? "bg-blue-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white"}`}
              >
                <Zap size={11} /> Teleprompter
              </button>
            </div>
            <input
              id="label"
              type="text"
              value={label}
              onChange={e => { setLabel(e.target.value); setTeleprompterOn(false); }}
              placeholder={isSentence ? "e.g., Hello, my name is..." : "e.g., thank_you, hello..."}
              className="glass-input w-full text-sm"
              readOnly={teleprompterOn}
            />
            <p className="text-[10px] text-zinc-600 ml-1">
              → <span className="text-blue-400">data/{email}/{isSentence ? "conversations" : (label.toLowerCase().replace(/\s+/g,"_") || "label")}/</span>
            </p>
          </div>

          {/* Countdown Pills */}
          <div className="glass-panel p-4 flex flex-col gap-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Countdown Before Recording</p>
            <div className="flex gap-2">
              {[0, 3, 5, 10].map(s => (
                <button
                  key={s}
                  onClick={() => setCountdownSecs(s)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all border-2 ${countdownSecs === s ? "bg-blue-600 border-blue-500 text-white" : "bg-white/5 border-white/5 text-zinc-400 hover:text-white"}`}
                >
                  {s === 0 ? "Off" : `${s}s`}
                </button>
              ))}
            </div>
          </div>

          {/* Camera Sliders */}
          <div className="glass-panel p-4 flex flex-col gap-3">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">Camera Adjustments</p>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-zinc-400"><span>Brightness</span><span>{brightness}%</span></div>
              <input type="range" min={50} max={200} value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-full accent-blue-500 h-2" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-zinc-400"><span>Contrast</span><span>{contrast}%</span></div>
              <input type="range" min={50} max={200} value={contrast} onChange={e => setContrast(Number(e.target.value))} className="w-full accent-blue-500 h-2" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between text-xs text-zinc-400"><span>Zoom</span><span>{zoom.toFixed(1)}×</span></div>
              <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-full accent-blue-500 h-2" />
            </div>
          </div>

          {/* Face Blur */}
          <div className="glass-panel p-4 flex flex-col gap-2">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={faceBlur}
                onChange={e => setFaceBlur(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500 flex-shrink-0"
              />
              <div>
                <p className="text-sm font-semibold text-white">
                  😶‍🌫️ Face Blur {faceBlur && <span className="text-xs text-emerald-400 font-normal">— ACTIVE</span>}
                </p>
                <p className="text-[10px] text-amber-400 mt-0.5 leading-relaxed">
                  ⚠️ Pixelates top 45% of each frame. May slow older devices and reduce frame quality. Recommended for privacy.
                </p>
              </div>
            </label>
          </div>

        </div>

        {/* ── Right: Camera / Action ─────────────────────────────────────────── */}
        <div className="col-span-1 lg:col-span-2 flex flex-col gap-3">

          {/* Camera Viewport */}
          <div className="glass-panel overflow-hidden relative bg-black/80 flex items-center justify-center"
               style={{ minHeight: "340px", flex: 1 }}>

            {!capturedPayload ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay playsInline muted
                  style={{ filter: videoFilter, transform: `scaleX(-1) scale(${zoom})` }}
                  className={`w-full h-full object-contain transition-opacity duration-500 ${isCameraActive ? "opacity-100" : "opacity-0"}`}
                />
                {!isCameraActive && mode === "camera" && !countdown && (
                  <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 text-zinc-500">
                    <Camera size={48} className="animate-pulse opacity-40" />
                    <p className="text-sm">Initializing camera...</p>
                  </div>
                )}
                {mode === "upload" && !isExtractingFrames && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <label className="flex flex-col items-center gap-3 cursor-pointer p-8 border-2 border-dashed border-white/15 rounded-2xl hover:border-orange-500/50 transition-colors">
                      <FileVideo size={48} className="text-zinc-500" />
                      <span className="text-sm text-zinc-400">{uploadFile ? uploadFile.name : "Click to upload .mp4 or .webm"}</span>
                      <input type="file" accept="video/mp4,video/webm" className="hidden"
                        onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }} />
                    </label>
                  </div>
                )}
                {isExtractingFrames && (
                  <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 text-zinc-400">
                    <Loader2 size={48} className="animate-spin" />
                    <p className="text-sm">Extracting frames...</p>
                  </div>
                )}
                {/* Countdown overlay */}
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <span className="text-9xl font-black text-white drop-shadow-2xl animate-pulse">{countdown}</span>
                  </div>
                )}
                {/* Face blur zone indicator */}
                {faceBlur && isCameraActive && (
                  <div className="absolute top-0 left-0 right-0 flex items-center justify-center pointer-events-none"
                       style={{ height: "45%" }}>
                    <div className="absolute inset-0 border-b-2 border-dashed border-red-400/30 bg-red-400/5" />
                    <span className="text-[10px] text-red-400/60 font-mono absolute top-2 right-3">BLUR ZONE</span>
                  </div>
                )}
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full border border-red-500/40">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-200 font-mono text-sm">{fmt(recordingTime)}</span>
                  </div>
                )}
                {/* Crosshair */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-24 h-24 border border-white/10 rounded-full flex items-center justify-center">
                    <div className="w-1 h-1 bg-white/30 rounded-full" />
                  </div>
                </div>
              </>
            ) : (
              <>
                {frameUrls.length > 0 && (
                  <img src={frameUrls[previewFrame]} alt="Preview" className="w-full h-full object-contain" />
                )}
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10 text-xs text-white">
                  Frame {previewFrame + 1} / {frameUrls.length}
                </div>
                {faceBlur && (
                  <div className="absolute top-3 right-3 bg-red-900/60 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] text-red-300">
                    😶‍🌫️ Face blurred
                  </div>
                )}
              </>
            )}
          </div>

          {/* Action Buttons — always big and obvious */}
          {capturedPayload ? (
            <div className="grid grid-cols-2 gap-3">
              <button onClick={handleRetake}
                className="btn-secondary flex items-center justify-center gap-2 py-5 text-base font-bold rounded-xl">
                <RefreshCcw size={20} /> Retake
              </button>
              <button onClick={handleUpload} disabled={isUploading}
                className="flex items-center justify-center gap-2 py-5 text-base font-bold rounded-xl transition-all bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50">
                {isUploading ? <><Loader2 size={20} className="animate-spin" /> Uploading...</> : <><UploadCloud size={20} /> Upload to Vault</>}
              </button>
            </div>
          ) : mode === "camera" ? (
            <div className="flex flex-col gap-2">
              {!isRecording ? (
                <button onClick={triggerCapture} disabled={!isCameraActive}
                  className="btn-primary flex flex-col items-center justify-center gap-1 py-6 text-xl font-black rounded-xl disabled:opacity-40 w-full">
                  <div className="flex items-center gap-3"><Camera size={28} /> Start Recording</div>
                  <span className="text-sm font-normal text-blue-200 flex items-center gap-1"><Keyboard size={12} /> Spacebar</span>
                </button>
              ) : (
                <button onClick={stopUnifiedCapture}
                  className="flex items-center justify-center gap-3 py-6 text-xl font-black rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-lg shadow-red-500/30 animate-pulse w-full">
                  <Square size={28} /> Stop — {fmt(recordingTime)}
                </button>
              )}
            </div>
          ) : (
            <div className="glass-panel p-4 text-center text-sm text-zinc-400">
              <p>Upload a video file above to extract frames for labeling.</p>
              {capturedPayload && <p className="text-emerald-400 mt-1">✓ Frames extracted. Ready to upload.</p>}
            </div>
          )}

          {/* Payload info bar when ready */}
          {capturedPayload && (
            <div className="glass-panel px-4 py-3 flex items-center gap-3">
              <Layers size={16} className="text-blue-400 flex-shrink-0" />
              <span className="text-xs text-zinc-300">
                <strong className="text-white">{capturedPayload.frameSequence.length} frames</strong> · {Math.round(capturedPayload.video.blob.size / 1024)} KB video
                {isSentence && <span className="text-purple-400"> · Sentence mode → /conversations/</span>}
                {faceBlur && <span className="text-emerald-400"> · Face blurred ✓</span>}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
