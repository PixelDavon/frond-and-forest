"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultEvent = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEvent = Event & {
  error: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type VoiceEngineError =
  | "speech-synthesis-unsupported"
  | "speech-recognition-unsupported"
  | "speech-recognition-error";

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function useVoiceEngine() {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<VoiceEngineError | null>(null);

  const isSpeechSynthesisSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const isSpeechRecognitionSupported =
    typeof window !== "undefined" && Boolean(window.webkitSpeechRecognition);

  const getBestVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (!isSpeechSynthesisSupported) {
      return null;
    }

    const englishVoices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith("en"));
    const premiumIdentifiers = ["google", "natural", "enhanced", "premium"];
    const premiumVoice = englishVoices.find((voice) =>
      premiumIdentifiers.some((identifier) =>
        voice.name.toLowerCase().includes(identifier),
      ),
    );

    const selectedVoice = premiumVoice ?? englishVoices[0] ?? null;
    selectedVoiceRef.current = selectedVoice;
    return selectedVoice;
  }, [isSpeechSynthesisSupported]);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!isSpeechSynthesisSupported) {
        setError("speech-synthesis-unsupported");
        onEnd?.();
        return;
      }

      const trimmedText = text.trim();
      if (!trimmedText) {
        onEnd?.();
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(trimmedText);
      utterance.voice = getBestVoice();
      utterance.onend = () => onEnd?.();
      window.speechSynthesis.speak(utterance);
      setError(null);
    },
    [getBestVoice, isSpeechSynthesisSupported],
  );

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const listen = useCallback(
    (callback: (transcript: string) => void) => {
      if (typeof window === "undefined") {
        setError("speech-recognition-unsupported");
        return;
      }

      const Recognition = window.webkitSpeechRecognition;
      if (!Recognition) {
        setError("speech-recognition-unsupported");
        return;
      }

      stopListening();
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          callback(transcript);
        }
      };
      recognition.onerror = () => {
        setError("speech-recognition-error");
        setIsListening(false);
      };
      recognition.onend = () => {
        recognitionRef.current = null;
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      setError(null);
      setIsListening(true);
      try {
        recognition.start();
      } catch {
        recognitionRef.current = null;
        setIsListening(false);
        setError("speech-recognition-error");
      }
    },
    [stopListening],
  );

  useEffect(() => {
    if (!isSpeechSynthesisSupported) {
      return;
    }

    const updateVoice = () => {
      getBestVoice();
    };

    updateVoice();
    window.speechSynthesis.onvoiceschanged = updateVoice;

    return () => {
      if (window.speechSynthesis.onvoiceschanged === updateVoice) {
        window.speechSynthesis.onvoiceschanged = null;
      }
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, [getBestVoice, isSpeechSynthesisSupported]);

  return {
    speak,
    listen,
    stop: stopListening,
    stopListening,
    isListening,
    isSpeechSynthesisSupported,
    isSpeechRecognitionSupported,
    isSupported:
      isSpeechSynthesisSupported || isSpeechRecognitionSupported,
    error,
  };
}