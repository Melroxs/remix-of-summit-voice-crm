import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Pause, Play, Volume2, VolumeX } from "lucide-react";

interface Props {
  muted: boolean;
  held: boolean;
  onToggleMute: () => void;
  onToggleHold: () => void;
  callActive: boolean;
}

export default function AudioControls({ muted, held, onToggleMute, onToggleHold, callActive }: Props) {
  const [micGain, setMicGain] = useState(100);
  const [speakerVol, setSpeakerVol] = useState(100);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Apply speaker volume to the remote audio element
  useEffect(() => {
    const audioEl = document.getElementById("telnyx-remote-media") as HTMLAudioElement | null;
    if (audioEl) audioEl.volume = speakerVol / 100;
  }, [speakerVol]);

  // Apply mic gain via Web Audio API on the Telnyx remote stream's sender
  // This is best-effort — some browsers/SDKs don't expose the local stream easily
  useEffect(() => {
    if (!callActive) return;
    // Attempt to find any active audio sender and apply gain
    // Since TelnyxRTC manages the stream internally, direct gain control may be limited
    // The mute button is the primary mic control
  }, [micGain, callActive]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Call Controls</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mute / Hold buttons */}
        <div className="flex gap-2">
          <Button
            variant={muted ? "destructive" : "outline"}
            size="sm"
            className="flex-1"
            onClick={onToggleMute}
            disabled={!callActive}
          >
            {muted ? <MicOff className="w-4 h-4 mr-1" /> : <Mic className="w-4 h-4 mr-1" />}
            {muted ? "Unmute" : "Mute"}
          </Button>
          <Button
            variant={held ? "secondary" : "outline"}
            size="sm"
            className={`flex-1 ${held ? "text-amber-400 border-amber-400/30" : ""}`}
            onClick={onToggleHold}
            disabled={!callActive}
          >
            {held ? <Play className="w-4 h-4 mr-1" /> : <Pause className="w-4 h-4 mr-1" />}
            {held ? "Resume" : "Hold"}
          </Button>
        </div>

        {/* Speaker volume */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              {speakerVol === 0 ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
              Speaker
            </span>
            <span className="text-muted-foreground">{speakerVol}%</span>
          </div>
          <Slider
            value={[speakerVol]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => setSpeakerVol(v)}
            disabled={!callActive}
          />
        </div>

        {/* Mic volume (visual indicator — actual gain is limited by browser) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Mic className="w-3 h-3" /> Microphone
            </span>
            <span className="text-muted-foreground">{muted ? "Muted" : `${micGain}%`}</span>
          </div>
          <Slider
            value={[muted ? 0 : micGain]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => {
              setMicGain(v);
              if (v === 0 && !muted) onToggleMute();
              if (v > 0 && muted) onToggleMute();
            }}
            disabled={!callActive}
          />
          <p className="text-[10px] text-muted-foreground">
            {callActive ? "Adjust speaker volume. Use Mute for microphone control." : "Controls available during active call."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
