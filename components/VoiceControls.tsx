"use client";

import type { AppStatus } from "@/lib/types";

interface VoiceControlsProps {
  isListening: boolean;
  onMicToggle: () => void;
  status: AppStatus;
}

export default function VoiceControls({
  isListening,
  onMicToggle,
  status,
}: VoiceControlsProps) {
  const isNarrating = status === "narrating";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onMicToggle}
        disabled={isNarrating || status !== "idle"}
        aria-label={isListening ? "Stop listening" : "Start listening"}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-moss/10 text-3xl shadow-sm transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
          isListening ? "ring-4 ring-red-400 ring-offset-4 ring-offset-white animate-pulse" : ""
        }`}
      >
        <span aria-hidden="true">{isListening ? "⏹️" : "🎙️"}</span>
      </button>
      <span className="min-h-5 text-center text-sm font-semibold text-slate-500">
        {isListening
          ? "Listening to your voice..."
          : isNarrating
            ? "The forest is narrating..."
            : "Tap to choose by voice"}
      </span>
    </div>
  );
}
