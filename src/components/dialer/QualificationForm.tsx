import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export interface QualificationData {
  homeowner_status: string;
  property_address: string;
  roofing_issue: string;
  job_scope: string;
  urgency: "low" | "medium" | "high" | "urgent";
  insurance_involved: boolean;
  insurance_status: string;
  buying_intent: string;
  timeline: string;
  closer_notes: string;
}

export const emptyQualification: QualificationData = {
  homeowner_status: "owner",
  property_address: "",
  roofing_issue: "",
  job_scope: "unsure",
  urgency: "medium",
  insurance_involved: false,
  insurance_status: "not_filed",
  buying_intent: "warm",
  timeline: "1_3_months",
  closer_notes: "",
};

interface Props {
  value: QualificationData;
  onChange: (next: QualificationData) => void;
  compact?: boolean;
}

export default function QualificationForm({ value, onChange, compact }: Props) {
  const set = <K extends keyof QualificationData>(k: K, v: QualificationData[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Homeowner status</Label>
          <Select value={value.homeowner_status} onValueChange={(v) => set("homeowner_status", v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="owner">Owner</SelectItem>
              <SelectItem value="renter">Renter</SelectItem>
              <SelectItem value="decision_maker_other">Other decision maker</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Roofing issue</Label>
          <Select value={value.roofing_issue} onValueChange={(v) => set("roofing_issue", v)}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="leak">Active leak</SelectItem>
              <SelectItem value="storm_damage">Storm damage</SelectItem>
              <SelectItem value="aging">Aging / wear</SelectItem>
              <SelectItem value="missing_shingles">Missing shingles</SelectItem>
              <SelectItem value="hail">Hail damage</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Property address</Label>
        <Input
          className="h-9"
          value={value.property_address}
          onChange={(e) => set("property_address", e.target.value)}
          placeholder="Confirm property address"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Repair vs replacement</Label>
          <Select value={value.job_scope} onValueChange={(v) => set("job_scope", v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="repair">Repair</SelectItem>
              <SelectItem value="replacement">Replacement</SelectItem>
              <SelectItem value="unsure">Unsure</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Urgency</Label>
          <Select value={value.urgency} onValueChange={(v) => set("urgency", v as any)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Buying intent</Label>
          <Select value={value.buying_intent} onValueChange={(v) => set("buying_intent", v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hot">Hot</SelectItem>
              <SelectItem value="warm">Warm</SelectItem>
              <SelectItem value="cold">Cold</SelectItem>
              <SelectItem value="not_interested">Not interested</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Timeline</Label>
          <Select value={value.timeline} onValueChange={(v) => set("timeline", v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="asap">ASAP</SelectItem>
              <SelectItem value="1_3_months">1–3 months</SelectItem>
              <SelectItem value="3_6_months">3–6 months</SelectItem>
              <SelectItem value="6_plus_months">6+ months</SelectItem>
              <SelectItem value="unknown">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Insurance status</Label>
          <Select value={value.insurance_status} onValueChange={(v) => set("insurance_status", v)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="not_filed">Not filed</SelectItem>
              <SelectItem value="claim_filed">Claim filed</SelectItem>
              <SelectItem value="approved">Claim approved</SelectItem>
              <SelectItem value="denied">Claim denied</SelectItem>
              <SelectItem value="no_insurance">No insurance</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
        <Label className="text-xs">Insurance involved in this job?</Label>
        <Switch
          checked={value.insurance_involved}
          onCheckedChange={(v) => set("insurance_involved", v)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Notes for closer</Label>
        <Textarea
          value={value.closer_notes}
          onChange={(e) => set("closer_notes", e.target.value)}
          placeholder="Key context for the closer..."
          rows={compact ? 2 : 3}
        />
      </div>
    </div>
  );
}
