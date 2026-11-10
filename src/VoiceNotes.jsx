import React, { useEffect, useMemo, useRef, useState } from "react";
import "./VoiceNotes.css";

const MAX_DURATION = 10 * 60;
const SPEEDS = [1, 1.5, 2];

const formatTime = (seconds = 0) => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
};

function Waveform({ progress = 0, bars = 36 }) {
  return (
    <div className="tether-voice-wave" aria-hidden="true">
      {Array.from({ length: bars }, (_, index) => {
        const height = 5 + ((index * 17 + 11) % 15);
        return <i key={index} className={index / bars <= progress ? "played" : ""} style={{ height }} />;
      })}
    </div>
  );
}

export function VoiceNotePlayer({ src, duration = 0, preview = false, onDelete, onSend, sending = false }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration || 0);
  const [speed, setSpeed] = useState(1);
  const [playError, setPlayError] = useState("");

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    setPlaying(false);
    setCurrent(0);
    setPlayError("");
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.load();
    }
  }, [src]);

  const toggle = async (event) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;
    setPlayError("");
    if (audio.paused) {
      try {
        await audio.play();
      } catch (error) {
        setPlaying(false);
        setPlayError(error?.message || "This recording couldn't be played.");
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  return (
    <div className={`tether-voice-player ${preview ? "is-preview" : ""}`} onClick={(event) => event.stopPropagation()}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => setTotal(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : duration || 0)}
        onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
        onEnded={() => { setPlaying(false); setCurrent(0); }}
        onPause={() => setPlaying(false)}
        onPlay={() => { setPlaying(true); setPlayError(""); }}
        onError={() => { setPlaying(false); setPlayError("Audio couldn't be loaded. Please try recording again."); }}
      />
      <button type="button" className="tether-voice-play" onClick={toggle} aria-label={playing ? "Pause voice message" : "Play voice message"}>
        {playing ? "Ⅱ" : "▶"}
      </button>
      <div className="tether-voice-track">
        <Waveform progress={total ? current / total : 0} />
        <div className="tether-voice-times"><span>{formatTime(current)}</span><span>{formatTime(total || duration)}</span></div>
      </div>
      <button type="button" className="tether-voice-speed" onClick={(event) => {
        event.stopPropagation();
        setSpeed((value) => SPEEDS[(SPEEDS.indexOf(value) + 1) % SPEEDS.length]);
      }}>{speed}×</button>
      {preview && <div className="tether-voice-preview-actions">
        <button type="button" onClick={(event) => { event.stopPropagation(); onDelete?.(); }} disabled={sending}>Delete</button>
        <button type="button" onClick={(event) => { event.stopPropagation(); onSend?.(); }} disabled={sending}>{sending ? "Sending…" : "Send"}</button>
      </div>}
      {playError && <small className="tether-voice-error">{playError}</small>}
    </div>
  );
}

export default function VoiceNoteComposer({ onSend, disabled = false }) {
  const [recording, setRecording] = useState(false);
  const [locked, setLocked] = useState(false);
  const [blob, setBlob] = useState(null);
  const [duration, setDuration] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef(null);
  const pointerRef = useRef(null);
  const lockedRef = useRef(false);
  const cancelledRef = useRef(false);
  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const controlRef = useRef(null);

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    recordingRef.current = false;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    setRecording(false);
    setLocked(false);
    lockedRef.current = false;
    releaseMic();
  };

  const startRecording = async (event) => {
    if (disabled || recordingRef.current || startingRef.current || blob) return;
    if (event.cancelable) event.preventDefault();

    startingRef.current = true;
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    try {
      controlRef.current?.setPointerCapture?.(event.pointerId);
    } catch {}

    cancelledRef.current = false;
    lockedRef.current = false;
    setError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error("Voice recording is not supported by this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Prefer a format that Cloudinary can accept directly when available.
      const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
      const preferred = candidates.find((type) => window.MediaRecorder.isTypeSupported?.(type));
      const recorder = preferred ? new MediaRecorder(stream, { mimeType: preferred }) : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      recorder.ondataavailable = (recorderEvent) => {
        if (recorderEvent.data?.size) chunksRef.current.push(recorderEvent.data);
      };
      recorder.onstop = () => {
        const seconds = Math.min(MAX_DURATION, Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (!cancelledRef.current && recorded.size) {
          setBlob(recorded);
          setDuration(seconds);
        }
        chunksRef.current = [];
        releaseMic();
      };

      recorder.start(250);
      recordingRef.current = true;
      setRecording(true);
      setDuration(0);

      if (!pointerRef.current) {
        cancelledRef.current = true;
        stopRecording();
        return;
      }

      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setDuration(Math.min(MAX_DURATION, elapsed));
        if (elapsed >= MAX_DURATION) {
          pointerRef.current = null;
          stopRecording();
        }
      }, 250);
    } catch (cause) {
      releaseMic();
      setError(cause?.message || "Microphone permission was not granted.");
      pointerRef.current = null;
    } finally {
      startingRef.current = false;
    }
  };

  const moveRecording = (event) => {
    if (!recordingRef.current || !pointerRef.current || pointerRef.current.id !== event.pointerId || lockedRef.current) return;
    const dx = event.clientX - pointerRef.current.x;
    const dy = event.clientY - pointerRef.current.y;
    if (dx < -85) {
      cancelledRef.current = true;
      pointerRef.current = null;
      stopRecording();
    } else if (dy < -75) {
      lockedRef.current = true;
      setLocked(true);
    }
  };

  const endPointer = (event) => {
    if (pointerRef.current && pointerRef.current.id === event.pointerId) {
      pointerRef.current = null;
      if (recordingRef.current && !lockedRef.current) stopRecording();
    }
  };

  useEffect(() => () => {
    clearInterval(timerRef.current);
    recordingRef.current = false;
    if (recorderRef.current?.state !== "inactive") recorderRef.current?.stop();
    releaseMic();
  }, []);

  const previewUrl = useMemo(() => blob ? URL.createObjectURL(blob) : "", [blob]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const discard = () => {
    setBlob(null);
    setDuration(0);
    setError("");
  };

  const sendRecording = async () => {
    if (!blob || sending) return;
    setSending(true);
    setError("");
    try {
      await onSend(blob, duration);
      discard();
    } catch (cause) {
      setError(cause?.message || "Voice message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (blob) {
    return (
      <div className="tether-voice-composer-preview">
        <VoiceNotePlayer src={previewUrl} duration={duration} preview onDelete={discard} onSend={sendRecording} sending={sending} />
        {error && <small className="tether-voice-error">{error}</small>}
      </div>
    );
  }

  return (
    <div
      ref={controlRef}
      className="tether-voice-control"
      onPointerDown={(event) => {
        if (event.target.closest(".tether-voice-mic")) startRecording(event);
      }}
      onPointerMove={moveRecording}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {recording ? (
        <div className="tether-voice-recording">
          <span className="tether-voice-live-dot" />
          <span>{formatTime(duration)}</span>
          <span className="tether-voice-hint">{locked ? "Recording locked · tap stop when ready" : "Slide left to cancel · slide up to lock"}</span>
          {locked && <button type="button" onClick={stopRecording}>Stop</button>}
        </div>
      ) : (
        <button
          type="button"
          className="tether-voice-mic"
          disabled={disabled}
          aria-label="Hold to record a voice message"
          title="Hold to record · slide up to lock"
        >
          <svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
          </svg>
        </button>
      )}
      {error && <small className="tether-voice-error">{error}</small>}
    </div>
  );
}
