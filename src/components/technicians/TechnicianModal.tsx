import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSaveTechnician, type Technician } from "@/hooks/use-technicians";
import LocationPicker from "./LocationPicker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

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
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [areaInput, setAreaInput] = useState("");
  const [locationMode, setLocationMode] = useState<"address" | "areas">("address");

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
      setLat(technician?.home_lat ?? null);
      setLng(technician?.home_lng ?? null);
      setServiceAreas(technician?.service_areas ?? []);
      setAreaInput("");
      setLocationMode(
        (technician?.service_areas?.length ?? 0) > 0 && !technician?.home_address
          ? "areas"
          : "address",
      );
    }
  }, [open, technician]);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const submit = async () => {
    if (!name.trim()) return;
    await save.mutateAsync({
      id: technician?.id,
      name: name.trim(),
      home_address: locationMode === "address" ? homeAddress.trim() || null : null,
      phone: phone.trim() || null,
      email: email.trim() || null,
      skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      working_hours_start: start,
      working_hours_end: end,
      working_days: days,
      is_active: active,
      user_id: technician?.user_id ?? null,
      home_lat: locationMode === "address" ? lat : null,
      home_lng: locationMode === "address" ? lng : null,
      service_areas: locationMode === "areas" ? serviceAreas : [],
    });
    onOpenChange(false);
  };

  const addArea = () => {
    const v = areaInput.trim();
    if (!v) return;
    if (!serviceAreas.includes(v)) setServiceAreas([...serviceAreas, v]);
    setAreaInput("");
  };
  const removeArea = (a: string) =>
    setServiceAreas(serviceAreas.filter((x) => x !== a));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{technician ? "Edit technician" : "Add technician"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-2 block">Location</Label>
            <Tabs value={locationMode} onValueChange={(v) => setLocationMode(v as "address" | "areas")}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="address">Home address</TabsTrigger>
                <TabsTrigger value="areas">Service areas</TabsTrigger>
              </TabsList>
              <TabsContent value="address" className="space-y-2 pt-2">
                <Textarea
                  value={homeAddress}
                  onChange={(e) => setHomeAddress(e.target.value)}
                  rows={2}
                  placeholder="Street, City, State ZIP"
                />
                <LocationPicker
                  lat={lat}
                  lng={lng}
                  address={homeAddress}
                  onChange={({ lat: la, lng: ln, address }) => {
                    setLat(la);
                    setLng(ln);
                    if (address) setHomeAddress(address);
                  }}
                />
              </TabsContent>
              <TabsContent value="areas" className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground">
                  Use this when the technician has no fixed home address. Add cities, ZIP codes, or regions they cover.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={areaInput}
                    onChange={(e) => setAreaInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addArea();
                      }
                    }}
                    placeholder="e.g. Phoenix, AZ or 85001"
                  />
                  <Button type="button" variant="outline" onClick={addArea}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                  {serviceAreas.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No areas added yet.</span>
                  ) : (
                    serviceAreas.map((a) => (
                      <Badge key={a} variant="secondary" className="gap-1">
                        {a}
                        <button
                          type="button"
                          onClick={() => removeArea(a)}
                          className="hover:text-destructive"
                          aria-label={`Remove ${a}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
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