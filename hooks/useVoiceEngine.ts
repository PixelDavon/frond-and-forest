"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultEvent = Event & {
  resultIndex: number;
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

export type VoiceRecognitionError =
  | "speech-synthesis-unsupported"
  | "speech-recognition-unsupported"
  | "permission-denied"
  | "no-speech"
  | "speech-recognition-error";

interface ListenCallbacks {
  onInterim: (transcript: string) => void;
  onFinal: (transcript: string) => void;
  onNoSpeech: () => void;
  onError: (error: VoiceRecognitionError) => void;
}

declare global {
  interface Window {
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function mapRecognitionError(error: string): VoiceRecognitionError {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "permission-denied";
  }
  if (error === "no-speech") {
    return "no-speech";
  }
  return "speech-recognition-error";
}

export function useVoiceEngine() {
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recognitionSessionRef = useRef(0);
  const selectedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<VoiceRecognitionError | null>(null);

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
    recognitionSessionRef.current += 1;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const listen = useCallback(
    (callbacks: ListenCallbacks) => {
      if (typeof window === "undefined" || !window.webkitSpeechRecognition) {
        setError("speech-recognition-unsupported");
        callbacks.onError("speech-recognition-unsupported");
        return;
      }

      stopListening();
      const Recognition = window.webkitSpeechRecognition;
      const recognition = new Recognition();
      recognitionSessionRef.current += 1;
      const sessionId = recognitionSessionRef.current;
      const processedFinalTranscripts = new Set<string>();
      let receivedUsableResult = false;
      let receivedError = false;

      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        if (
          sessionId !== recognitionSessionRef.current ||
          recognitionRef.current !== recognition
        ) {
          return;
        }

        let interimTranscript = "";
        let finalTranscript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result?.[0]?.transcript?.trim() ?? "";
          if (result?.isFinal) {
            finalTranscript += `${transcript} `;
          } else {
            interimTranscript += `${transcript} `;
          }
        }

        if (interimTranscript.trim()) {
          receivedUsableResult = true;
          callbacks.onInterim(interimTranscript.trim());
        }

        const trimmedFinal = finalTranscript.trim();
        if (trimmedFinal) {
          receivedUsableResult = true;
          const normalizedFinal = trimmedFinal.toLocaleLowerCase();
          if (!processedFinalTranscripts.has(normalizedFinal)) {
            processedFinalTranscripts.add(normalizedFinal);
            callbacks.onFinal(trimmedFinal);
          }
        }
      };
      recognition.onerror = (event) => {
        if (sessionId !== recognitionSessionRef.current) {
          return;
        }
        receivedError = true;
        const mappedError = mapRecognitionError(event.error);
        setError(mappedError);
        setIsListening(false);
        callbacks.onError(mappedError);
      };
      recognition.onend = () => {
        if (
          sessionId !== recognitionSessionRef.current ||
          recognitionRef.current !== recognition
        ) {
          return;
        }
        recognitionRef.current = null;
        setIsListening(false);
        if (!receivedUsableResult && !receivedError) {
          setError("no-speech");
          callbacks.onNoSpeech();
        }
      };

      recognitionRef.current = recognition;
      setError(null);
      setIsListening(true);
      try {
        recognition.start();
      } catch {
        if (sessionId === recognitionSessionRef.current) {
          recognitionRef.current = null;
          setIsListening(false);
          setError("speech-recognition-error");
          callbacks.onError("speech-recognition-error");
        }
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
      stopListening();
      window.speechSynthesis.cancel();
    };
  }, [getBestVoice, isSpeechSynthesisSupported, stopListening]);

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
