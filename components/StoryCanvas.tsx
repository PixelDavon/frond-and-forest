"use client";

import { useState } from "react";
import type { AppStatus } from "@/lib/types";

interface StoryCanvasProps {
  imageUrl: string | null;
  status: AppStatus;
  onImageLoaded: (imageUrl: string) => void;
  onImageError: (imageUrl: string) => void;
  onRetry: () => void;
}

export default function StoryCanvas({
  imageUrl,
  status,
  onImageLoaded,
  onImageError,
  onRetry,
}: StoryCanvasProps) {
  const [imageState, setImageState] = useState<{
    url: string;
    status: "loaded" | "failed";
  } | null>(null);

  const isWaitingForImage =
    imageUrl === null || status === "fetching_story" || status === "generating_image";

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-moss/30 via-story-canvas to-forest/20 shadow-lg">
      {imageUrl ? (
        <img
          key={imageUrl}
          src={imageUrl}
          alt=""
          onLoad={() => {
            setImageState({ url: imageUrl, status: "loaded" });
            onImageLoaded(imageUrl);
          }}
          onError={() => {
            setImageState({ url: imageUrl, status: "failed" });
            onImageError(imageUrl);
          }}
          className="w-full h-full object-cover rounded-2xl transition-opacity duration-500"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-slate-600">
          <span className="text-7xl" aria-hidden="true">🌱✨</span>
          <p className="max-w-xs font-semibold">
            Your story picture will appear here.
          </p>
        </div>
      )}
      {isWaitingForImage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-moss/20 via-story-canvas/80 to-forest/10">
          <div className="h-24 w-24 animate-pulse rounded-full bg-white/70 shadow-inner" />
          <p className="animate-pulse text-center text-lg font-bold text-moss">
            Sprouting your visual story...
          </p>
        </div>
      )}
      {imageUrl &&
        imageState?.url === imageUrl &&
        imageState.status === "failed" &&
        !isWaitingForImage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-slate-600">
          <span className="text-7xl" aria-hidden="true">🌱✨</span>
          <p className="max-w-xs font-semibold">
            Your story picture will appear here.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-moss px-4 py-2 font-bold text-white transition hover:bg-forest"
          >
            Retry Generating Picture
          </button>
        </div>
      )}
    </div>
  );
}
