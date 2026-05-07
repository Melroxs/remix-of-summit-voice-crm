import React, { useRef, useState } from "react";

export interface RecordingPlayerData {
  id: string;
  recording_url: string | null;
  download_url?: string | null;
  duration_seconds: number | null;
  status?: string | null;
  created_at?: string | null;
  available_at?: string | null;
}

export function RecordingPlayer({ recording }: { recording: RecordingPlayerData }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!recording.recording_url) return null;

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleDownload = () => {
    const url = recording.download_url ?? recording.recording_url;
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `recording-${recording.id}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const formatDur = (s: number | null) => {
    if (!s) return "--:--";
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 p-2 rounded bg-background border text-xs">
      <audio
        ref={audioRef}
        src={recording.recording_url}
        onEnded={() => setIsPlaying(false)}
        preload="none"
      />
      <button
        onClick={togglePlay}
        className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:opacity-80"
        title={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "⏸" : "▶"}
      </button>
      <span className="text-muted-foreground">{formatDur(recording.duration_seconds)}</span>
      {(recording.available_at || recording.created_at) && (
        <span className="text-muted-foreground">
          {new Date(recording.available_at ?? recording.created_at!).toLocaleDateString()}
        </span>
      )}
      <button
        onClick={handleDownload}
        className="ml-auto text-primary hover:underline"
        title="Download recording"
      >
        ⬇ Download
      </button>
    </div>
  );
}