import { QueueContact } from "@/hooks/use-dialer-queue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, MapPin, Home, DollarSign, CreditCard, Phone } from "lucide-react";
import { formatPhoneDisplay } from "@/lib/phone";

interface Props {
  lead: QueueContact | null;
}

export default function LeadCard({ lead }: Props) {
  if (!lead) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="w-4 h-4" />
            Active Lead
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No active lead</p>
            <p className="text-muted-foreground text-xs mt-1">Click "Next Lead" to load from queue</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const phone = lead.phone_e164
    ? formatPhoneDisplay(lead.phone_e164)
    : lead.phone_raw || "No phone";

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            {lead.first_name} {lead.last_name}
          </CardTitle>
          <Badge variant="secondary" className="text-xs">
            Attempt #{lead.attempts + 1}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {lead.title && (
          <p className="text-xs text-muted-foreground">{lead.title}</p>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Phone className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono text-foreground">{phone}</span>
        </div>

        {(lead.address || lead.city || lead.state) && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
            <span className="text-muted-foreground">
              {[lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          {lead.owner_renter && (
            <div className="flex items-center gap-1.5">
              <Home className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{lead.owner_renter}</span>
            </div>
          )}
          {lead.home_value && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{lead.home_value}</span>
            </div>
          )}
          {lead.credit_rating && (
            <div className="flex items-center gap-1.5">
              <CreditCard className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{lead.credit_rating}</span>
            </div>
          )}
          {lead.household_income && (
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{lead.household_income}</span>
            </div>
          )}
        </div>

        {lead.cool_notes && (
          <p className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
            {lead.cool_notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
