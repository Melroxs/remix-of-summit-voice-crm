import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Hash } from "lucide-react";

interface Props {
  onSend: (digit: string) => void;
  disabled: boolean;
}

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["*", "0", "#"],
];

export default function DtmfPad({ onSend, disabled }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Hash className="w-4 h-4" /> DTMF Keypad
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((row) =>
            row.map((key) => (
              <Button
                key={key}
                variant="outline"
                size="sm"
                className="h-9 text-base font-medium"
                onClick={() => onSend(key)}
                disabled={disabled}
              >
                {key}
              </Button>
            ))
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          {disabled ? "Available during active call" : "Send tones to navigate IVR menus"}
        </p>
      </CardContent>
    </Card>
  );
}
