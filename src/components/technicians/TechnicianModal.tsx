import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSaveTechnician, type Technician } from "@/hooks/use-technicians";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  technician?: Technician | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TechnicianModal({ open, onOpenChange, technician }: Props) {
  const save = useSaveTechnician();
  const [name, setName] = useState("");
  const [homeAddress, setHomeAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [skills, setSkills] = useState("");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("17:00");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (open) {
      setName(technician?.name ?? "");
      setHomeAddress(technician?.home_address ?? "");
      setPhone(technician?.phone ?? "");
      setEmail(technician?.email ?? "");
      setSkills((technician?.skills ?? []).join(", "));
      setStart(technician?.working_hours_start?.slice(0, 5) ?? "08:00");
      setEnd(technician?.working_hours_end?.slice(0, 5) ?? "17:00");
      setDays(technician?.working_days ?? [1, 2, 3, 4, 5]);
      setActive(technician?.is_active ?? true);
    }
  }, [open, technician]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const submit = async () => {
    if (!name.trim()) return;
    await save.mutateAsync({
      id: technician?.id,
      name: name.trim(),
      home_address: homeAddress.trim() || null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      working_hours_start: start,
      working_hours_end: end,
      working_days: days,
      is_active: active,
      user_id: technician?.user_id ?? null,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{technician ? "Edit technician" : "Add technician"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Home address</Label>
            <Textarea value={homeAddress} onChange={(e) => setHomeAddress(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Skills (comma separated)</Label>
            <Input
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="solar_install, roof_inspection"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start time</Label>
              <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>End time</Label>
              <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Working days</Label>
            <div className="flex gap-1">
              {DAY_LABELS.map((lbl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`px-2 py-1 rounded text-xs border ${
                    days.includes(i)
                      ? "bg-primary/15 text-primary border-primary/30"
                      : "bg-muted/30 text-muted-foreground border-border"
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={active} onCheckedChange={setActive} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}