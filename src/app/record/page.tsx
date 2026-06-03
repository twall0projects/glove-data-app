"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Square, RefreshCcw, UploadCloud, ArrowLeft, Layers, Keyboard, Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import JSZip from "jszip";

interface UnifiedPayload {
  video: { blob: Blob; url: string };
  frameSequence: Blob[];
}

export default function RecordPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  
  // Refs for sequence capture
  const frameSequenceRef = useRef<Blob[]>([]);
  const sequenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [contributor, setContributor] = useState<string>("guest");
  const [email, setEmail] = useState<string>("");
  const [label, setLabel] = useState<string>("");
  
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  
  const [capturedPayload, setCapturedPayload] = useState<UnifiedPayload | null>(null);
  const [previewFrame, setPreviewFrame] = useState(0);
  const [frameUrls, setFrameUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  // Refs for keyboard shortcuts to avoid closure staleness
  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;
  
  const capturedPayloadRef = useRef<UnifiedPayload | null>(null);
  capturedPayloadRef.current = capturedPayload;

  const isCameraActiveRef = useRef(false);
  isCameraActiveRef.current = isCameraActive;

  // Load contributor identity
  useEffect(() => {
    const savedContributor = localStorage.getItem("glove_contributor");
    const savedEmail = localStorage.getItem("glove_email");
    if (!savedContributor || !savedEmail) {
      router.push("/");
    } else {
      setContributor(savedContributor);
      setEmail(savedEmail);
    }
  }, [router]);

  // Custom Sequence Player Engine
  useEffect(() => {
    if (capturedPayload && capturedPayload.frameSequence.length > 0) {
      const urls = capturedPayload.frameSequence.map(b => URL.createObjectURL(b));
      setFrameUrls(urls);
      setPreviewFrame(0);
      
      const interval = setInterval(() => {
        setPreviewFrame((prev) => (prev + 1) % urls.length);
      }, 100);
      
      return () => {
        clearInterval(interval);
        urls.forEach(u => URL.revokeObjectURL(u));
      };
    }
  }, [capturedPayload]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setIsCameraActive(false);
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const grabFrame = async (): Promise<Blob | null> => {
    if (!videoRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0);
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.90);
    });
  };

  const startUnifiedCapture = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    
    frameSequenceRef.current = [];

    // 1. Start the Frame Sequence capture loop (e.g., 10 FPS = every 100ms)
    sequenceIntervalRef.current = setInterval(async () => {
      const blob = await grabFrame();
      if (blob) frameSequenceRef.current.push(blob);
    }, 100);

    // 2. Start the continuous Video Recording
    const stream = streamRef.current;
    if (!stream) return;
    
    // Let the browser choose the best codec to prevent initialization failures
    let options = {};
    if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
      options = { mimeType: 'video/webm;codecs=vp9' };
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      options = { mimeType: 'video/webm;codecs=vp8' };
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      options = { mimeType: 'video/webm' };
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      options = { mimeType: 'video/mp4' };
    }
    
    const mediaRecorder = new MediaRecorder(stream, options);
    mediaRecorderRef.current = mediaRecorder;
    
    const chunks: BlobPart[] = [];
    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    
    mediaRecorder.onstop = () => {
      const finalMimeType = mediaRecorder.mimeType || 'video/webm';
      const videoBlob = new Blob(chunks, { type: finalMimeType });
      const videoUrl = URL.createObjectURL(videoBlob);
      
      console.log(`Video Blob Created: ${videoBlob.size} bytes. MIME: ${finalMimeType}. Chunks: ${chunks.length}`);

      setCapturedPayload({
        video: { blob: videoBlob, url: videoUrl },
        frameSequence: [...frameSequenceRef.current]
      });
      // stopCamera is called when unmounting or retaking, but let's ensure we stop it here so the light turns off
      stopCamera();
    };

    // Start recording and slice data every 200ms to guarantee chunks array fills up
    mediaRecorder.start(200);
    setIsRecording(true);
    setRecordingTime(0);
    setTimerInterval(setInterval(() => setRecordingTime((prev) => prev + 1), 1000));
  };

  const stopUnifiedCapture = () => {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop(); // Triggers onstop and bundles
      setIsRecording(false);
      if (timerInterval) clearInterval(timerInterval);
      if (sequenceIntervalRef.current) clearInterval(sequenceIntervalRef.current);
    }
  };

  // Spacebar Event Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in the label input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      if (e.code === "Space") {
        e.preventDefault(); // Prevent page scroll
        
        // Don't record if we are previewing a payload or camera isn't active
        if (capturedPayloadRef.current || !isCameraActiveRef.current) return;
        
        if (isRecordingRef.current) {
          stopUnifiedCapture();
        } else {
          startUnifiedCapture();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [timerInterval]); // Re-bind so it has access to the latest timerInterval

  const handleRetake = () => {
    setCapturedPayload(null);
    startCamera();
  };

  const handleUpload = async () => {
    if (!label.trim()) {
      alert("Please enter an ASL sign label before uploading.");
      return;
    }
    if (!capturedPayload) return;

    setIsUploading(true);
    try {
      const uuid = uuidv4();
      const cleanLabel = label.trim().toLowerCase().replace(/\s+/g, '_');
      
      // 1. Physically zip the individual frame files
      const zip = new JSZip();
      capturedPayload.frameSequence.forEach((blob, index) => {
        // Pads numbers with zeros (e.g., frame_0000.jpg, frame_0001.jpg) to mathematically guarantee order
        const frameName = `frame_${index.toString().padStart(4, '0')}.jpg`;
        zip.file(frameName, blob);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // 2. Create the Master Ledger Metadata (JSON)
      const metadata = {
        uuid,
        label: cleanLabel,
        contributor,
        email,
        timestamp: new Date().toISOString(),
        videoSize: capturedPayload.video.blob.size,
        frameCount: capturedPayload.frameSequence.length
      };
      const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });

      // 3. Assemble the Cargo Payload
      const formData = new FormData();
      formData.append('uuid', uuid);
      formData.append('label', cleanLabel);
      formData.append('email', email);
      formData.append('video', capturedPayload.video.blob, `${uuid}.webm`);
      formData.append('framesZip', zipBlob, `${uuid}_frames.zip`);
      formData.append('metadata', metadataBlob, `${uuid}.json`);

      // 4. Ship the Cargo via our Secure Pipeline
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      alert(`Success! Unified payload safely locked in the Hugging Face vault.\nUUID: ${uuid}`);
      
      // 5. Reset UI for next recording
      setCapturedPayload(null);
      setLabel("");
      startCamera();

    } catch (err: any) {
      console.error(err);
      alert("Pipeline Error: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen flex flex-col p-6 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-8 relative z-10">
        <button onClick={() => router.push("/")} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2">
          <ArrowLeft size={20} />
          <span>Exit</span>
        </button>
        <div className="flex items-center gap-4">
          <div className="glass-panel px-4 py-2 rounded-full flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-sm font-medium text-zinc-300">
              Contributor: <span className="text-white">{contributor}</span>
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10 flex-1">
        
        <div className="col-span-1 flex flex-col gap-6">
          <div className="glass-panel p-6 flex flex-col gap-4">
            <h2 className="text-xl font-bold text-white mb-2">Annotation</h2>
            
            <div className="flex flex-col gap-2">
              <label htmlFor="label" className="text-xs font-semibold text-zinc-400 uppercase tracking-wider ml-1">
                ASL Sign Label
              </label>
              <input
                id="label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g., thank_you, hello..."
                className="glass-input w-full"
              />
              <p className="text-xs text-zinc-500 ml-1">
                This creates the folder: data/<span className="text-blue-400">{label.toLowerCase().replace(/\s+/g, '_') || 'label'}</span>/
              </p>
            </div>
          </div>

          <div className="glass-panel p-6 flex flex-col gap-4 flex-1 justify-center relative">
            {/* Spacebar Hint Overlay */}
            {!capturedPayload && (
              <div className="absolute top-4 right-4 flex items-center gap-2 text-zinc-500 text-xs font-medium">
                <Keyboard size={14} />
                <span>Spacebar to Start/Stop</span>
              </div>
            )}

            {capturedPayload ? (
              <div className="flex flex-col gap-4">
                <div className="bg-white/5 rounded-xl p-4 flex flex-col gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Layers size={16} className="text-blue-400"/> Payload Ready</h3>
                  <ul className="text-xs text-zinc-400 space-y-1">
                    <li>• 1x Continuous Video ({Math.round(capturedPayload.video.blob.size / 1024)} KB)</li>
                    <li>• {capturedPayload.frameSequence.length}x Sequence Frames (.jpg)</li>
                  </ul>
                </div>

                <button onClick={handleRetake} className="btn-secondary flex items-center justify-center gap-2">
                  <RefreshCcw size={18} />
                  <span>Retake</span>
                </button>
                <button 
                  onClick={handleUpload} 
                  disabled={isUploading}
                  className="btn-primary flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Shipping Payload...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={18} />
                      <span>Secure Upload Data</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4 mt-4">
                {!isRecording ? (
                  <button 
                    onClick={startUnifiedCapture}
                    disabled={!isCameraActive}
                    className="btn-primary flex flex-col items-center justify-center gap-2 disabled:opacity-50 h-24"
                  >
                    <div className="flex items-center gap-2 font-bold text-lg">
                      <Camera size={24} />
                      <span>Start Unified Capture</span>
                    </div>
                    <span className="text-xs font-normal text-blue-200">Records Video + Frames Sequence</span>
                  </button>
                ) : (
                  <button 
                    onClick={stopUnifiedCapture}
                    className="btn-primary flex flex-col items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-red-500/20 animate-pulse h-24"
                  >
                    <div className="flex items-center gap-2 font-bold text-lg">
                      <Square size={24} />
                      <span>Stop Capture ({formatTime(recordingTime)})</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="col-span-1 lg:col-span-2 relative min-h-[400px]">
          <div className="glass-panel absolute inset-0 overflow-hidden flex items-center justify-center bg-black/80">
            {!capturedPayload ? (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted 
                  className={`w-full h-full object-contain transition-opacity duration-500 ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}
                />
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center flex-col gap-4 text-zinc-500">
                    <Camera size={48} className="animate-pulse opacity-50" />
                    <p>Initializing camera...</p>
                  </div>
                )}
                {isRecording && (
                  <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full border border-red-500/30">
                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-100 font-mono text-sm">{formatTime(recordingTime)}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {frameUrls.length > 0 && (
                  <img 
                    src={frameUrls[previewFrame]} 
                    alt="Sequence preview" 
                    className="w-full h-full object-contain" 
                  />
                )}
                
                <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 text-xs text-white">
                  Sequence Preview ({previewFrame + 1} / {frameUrls.length})
                </div>
              </>
            )}
            
            {!capturedPayload && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-white/20 rounded-full flex items-center justify-center">
                  <div className="w-1 h-1 bg-white/50 rounded-full" />
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

