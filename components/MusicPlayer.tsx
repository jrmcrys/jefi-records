"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { usePersonal } from "./PersonalProvider";
import type { Music } from "@/lib/personal";

/* Browsers only allow sound after the first click, tap or key press on a
   page. Until then playback is held, and it starts on that first gesture. */
function useFirstGesture(active: boolean, start: () => void) {
  useEffect(() => {
    if (!active) return;
    const go = () => {
      start();
    };
    const events = ["pointerdown", "keydown", "touchend"] as const;
    for (const e of events) window.addEventListener(e, go, { once: true, passive: true });
    return () => {
      for (const e of events) window.removeEventListener(e, go);
    };
  }, [active, start]);
}

const pill =
  "fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-current/20 bg-background px-3 py-2 text-sm shadow-lg";

function PlayPause({ playing, onClick }: { playing: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? "Pause music" : "Play music"}
      className="flex size-7 items-center justify-center rounded-full bg-accent text-white"
    >
      {playing ? (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
          <rect x="3" y="2" width="3.5" height="12" rx="1" />
          <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
          <path d="M4 2.5v11l9-5.5z" />
        </svg>
      )}
    </button>
  );
}

function Mp3Player({ music, label }: { music: Music; label: string }) {
  const supabase = useMemo(() => createClient(), []);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [started, setStarted] = useState(false);
  const retried = useRef(false);

  const sign = useCallback(async () => {
    if (!music.path) return;
    const { data } = await supabase.storage
      .from("music")
      .createSignedUrl(music.path, 60 * 60 * 24);
    setSrc(data?.signedUrl ?? null);
  }, [supabase, music.path]);

  useEffect(() => {
    const timer = setTimeout(() => void sign(), 0);
    return () => clearTimeout(timer);
  }, [sign]);

  const start = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.play().then(
      () => setWaiting(false),
      () => setWaiting(true)
    );
  }, []);

  /* Try right away, and fall back to the first tap when the browser says no. */
  useEffect(() => {
    if (!src || !music.autoplay) return;
    const timer = setTimeout(start, 0);
    return () => clearTimeout(timer);
  }, [src, music.autoplay, start]);

  useFirstGesture(Boolean(src) && music.autoplay && !started, start);

  return (
    <div className={pill}>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          loop={music.loop}
          preload="auto"
          onPlay={() => {
            setPlaying(true);
            setStarted(true);
          }}
          onPause={() => setPlaying(false)}
          onError={() => {
            if (!retried.current) {
              retried.current = true;
              void sign();
            }
          }}
        />
      )}
      <PlayPause
        playing={playing}
        onClick={() => {
          const el = audioRef.current;
          if (!el) return;
          if (el.paused) start();
          else el.pause();
        }}
      />
      <span className="max-w-40 truncate text-xs opacity-80">
        {waiting && !started ? "Tap anywhere to start music" : label}
      </span>
    </div>
  );
}

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  getPlayerState: () => number;
  destroy: () => void;
};

type YTApi = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      playerVars: Record<string, number | string>;
      events: {
        onReady?: () => void;
        onStateChange?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
};

let ytLoading: Promise<YTApi> | null = null;
function loadYouTube(): Promise<YTApi> {
  const w = window as unknown as {
    YT?: YTApi & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  ytLoading ??= new Promise<YTApi>((resolve) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(w.YT as YTApi);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytLoading;
}

function YouTubePlayer({ music }: { music: Music }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const id = music.youtubeId!;

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;
    void loadYouTube().then((YT) => {
      const host = hostRef.current;
      if (cancelled || !host) return;
      const mount = document.createElement("div");
      host.appendChild(mount);
      player = new YT.Player(mount, {
        videoId: id,
        playerVars: {
          autoplay: music.autoplay ? 1 : 0,
          loop: music.loop ? 1 : 0,
          playlist: music.loop ? id : "",
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            playerRef.current = player;
            setReady(true);
            if (music.autoplay) player?.playVideo();
          },
          onStateChange: (e) => {
            setPlaying(e.data === 1);
            if (e.data === 1) setStarted(true);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerRef.current = null;
      try {
        player?.destroy();
      } catch {
        /* the player may already be gone */
      }
      setReady(false);
      setPlaying(false);
    };
  }, [id, music.autoplay, music.loop]);

  const start = useCallback(() => playerRef.current?.playVideo(), []);
  useFirstGesture(ready && music.autoplay && !started, start);

  return (
    <>
      <div
        ref={hostRef}
        aria-hidden={!music.showPlayer}
        className={
          music.showPlayer
            ? "fixed bottom-16 right-4 z-40 h-[135px] w-[240px] overflow-hidden rounded-lg border border-current/20 bg-black shadow-lg [&_iframe]:size-full"
            : "pointer-events-none fixed bottom-0 left-0 size-px overflow-hidden opacity-0 [&_iframe]:size-full"
        }
      />
      <div className={pill}>
        <PlayPause
          playing={playing}
          onClick={() => {
            const p = playerRef.current;
            if (!p) return;
            if (p.getPlayerState() === 1) p.pauseVideo();
            else p.playVideo();
          }}
        />
        <span className="max-w-40 truncate text-xs opacity-80">
          {ready && !started && music.autoplay ? "Tap anywhere to start music" : "YouTube music"}
        </span>
      </div>
    </>
  );
}

export default function MusicPlayer() {
  const { personal } = usePersonal();
  const m = personal.music;
  if (m.kind === "mp3" && m.path) {
    return <Mp3Player key={m.path} music={m} label={m.fileName ?? "Music"} />;
  }
  if (m.kind === "youtube" && m.youtubeId) {
    return <YouTubePlayer key={m.youtubeId} music={m} />;
  }
  return null;
}
