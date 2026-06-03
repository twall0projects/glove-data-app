"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Camera, Square, RefreshCcw, UploadCloud, ArrowLeft, Layers,
  Keyboard, Loader2, ChevronRight, ChevronLeft, FileVideo, Zap, Settings
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import JSZip from "jszip";

// ─── Teleprompter Word List ───────────────────────────────────────────────────
const WORD_LIST: { category: string; signs: string[] }[] = [
  { category: "Greetings/Closing", signs: ["Hello", "Goodbye", "See you later", "See you tomorrow", "Nice to meet you"] },
  { category: "Politeness", signs: ["Please", "Thank you", "You're welcome", "Sorry", "Excuse me"] },
  { category: "Basics", signs: ["Yes", "No", "Maybe", "Good", "Bad", "Same", "Different"] },
  { category: "People", signs: ["I/Me", "You", "He/She/It", "We/Us", "They/Them", "Friend", "Family", "Man", "Woman", "Child"] },
  { category: "Questions", signs: ["Who", "What", "Where", "When", "Why", "How", "Which"] },
  { category: "Verbs", signs: ["Go", "Come", "Have", "Want", "Need", "Like", "Love", "Eat", "Drink", "See", "Stop", "Help", "Make", "Play", "Feel", "Think", "Chat", "Sign", "Ask", "Sleep", "Wake up", "Sit", "Stand", "Buy", "Sell", "Start", "Finish"] },
  { category: "Time/Place", signs: ["Day", "Night", "Morning", "Afternoon", "Home", "School", "Work", "Time"] },
  { category: "Descriptors", signs: ["Big", "Small", "Hot", "Cold", "New", "Old", "More", "Few", "Many", "Excited", "Tired", "Angry", "Scared", "Surprised"] },
  { category: "Numbers/Alpha", signs: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "Fingerspelling A-Z"] },
  { category: "Conversations", signs: [
    "HELLO MY NAME IS [Fingerspell Name]",
    "HOW YOU?",
    "PLEASE SIGN SLOW",
    "PLEASE SIGN AGAIN",
    "UNDERSTAND?",
    "MEANING WHAT?",
    "BATHROOM WHERE?",
    "TIME WHAT?",
    "I DON'T UNDERSTAND",
  ]},
];

const ALL_SIGNS = WORD_LIST.flatMap(c => c.signs);

interface UnifiedPayload {
  video: { blob: Blob; url: string };
  frameSequence: Blob[];
}

