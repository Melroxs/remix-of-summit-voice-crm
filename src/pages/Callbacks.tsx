import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, Clock, CheckCircle } from "lucide-react";
import { format, isPast } from "date-fns";
import { toast } from "@/hooks/use-toast";

interface CallbackRow {
  id: string;
  callback_at: string;
  status: string;
  notes: string | null;
  priority: number | null;
  contact_name: string;
  contact_phone: string | null;
  campaign_name: string | null;
}

interface AppointmentRow {
  id: string;
  appointment_at: string;
  status: string;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  contact_name: string;
  campaign_name: string | null;
}

export default function Callbacks() {
  const { user, isAdmin } = useAuth();
  const [callbacks, setCallbacks] = useState<CallbackRow[]>([]);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("pending");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Callbacks
      let cbQuery = supabase
        .from("callbacks")
        .select("*, contacts(first_name, last_name, phone_e164), campaigns(name)")
        .order("callback_at", { ascending: true });

      if (filter !== "all" && (filter === "pending" || filter === "completed" || filter === "missed" || filter === "cancelled")) {
        cbQuery = cbQuery.eq("status", filter);
      }

      const { data: cbData } = await cbQuery;

      setCallbacks(
        (cbData || []).map((cb: any) => ({
          id: cb.id,
          callback_at: cb.callback_at,
          status: cb.status,
          notes: cb.notes,
          priority: cb.priority,
          contact_name: cb.contacts ? `${cb.contacts.first_name} ${cb.contacts.last_name}` : "Unknown",
          contact_phone: cb.contacts?.phone_e164 || null,
          campaign_name: cb.campaigns?.name || null,
        }))
      );

      // Appointments
      let apptQuery = supabase
        .from("appointments")
        .select("*, contacts(first_name, last_name), campaigns(name)")
        .order("appointment_at", { ascending: true })
        .limit(50);

      const { data: apptData } = await apptQuery;

      setAppointments(
        (apptData || []).map((a: any) => ({
          id: a.id,
          appointment_at: a.appointment_at,
          status: a.status,
          address: a.address,
          city: a.city,
          state: a.state,
          notes: a.notes,
          contact_name: a.contacts ? `${a.contacts.first_name} ${a.contacts.last_name}` : "Unknown",
          campaign_name: a.campaigns?.name || null,
        }))
      );

      setLoading(false);
    };
    fetchData();
  }, [filter]);

  const markCompleted = async (id: string) => {
    const { error } = await supabase
      .from("callbacks")
      .update({ status: "completed" as any })
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setCallbacks((prev) => prev.map((cb) => cb.id === id ? { ...cb, status: "completed" } : cb));
      toast({ title: "Callback completed" });
    }
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-warning/10 text-warning",
      completed: "bg-success/10 text-success",
      missed: "bg-destructive/10 text-destructive",
      cancelled: "bg-muted text-muted-foreground",
      booked: "bg-primary/10 text-primary",
      confirmed: "bg-success/10 text-success",
      no_show: "bg-destructive/10 text-destructive",
      rescheduled: "bg-warning/10 text-warning",
    };
    return map[s] || "";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Callbacks & Appointments</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage scheduled callbacks and booked appointments</p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="missed">Missed</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Callbacks ({callbacks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {callbacks.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No callbacks found.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {callbacks.map((cb) => (
                  <div key={cb.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{cb.contact_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(cb.callback_at), "MMM d, yyyy h:mm a")}
                        {isPast(new Date(cb.callback_at)) && cb.status === "pending" && (
                          <span className="text-destructive ml-1">• Overdue</span>
                        )}
                      </p>
                      {cb.campaign_name && (
                        <p className="text-xs text-muted-foreground/70">{cb.campaign_name}</p>
                      )}
                      {cb.notes && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{cb.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <Badge variant="secondary" className={statusColor(cb.status)}>
                        {cb.status}
                      </Badge>
                      {cb.status === "pending" && (
                        <Button variant="ghost" size="icon" onClick={() => markCompleted(cb.id)} title="Mark completed">
                          <CheckCircle className="w-4 h-4 text-success" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              Appointments ({appointments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {appointments.length === 0 ? (
              <div className="text-center py-8">
                <CalendarClock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">No appointments booked yet.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {appointments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-foreground">{a.contact_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(a.appointment_at), "MMM d, yyyy h:mm a")}
                      </p>
                      {(a.address || a.city) && (
                        <p className="text-xs text-muted-foreground/70">
                          {[a.address, a.city, a.state].filter(Boolean).join(", ")}
                        </p>
                      )}
                      {a.campaign_name && (
                        <p className="text-xs text-muted-foreground/70">{a.campaign_name}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className={statusColor(a.status)}>
                      {a.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
