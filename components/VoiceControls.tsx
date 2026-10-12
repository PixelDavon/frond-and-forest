"use client";

import type { AppStatus } from "@/lib/types";
import type { VoiceChoiceSuggestion } from "@/lib/voice";

interface VoiceControlsProps {
  isListening: boolean;
  transcript: string;
  feedback: string | null;
  suggestion: VoiceChoiceSuggestion | null;
  onConfirmSuggestion: () => void;
  onRejectSuggestion: () => void;
  onMicToggle: () => void;
  status: AppStatus;
}

export default function VoiceControls({
  isListening,
  transcript,
  feedback,
  suggestion,
  onConfirmSuggestion,
  onRejectSuggestion,
  onMicToggle,
  status,
}: VoiceControlsProps) {
  const isNarrating = status === "narrating";
  const isBusy = status !== "idle";

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onMicToggle}
        disabled={isBusy && !isListening}
        aria-label={isListening ? "Stop listening" : "Start listening"}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-moss/10 text-3xl shadow-sm transition hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
          isListening
            ? "animate-pulse ring-4 ring-red-400 ring-offset-4 ring-offset-white"
            : ""
        }`}
      >
        <span aria-hidden="true">{isListening ? "⏹️" : "🎙️"}</span>
      </button>
      <span className="min-h-5 text-center text-sm font-semibold text-slate-500">
        {isListening
          ? transcript || "Listening..."
          : isNarrating
            ? "The forest is narrating..."
            : feedback || "Tap to choose by voice"}
      </span>
      {isListening && transcript && (
        <p className="max-w-sm text-center text-xs text-slate-400">
          Keep speaking the words of one of the choices.
        </p>
      )}
      {suggestion && !isListening && (
        <div className="w-full max-w-sm rounded-2xl bg-moss/10 p-4 text-center">
          <p className="text-sm font-semibold text-slate-600">
            I heard “{suggestion.transcript}”.
          </p>
          <p className="mt-2 font-bold text-forest">
            Did you mean: {suggestion.choice.label}?
          </p>
          <div className="mt-3 flex justify-center gap-3">
            <button
              type="button"
              onClick={onConfirmSuggestion}
              disabled={isBusy}
              className="rounded-full bg-forest px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Yes, choose this
            </button>
            <button
              type="button"
              onClick={onRejectSuggestion}
              disabled={isBusy}
              className="rounded-full bg-white px-4 py-2 text-sm font-bold text-moss disabled:opacity-50"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