export default function RecordPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const uploadVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const frameSequenceRef = useRef<Blob[]>([]);
  const sequenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Identity
  const [contributor, setContributor] = useState<string>("guest");
  const [email, setEmail] = useState<string>("");
  const [fluency, setFluency] = useState<string>("new");

  // Label
  const [label, setLabel] = useState<string>("");
  const [isSentence, setIsSentence] = useState(false);

  // Teleprompter
  const [teleprompterIndex, setTeleprompterIndex] = useState(0);
  const [teleprompterOn, setTeleprompterOn] = useState(false);

  // Recording state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number>(3);

  // Payload / preview
  const [capturedPayload, setCapturedPayload] = useState<UnifiedPayload | null>(null);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [frameUrls, setFrameUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Mode: camera | upload
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isExtractingFrames, setIsExtractingFrames] = useState(false);

  // Settings panel
  const [showSettings, setShowSettings] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [zoom, setZoom] = useState(1);

  // Face blur
  const [faceBlur, setFaceBlur] = useState(false);

  // Refs to avoid closure staleness
  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;
  const capturedPayloadRef = useRef<UnifiedPayload | null>(null);
  capturedPayloadRef.current = capturedPayload;
  const isCameraActiveRef = useRef(false);
  isCameraActiveRef.current = isCameraActive;

  // ─── Identity Load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const savedContributor = localStorage.getItem("glove_contributor");
    const savedEmail = localStorage.getItem("glove_email");
    const savedFluency = localStorage.getItem("glove_fluency");
    if (!savedContributor || !savedEmail) {
      router.push("/");
    } else {
      setContributor(savedContributor);
      setEmail(savedEmail);
      setFluency(savedFluency || "new");
    }
  }, [router]);

  // ─── Teleprompter sync ──────────────────────────────────────────────────────
  useEffect(() => {
    if (teleprompterOn) {
      const sign = ALL_SIGNS[teleprompterIndex];
      const isConv = WORD_LIST.find(c => c.category === "Conversations")?.signs.includes(sign);
      setLabel(sign);
      setIsSentence(!!isConv);
    }
  }, [teleprompterOn, teleprompterIndex]);

  // ─── Frame Preview Player ────────────────────────────────────────────────────
  useEffect(() => {
    if (capturedPayload && capturedPayload.frameSequence.length > 0) {
      const urls = capturedPayload.frameSequence.map(b => URL.createObjectURL(b));
      setFrameUrls(urls);
      setPreviewFrame(0);
      const interval = setInterval(() => {
        setPreviewFrame(prev => (prev + 1) % urls.length);
      }, 100);
      return () => {
        clearInterval(interval);
        urls.forEach(u => URL.revokeObjectURL(u));
      };
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
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Camera error:", err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsCameraActive(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "camera") startCamera();
    return () => stopCamera();
  }, [mode]);

  // ─── Frame Grab ──────────────────────────────────────────────────────────────
  const grabFrame = async (sourceEl?: HTMLVideoElement): Promise<Blob | null> => {
    const el = sourceEl || videoRef.current;
    if (!el) return null;
    const canvas = document.createElement("canvas");
    canvas.width = el.videoWidth || 640;
    canvas.height = el.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Apply zoom transform
    if (zoom !== 1) {
      const scale = zoom;
      const ox = (canvas.width - canvas.width / scale) / 2;
      const oy = (canvas.height - canvas.height / scale) / 2;
      ctx.drawImage(el, ox, oy, canvas.width / scale, canvas.height / scale, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(el, 0, 0);
    }

    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.90);
    });
  };

  // ─── Capture ─────────────────────────────────────────────────────────────────
  const startUnifiedCapture = useCallback(async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    frameSequenceRef.current = [];
    sequenceIntervalRef.current = setInterval(async () => {
      const blob = await grabFrame();
      if (blob) frameSequenceRef.current.push(blob);
    }, 100);

    const stream = streamRef.current;
    if (!stream) return;

    let options: MediaRecorderOptions = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) options = { mimeType: "video/webm;codecs=vp9" };
    else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) options = { mimeType: "video/webm;codecs=vp8" };
    else if (MediaRecorder.isTypeSupported("video/webm")) options = { mimeType: "video/webm" };
    else if (MediaRecorder.isTypeSupported("video/mp4")) options = { mimeType: "video/mp4" };

    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;
    const chunks: BlobPart[] = [];
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const finalMimeType = mediaRecorder.mimeType || "video/webm";
      const videoBlob = new Blob(chunks, { type: finalMimeType });
      const videoUrl = URL.createObjectURL(videoBlob);
      setCapturedPayload({ video: { blob: videoBlob, url: videoUrl }, frameSequence: [...frameSequenceRef.current] });
      stopCamera();
    };

    mediaRecorder.start(200);
    setIsRecording(true);
    setRecordingTime(0);
    setTimerInterval(setInterval(() => setRecordingTime(prev => prev + 1), 1000));
  }, [stopCamera, zoom]);

  const stopUnifiedCapture = useCallback(() => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerInterval) clearInterval(timerInterval);
      if (sequenceIntervalRef.current) clearInterval(sequenceIntervalRef.current);
    }
  }, [timerInterval]);

  // ─── Countdown → Start ───────────────────────────────────────────────────────
  const triggerCapture = useCallback(() => {
    if (capturedPayloadRef.current || !isCameraActiveRef.current) return;
    if (isRecordingRef.current) { stopUnifiedCapture(); return; }

    if (countdownSeconds === 0) {
      startUnifiedCapture();
      return;
    }
    setCountdown(countdownSeconds);
    let remaining = countdownSeconds;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current!);
        setCountdown(null);
        startUnifiedCapture();
      } else {
        setCountdown(remaining);
      }
    }, 1000);
  }, [countdownSeconds, startUnifiedCapture, stopUnifiedCapture]);

  // ─── Spacebar Listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (mode === "camera") triggerCapture();
      }
      if (e.code === "ArrowRight" && teleprompterOn) {
        setTeleprompterIndex(i => (i + 1) % ALL_SIGNS.length);
      }
      if (e.code === "ArrowLeft" && teleprompterOn) {
        setTeleprompterIndex(i => (i - 1 + ALL_SIGNS.length) % ALL_SIGNS.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, triggerCapture, teleprompterOn]);

  // ─── File Upload Frame Extraction ─────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    setUploadFile(file);
    setIsExtractingFrames(true);
    const videoEl = uploadVideoRef.current!;
    const url = URL.createObjectURL(file);
    videoEl.src = url;
    await new Promise(res => { videoEl.onloadedmetadata = res; });
    videoEl.currentTime = 0;
    await new Promise(res => { videoEl.onseeked = res; });

    const frames: Blob[] = [];
    const duration = videoEl.duration;
    const fps = 10;
    const step = 1 / fps;

    for (let t = 0; t < duration; t += step) {
      videoEl.currentTime = t;
      await new Promise(res => { videoEl.onseeked = res; });
      const blob = await grabFrame(videoEl);
      if (blob) frames.push(blob);
    }

    // Build a "video blob" from the original file
    const videoBlob = new Blob([file], { type: file.type });
    const videoUrl = URL.createObjectURL(videoBlob);
    setCapturedPayload({ video: { blob: videoBlob, url: videoUrl }, frameSequence: frames });
    setIsExtractingFrames(false);
    URL.revokeObjectURL(url);
  };

  // ─── Upload to HF ────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!label.trim()) { alert("Please enter an ASL sign label before uploading."); return; }
    if (!capturedPayload) return;
    setIsUploading(true);
    try {
      const uuid = uuidv4();
      const cleanLabel = isSentence
        ? "conversations"
        : label.trim().toLowerCase().replace(/\s+/g, "_");

      const zip = new JSZip();
      capturedPayload.frameSequence.forEach((blob, index) => {
        zip.file(`frame_${index.toString().padStart(4, "0")}.jpg`, blob);
      });
      const zipBlob = await zip.generateAsync({ type: "blob" });

      const metadata: Record<string, unknown> = {
        uuid,
        label: isSentence ? label.trim() : cleanLabel,
        contributor,
        email,
        fluency,
        faceBlurred: faceBlur,
        timestamp: new Date().toISOString(),
        videoSize: capturedPayload.video.blob.size,
        frameCount: capturedPayload.frameSequence.length,
      };
      if (isSentence) metadata.transcript = label.trim();

      const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: "application/json" });

      const formData = new FormData();
      formData.append("uuid", uuid);
      formData.append("label", cleanLabel);
      formData.append("email", email);
      formData.append("video", capturedPayload.video.blob, `${uuid}.webm`);
      formData.append("framesZip", zipBlob, `${uuid}_frames.zip`);
      formData.append("metadata", metadataBlob, `${uuid}.json`);

      const response = await fetch("/api/upload", { method: "POST", body: formData });

      let result;
      try { result = await response.json(); } catch { result = { error: "Unknown server error" }; }
      if (!response.ok) throw new Error(result.error || "Upload failed");

      alert(`✅ Success! Payload locked in the Hugging Face vault.\nLabel: ${cleanLabel}\nUUID: ${uuid}`);
      setCapturedPayload(null);
      setLabel("");
      setUploadFile(null);
      if (mode === "camera") startCamera();
      if (teleprompterOn) setTeleprompterIndex(i => (i + 1) % ALL_SIGNS.length);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(err);
      alert("Pipeline Error: " + msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    setCapturedPayload(null);
    setUploadFile(null);
    if (mode === "camera") startCamera();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const videoFilterStyle = `brightness(${brightness}%) contrast(${contrast}%)`;

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col p-3 sm:p-6 max-w-6xl mx-auto">
      {/* Hidden video for file upload frame extraction */}
      <video ref={uploadVideoRef} className="hidden" muted playsInline />

      {/* Header */}
      <header className="flex items-center justify-between mb-4 sm:mb-8 relative z-10 flex-wrap gap-2">
        <button onClick={() => router.push("/")} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
          <ArrowLeft size={20} />
          <span className="text-sm">Exit</span>
        </button>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium text-zinc-300 hidden sm:inline">
              {contributor} · <span className="capitalize text-zinc-400">{fluency}</span>
            </span>
            <span className="text-xs font-medium text-zinc-300 sm:hidden">{contributor}</span>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 transition-colors ${showSettings ? "text-blue-400 border-blue-500/30" : "text-zinc-400 hover:text-white"}`}
          >
            <Settings size={14} />
            <span className="text-xs hidden sm:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* Settings Panel */}
      {showSettings && (
        <div className="glass-panel p-4 mb-4 relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Countdown */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Countdown</label>
            <select
              value={countdownSeconds}
              onChange={e => setCountdownSeconds(Number(e.target.value))}
              className="glass-input text-sm"
            >
              <option value={0}>No countdown</option>
              <option value={3}>3 seconds</option>
              <option value={5}>5 seconds</option>
              <option value={10}>10 seconds</option>
            </select>
          </div>
          {/* Brightness */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Brightness: {brightness}%</label>
            <input type="range" min={50} max={200} value={brightness} onChange={e => setBrightness(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
          {/* Contrast */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Contrast: {contrast}%</label>
            <input type="range" min={50} max={200} value={contrast} onChange={e => setContrast(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
          {/* Zoom */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Zoom: {zoom.toFixed(1)}x</label>
            <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={e => setZoom(Number(e.target.value))} className="w-full accent-blue-500" />
          </div>
          {/* Face Blur */}
          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={faceBlur}
                onChange={e => setFaceBlur(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500"
              />
              <div>
                <span className="text-xs font-semibold text-zinc-300">Enable Face Blur (Privacy Mode)</span>
                <p className="text-[10px] text-amber-400 mt-0.5">⚠️ May cause lag on older devices and reduce frame quality. Your face region will be blurred before frames are uploaded.</p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* Teleprompter Banner */}
      {teleprompterOn && (
        <div className="glass-panel p-4 mb-4 relative z-10 flex items-center gap-3 border border-blue-500/20">
          <button onClick={() => setTeleprompterIndex(i => (i - 1 + ALL_SIGNS.length) % ALL_SIGNS.length)} className="text-zinc-400 hover:text-white transition-colors flex-shrink-0">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">
              {WORD_LIST.find(c => c.signs.includes(ALL_SIGNS[teleprompterIndex]))?.category} · {teleprompterIndex + 1}/{ALL_SIGNS.length}
            </p>
            <p className="text-2xl sm:text-3xl font-bold text-white tracking-wide">{ALL_SIGNS[teleprompterIndex]}</p>
            <p className="text-[10px] text-zinc-500 mt-1">← → Arrow keys to navigate · Spacebar to record</p>
          </div>
          <button onClick={() => setTeleprompterIndex(i => (i + 1) % ALL_SIGNS.length)} className="text-zinc-400 hover:text-white transition-colors flex-shrink-0">
            <ChevronRight size={22} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8 relative z-10 flex-1">

        {/* Left Column: Controls */}
        <div className="col-span-1 flex flex-col gap-4">

          {/* Mode Toggle */}
          <div className="glass-panel p-4 flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => { setMode("camera"); setCapturedPayload(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${mode === "camera" ? "bg-blue-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white"}`}
              >
                <Camera size={14} /> Live Camera
              </button>
              <button
                onClick={() => { setMode("upload"); stopCamera(); setCapturedPayload(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all ${mode === "upload" ? "bg-purple-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white"}`}
              >
                <FileVideo size={14} /> Upload File
              </button>
            </div>
          </div>

          {/* Annotation Panel */}
          <div className="glass-panel p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Annotation</h2>
              <button
                onClick={() => setTeleprompterOn(!teleprompterOn)}
                className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${teleprompterOn ? "bg-blue-600 text-white" : "bg-white/5 text-zinc-400 hover:text-white"}`}
              >
                <Zap size={12} />
                Teleprompter
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="label" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
                ASL Sign Label
              </label>
              <input
                id="label"
                type="text"
                value={label}
                onChange={e => { setLabel(e.target.value); setTeleprompterOn(false); }}
                placeholder={teleprompterOn ? "Set by teleprompter" : "e.g., thank_you, hello..."}
                className="glass-input w-full text-sm"
                readOnly={teleprompterOn}
              />
              <p className="text-[10px] text-zinc-500 ml-1">
                Folder: data/<span className="text-blue-400">{isSentence ? "conversations" : (label.toLowerCase().replace(/\s+/g, "_") || "label")}</span>/
              </p>
            </div>

            {/* Sentence mode toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isSentence}
                onChange={e => setIsSentence(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500"
              />
              <span className="text-xs text-zinc-400">Sentence / Conversation mode</span>
            </label>
          </div>

          {/* Action Panel */}
          <div className="glass-panel p-5 flex flex-col gap-4 flex-1 relative">
            {!capturedPayload && mode === "camera" && (
              <div className="absolute top-4 right-4 flex items-center gap-1.5 text-zinc-500 text-[10px] font-medium">
                <Keyboard size={12} />
                <span>Spacebar</span>
              </div>
            )}

            {capturedPayload ? (
              <div className="flex flex-col gap-3">
                <div className="bg-white/5 rounded-xl p-3 flex flex-col gap-1.5">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Layers size={14} className="text-blue-400" /> Payload Ready
                  </h3>
                  <ul className="text-[11px] text-zinc-400 space-y-0.5">
                    <li>• 1× Video ({Math.round(capturedPayload.video.blob.size / 1024)} KB)</li>
                    <li>• {capturedPayload.frameSequence.length}× Frames</li>
                    {isSentence && <li className="text-purple-400">• Sentence mode → /conversations/</li>}
                  </ul>
                </div>
                <button onClick={handleRetake} className="btn-secondary flex items-center justify-center gap-2 text-sm">
                  <RefreshCcw size={16} /> Retake
                </button>
                <button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="btn-primary flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20 disabled:opacity-50 text-sm"
                >
                  {isUploading ? (<><Loader2 size={16} className="animate-spin" /><span>Uploading...</span></>) : (<><UploadCloud size={16} /><span>Secure Upload</span></>)}
                </button>
              </div>
            ) : mode === "upload" ? (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/10 rounded-xl p-6 cursor-pointer hover:border-purple-500/40 transition-colors">
                  <FileVideo size={32} className="text-zinc-500" />
                  <span className="text-xs text-zinc-400 text-center">
                    {uploadFile ? uploadFile.name : "Click to upload .mp4 or .webm"}
                  </span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm"
                    className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
                  />
                </label>
                {isExtractingFrames && (
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Loader2 size={14} className="animate-spin" />
                    <span>Extracting frames...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-4">
                {!isRecording ? (
                  <button
                    onClick={triggerCapture}
                    disabled={!isCameraActive}
                    className="btn-primary flex flex-col items-center justify-center gap-1.5 disabled:opacity-50 h-20 sm:h-24"
                  >
                    <div className="flex items-center gap-2 font-bold text-base sm:text-lg">
                      <Camera size={22} />
                      <span>Start Capture</span>
                    </div>
                    <span className="text-xs font-normal text-blue-200">Video + Frames</span>
                  </button>
                ) : (
                  <button
                    onClick={stopUnifiedCapture}
                    className="btn-primary flex flex-col items-center justify-center gap-1.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-500/20 animate-pulse h-20 sm:h-24"
                  >
                    <div className="flex items-center gap-2 font-bold text-base sm:text-lg">
                      <Square size={22} />
                      <span>Stop ({formatTime(recordingTime)})</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Camera / Preview */}
        <div className="col-span-1 lg:col-span-2 relative min-h-[280px] sm:min-h-[400px]">
          <div className="glass-panel absolute inset-0 overflow-hidden flex items-center justify-center bg-black/80">
            {!capturedPayload ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ filter: videoFilterStyle, transform: `scale(${zoom}) scaleX(-1)` }}
                  className={`w-full h-full object-contain transition-opacity duration-500 ${isCameraActive ? "opacity-100" : "opacity-0"}`}
                />
                {!isCameraActive && mode === "camera" && (
                  <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 text-zinc-500">
                    <Camera size={48} className="animate-pulse opacity-50" />
                    <p className="text-sm">Initializing camera...</p>
                  </div>
                )}
                {mode === "upload" && !isExtractingFrames && !uploadFile && (
                  <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 text-zinc-500">
                    <FileVideo size={48} className="opacity-50" />
                    <p className="text-sm">Upload a video file to extract frames</p>
                  </div>
                )}
                {isExtractingFrames && (
                  <div className="absolute inset-0 flex items-center justify-center flex-col gap-3 text-zinc-400">
                    <Loader2 size={48} className="animate-spin" />
                    <p className="text-sm">Extracting frames from video...</p>
                  </div>
                )}
                {/* Countdown Overlay */}
                {countdown !== null && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="text-8xl sm:text-9xl font-black text-white animate-pulse drop-shadow-2xl">
                      {countdown}
                    </div>
                  </div>
                )}
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-full border border-red-500/30">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-100 font-mono text-sm">{formatTime(recordingTime)}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {frameUrls.length > 0 && (
                  <img src={frameUrls[previewFrame]} alt="Sequence preview" className="w-full h-full object-contain" />
                )}
                <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-xs text-white">
                  Frame Preview ({previewFrame + 1} / {frameUrls.length})
                </div>
              </>
            )}

            {/* Crosshair */}
            {!capturedPayload && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 border border-white/15 rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-white/40 rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
