"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ChoiceBadges from "@/components/ChoiceBadges";
import StoryCanvas from "@/components/StoryCanvas";
import VoiceControls from "@/components/VoiceControls";
import { useVoiceEngine } from "@/hooks/useVoiceEngine";
import { cleanTextForSpeech } from "@/lib/utils";
import {
  isVoiceSuggestionCurrent,
  matchVoiceChoice,
  type VoiceChoiceSuggestion,
} from "@/lib/voice";
import type { AppStatus, InteractiveOption, StoryResponse } from "@/lib/types";

function StorySkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-label="Loading story">
      <div className="h-5 w-32 rounded-full bg-moss/10" />
      <div className="h-5 w-full rounded-full bg-slate-100" />
      <div className="h-5 w-4/5 rounded-full bg-slate-100" />
      <div className="flex gap-3 pt-2">
        <div className="h-12 w-32 rounded-full bg-moss/10" />
        <div className="h-12 w-36 rounded-full bg-moss/10" />
      </div>
    </div>
  );
}

export default function Home() {
  const [hasStarted, setHasStarted] = useState(false);
  const [story, setStory] = useState<StoryResponse | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<AppStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [voiceFeedback, setVoiceFeedback] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [voiceSuggestion, setVoiceSuggestion] =
    useState<VoiceChoiceSuggestion | null>(null);
  const seedRef = useRef<number | undefined>(undefined);
  const sceneRequestRef = useRef(0);
  const activeImageUrlRef = useRef<string | null>(null);
  const activeNarrationRef = useRef<string | null>(null);
  const imageTransitionRef = useRef(false);
  const imageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    speak,
    listen,
    stop,
    isListening,
    isSpeechRecognitionSupported,
    error: voiceError,
  } = useVoiceEngine();

  const startNarration = useCallback(
    (narrationText: string, requestId: number) => {
      if (
        imageTransitionRef.current ||
        requestId !== sceneRequestRef.current
      ) {
        return;
      }

      imageTransitionRef.current = true;
      if (imageTimeoutRef.current) {
        clearTimeout(imageTimeoutRef.current);
        imageTimeoutRef.current = null;
      }
      setAppStatus("narrating");
      speak(cleanTextForSpeech(narrationText), () => {
        setAppStatus("idle");
      });
    },
    [speak],
  );

  const handleImageLoaded = useCallback(
    (loadedImageUrl: string) => {
      if (
        loadedImageUrl === activeImageUrlRef.current &&
        activeNarrationRef.current
      ) {
        startNarration(activeNarrationRef.current, sceneRequestRef.current);
      }
    },
    [startNarration],
  );

  const handleImageError = useCallback(
    (failedImageUrl: string) => {
      if (failedImageUrl === activeImageUrlRef.current) {
        if (imageTimeoutRef.current) {
          clearTimeout(imageTimeoutRef.current);
          imageTimeoutRef.current = null;
        }
        imageTransitionRef.current = false;
        setAppStatus("idle");
      }
    },
    [],
  );

  const retryImage = useCallback(async () => {
    if (!story) {
      return;
    }

    const requestId = ++sceneRequestRef.current;
    setImageUrl(null);
    setAppStatus("generating_image");
    setError(null);
    imageTransitionRef.current = false;
    try {
      const imageResponse = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: story.image_prompt,
          seed: seedRef.current,
        }),
      });

      if (!imageResponse.ok) {
        throw new Error(`Image request failed (${imageResponse.status})`);
      }

      const imageData = (await imageResponse.json()) as { image_url?: string };
      if (!imageData.image_url) {
        throw new Error("Image response did not include an image URL");
      }

      if (requestId !== sceneRequestRef.current) {
        return;
      }
      activeImageUrlRef.current = imageData.image_url;
      setImageUrl(imageData.image_url);
      imageTimeoutRef.current = setTimeout(() => {
        if (activeNarrationRef.current) {
          startNarration(activeNarrationRef.current, requestId);
        }
      }, 3500);
    } catch (requestError) {
      if (requestId !== sceneRequestRef.current) {
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong",
      );
      setAppStatus("idle");
    }
  }, [startNarration, story]);

  const loadStory = useCallback(
    async (choice?: InteractiveOption, previousContext?: string) => {
      const requestId = ++sceneRequestRef.current;
      setAppStatus("fetching_story");
      setError(null);
      setVoiceFeedback(null);
      setVoiceSuggestion(null);
      activeImageUrlRef.current = null;
      activeNarrationRef.current = null;
      imageTransitionRef.current = false;
      if (imageTimeoutRef.current) {
        clearTimeout(imageTimeoutRef.current);
        imageTimeoutRef.current = null;
      }

      try {
        const storyResponse = await fetch("/api/story", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userChoice: choice?.action,
            previousContext: previousContext?.slice(0, 300),
            seed: seedRef.current,
          }),
        });

        if (!storyResponse.ok) {
          throw new Error(`Story request failed (${storyResponse.status})`);
        }

        const nextStory = (await storyResponse.json()) as StoryResponse;
        if (requestId !== sceneRequestRef.current) {
          return;
        }
        seedRef.current = nextStory.seed;
        setAppStatus("generating_image");

        const imageResponse = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: nextStory.image_prompt,
            seed: nextStory.seed,
          }),
        });

        if (!imageResponse.ok) {
          throw new Error(`Image request failed (${imageResponse.status})`);
        }

        const imageData = (await imageResponse.json()) as { image_url?: string };
        if (!imageData.image_url) {
          throw new Error("Image response did not include an image URL");
        }

        if (requestId !== sceneRequestRef.current) {
          return;
        }
        setStory(nextStory);
        activeImageUrlRef.current = imageData.image_url;
        activeNarrationRef.current = nextStory.narration;
        setImageUrl(imageData.image_url);
        imageTimeoutRef.current = setTimeout(() => {
          startNarration(nextStory.narration, requestId);
        }, 3500);
      } catch (requestError) {
        if (requestId !== sceneRequestRef.current) {
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Something went wrong",
        );
        setAppStatus("idle");
      }
    },
    [startNarration],
  );

  useEffect(() => {
    return () => {
      if (imageTimeoutRef.current) {
        clearTimeout(imageTimeoutRef.current);
      }
    };
  }, []);

  const startAdventure = () => {
    setHasStarted(true);
    void loadStory();
  };

  const choose = (choice: InteractiveOption) => {
    if (appStatus !== "idle") {
      return;
    }
    stop();
    setTranscript("");
    setVoiceSuggestion(null);
    setVoiceFeedback(`Choosing “${choice.label}”...`);
    void loadStory(choice, story?.narration);
  };

  const toggleMicrophone = () => {
    if (isListening) {
      stop();
      setVoiceFeedback("Stopped listening.");
      return;
    }

    setTranscript("");
    setVoiceFeedback(null);
    setVoiceSuggestion(null);
    listen({
      onInterim: (interimTranscript) => {
        setTranscript(interimTranscript);
      },
      onFinal: (finalTranscript) => {
        setTranscript(finalTranscript);
        const match = story
          ? matchVoiceChoice(finalTranscript, story.interactive_options)
          : { kind: "none" as const };

        if (match.kind === "exact") {
          choose(match.choice);
        } else if (match.kind === "confirm") {
          setVoiceSuggestion({
            transcript: finalTranscript,
            choice: match.choice,
            sceneId: sceneRequestRef.current,
          });
          setVoiceFeedback(null);
        } else if (match.kind === "ambiguous") {
          setVoiceFeedback(
            `I heard “${finalTranscript}”, but more than one choice is close. Please say one choice more clearly or click it directly.`,
          );
        } else {
          setVoiceFeedback(
            `I heard “${finalTranscript}”, but it does not match the available choices. Try one of the choices below or click it directly.`,
          );
        }
      },
      onNoSpeech: () => {
        setVoiceFeedback("I did not hear any speech. Please try again.");
      },
      onError: (recognitionError) => {
        const messages = {
          "speech-recognition-unsupported":
            "Voice choices are not supported in this browser.",
          "permission-denied":
            "Microphone permission was denied. Allow microphone access and try again.",
          "no-speech": "I did not hear any speech. Please try again.",
          "speech-recognition-error":
            "Voice recognition stopped unexpectedly. Please try again.",
          "speech-synthesis-unsupported":
            "Narration is not supported in this browser.",
        } as const;
        setVoiceFeedback(messages[recognitionError]);
      },
    });
  };

  const confirmVoiceSuggestion = () => {
    if (
      !voiceSuggestion ||
      !story ||
      !isVoiceSuggestionCurrent(
        voiceSuggestion,
        sceneRequestRef.current,
        story.interactive_options,
      )
    ) {
      setVoiceSuggestion(null);
      setVoiceFeedback("That suggestion is no longer available. Please try again.");
      return;
    }
    choose(voiceSuggestion.choice);
  };

  const rejectVoiceSuggestion = () => {
    setVoiceSuggestion(null);
    setVoiceFeedback("Try saying one of the choices again.");
  };

  if (!hasStarted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-story-canvas px-6 py-10">
        <section className="w-full max-w-xl rounded-[2rem] border border-moss/20 bg-white p-8 text-center shadow-xl sm:p-12">
          <div className="text-8xl" aria-hidden="true">🌿</div>
          <p className="mt-5 text-sm font-bold uppercase tracking-[0.2em] text-moss">
            Frond &amp; Forest
          </p>
          <h1 className="mt-3 text-4xl font-black text-forest">
            Frond &amp; Forest
          </h1>
          <p className="mx-auto mt-5 max-w-md text-lg leading-8 text-slate-600">
            Where spoken words sprout visual worlds.
          </p>
          <button
            type="button"
            onClick={startAdventure}
            className="mt-8 rounded-full bg-forest px-8 py-4 text-lg font-black text-white shadow-lg transition hover:scale-105 hover:bg-moss active:scale-95 focus:outline-none focus:ring-4 focus:ring-moss/30"
          >
            Begin Journey into the Forest
          </button>
        </section>
      </main>
    );
  }

  const narration = story?.narration ?? "";
  const controlsDisabled = appStatus !== "idle";

  return (
    <main className="min-h-screen bg-story-canvas px-4 py-5 text-slate-800 sm:px-8 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-6xl flex-col gap-6">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-moss">
              Frond &amp; Forest
            </p>
            <h1 className="mt-1 text-2xl font-black text-forest sm:text-3xl">
              Frond &amp; Forest
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Where spoken words sprout visual worlds.
            </p>
          </div>
          <span className="rounded-full bg-white px-4 py-2 text-sm font-bold text-moss shadow-sm">
            Story time
          </span>
        </header>

        <section className="grid flex-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <StoryCanvas
            imageUrl={imageUrl}
            status={appStatus}
            onImageLoaded={handleImageLoaded}
            onImageError={handleImageError}
            onRetry={retryImage}
          />

          <div className="flex flex-col justify-center rounded-[2rem] border border-moss/20 bg-white p-6 shadow-lg sm:p-8">
            {!story ? (
              <StorySkeleton />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold uppercase tracking-[0.16em] text-moss">
                    What happens next?
                  </p>
                  <button
                    type="button"
                    disabled={controlsDisabled || !narration}
                    onClick={() => {
                      setAppStatus("narrating");
                      speak(cleanTextForSpeech(narration), () => {
                        setAppStatus("idle");
                      });
                    }}
                    className="rounded-full bg-moss/10 px-4 py-2 text-sm font-bold text-moss transition hover:bg-moss/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🔊 Read aloud
                  </button>
                </div>
                <p className="mt-5 text-xl font-semibold leading-9 text-slate-700 sm:text-2xl">
                  {narration}
                </p>
                <div className="mt-8">
                  <p className="mb-3 text-sm font-bold text-slate-500">
                    Choose an action
                  </p>
                  <ChoiceBadges
                    options={story.interactive_options}
                    onSelect={choose}
                    disabled={controlsDisabled}
                  />
                </div>
                {isSpeechRecognitionSupported ? (
                  <div className="mt-6">
                    <VoiceControls
                      isListening={isListening}
                      transcript={transcript}
                      feedback={voiceFeedback}
                      suggestion={voiceSuggestion}
                      onConfirmSuggestion={confirmVoiceSuggestion}
                      onRejectSuggestion={rejectVoiceSuggestion}
                      onMicToggle={toggleMicrophone}
                      status={appStatus}
                    />
                  </div>
                ) : (
                  <p className="mt-6 text-center text-xs text-slate-400">
                    Voice choices are not supported in this browser.
                  </p>
                )}
                {voiceError === "speech-synthesis-unsupported" && (
                  <p className="mt-3 text-center text-xs text-rose-500">
                    Narration is not supported in this browser.
                  </p>
                )}
              </>
            )}
            {error && (
              <div className="mt-6 rounded-2xl bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                <p>We could not prepare the next scene: {error}</p>
                <button
                  type="button"
                  onClick={() => void loadStory(undefined, story?.narration)}
                  className="mt-2 underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
