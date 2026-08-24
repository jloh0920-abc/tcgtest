import { useEffect, useRef, useState } from "react";
import { findClosestCardName } from "../api/scryfall";

interface WebcamScannerProps {
  onNameFound: (name: string) => void;
}

type ScanStatus = "closed" | "starting" | "live" | "reading" | "error";

export function WebcamScanner({ onNameFound }: WebcamScannerProps) {
  const [status, setStatus] = useState<ScanStatus>("closed");
  const [message, setMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => stopStream();
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function openScanner() {
    setStatus("starting");
    setMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStatus("live");
    } catch {
      setStatus("error");
      setMessage(
        "Couldn't access the webcam. Check your browser's camera permission and try again.",
      );
    }
  }

  function closeScanner() {
    stopStream();
    setStatus("closed");
    setMessage("");
  }

  async function captureAndRead() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // Crop the top band of the frame, where a Magic card's title usually
    // sits when the card is held up to fill the guide box.
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    if (!sourceWidth || !sourceHeight) return;

    const cropHeight = Math.round(sourceHeight * 0.16);
    const cropY = Math.round(sourceHeight * 0.08);
    canvas.width = sourceWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      video,
      0,
      cropY,
      sourceWidth,
      cropHeight,
      0,
      0,
      sourceWidth,
      cropHeight,
    );

    setStatus("reading");
    setMessage("Reading card name…");

    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const {
        data: { text },
      } = await worker.recognize(canvas);
      await worker.terminate();

      const candidate = extractNameGuess(text);
      if (!candidate) {
        setStatus("live");
        setMessage("Couldn't read a name — try steadying the card in the box and rescanning.");
        return;
      }

      const matched = await findClosestCardName(candidate);
      if (matched) {
        setMessage(`Found: ${matched}`);
        onNameFound(matched);
        closeScanner();
      } else {
        setStatus("live");
        setMessage(`Read "${candidate}" but couldn't match a card — try again.`);
      }
    } catch {
      setStatus("live");
      setMessage("OCR failed. Try again with better lighting.");
    }
  }

  function extractNameGuess(rawText: string): string {
    const firstLine = rawText.split("\n").map((l) => l.trim()).find((l) => l.length > 1);
    if (!firstLine) return "";
    return firstLine.replace(/[^a-zA-Z0-9 ,'-]/g, "").trim();
  }

  return (
    <div className="webcam-scanner">
      {status === "closed" || status === "error" ? (
        <>
          <button type="button" onClick={openScanner}>
            Scan with webcam
          </button>
          {message && <p className="hint error">{message}</p>}
        </>
      ) : (
        <div className="webcam-panel">
          <div className="webcam-video-wrap">
            <video ref={videoRef} muted playsInline />
            <div className="webcam-guide" />
          </div>
          <p className="hint">
            Line the card's name up inside the box, then capture. Works best in good light with
            the card held flat.
          </p>
          {message && <p className="hint">{message}</p>}
          <div className="webcam-actions">
            <button type="button" onClick={captureAndRead} disabled={status !== "live"}>
              {status === "reading" ? "Reading…" : "Capture"}
            </button>
            <button type="button" onClick={closeScanner}>
              Close
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
