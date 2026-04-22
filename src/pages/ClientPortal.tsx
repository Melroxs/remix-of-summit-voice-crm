import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, CalendarClock, TrendingUp, Users, BarChart3, AlertTriangle } from "lucide-react";

interface PortalStats {
  totalCalls: number;
  appointmentsBooked: number;
  showRate: number;
  noShows: number;
  upcomingAppointments: number;
}

interface AppointmentRow {
  id: string;
  appointment_at: string;
  status: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  contact_name: string;
}

export default function ClientPortal() {
  const { user } = useAuth();
  const [stats, setStats] = useState<PortalStats>({
    totalCalls: 0,
    appointmentsBooked: 0,
    showRate: 0,
    noShows: 0,
    upcomingAppointments: 0,
  });
  const [upcoming, setUpcoming] = useState<AppointmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientCampaignIds, setClientCampaignIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchPortalData = async () => {
      setLoading(true);

      // Get client's account IDs
      const { data: clientUsers } = await supabase
        .from("client_users")
        .select("client_account_id")
        .eq("user_id", user.id);

      if (!clientUsers || clientUsers.length === 0) {
        setLoading(false);
        return;
      }

      const accountIds = clientUsers.map((cu) => cu.client_account_id);

      // Get campaigns linked to these client accounts
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .in("client_account_id", accountIds);

      const campaignIds = campaigns?.map((c) => c.id) || [];
      setClientCampaignIds(campaignIds);

      if (campaignIds.length === 0) {
        setLoading(false);
        return;
      }

      // Fetch stats in parallel
      const [callsRes, appointmentsRes, upcomingRes] = await Promise.all([
        supabase
          .from("call_logs")
          .select("id", { count: "exact", head: true })
          .in("campaign_id", campaignIds),
        supabase
          .from("appointments")
          .select("id, status")
          .in("campaign_id", campaignIds),
        supabase
          .from("appointments")
          .select("id, appointment_at, status, address, city, state, contact_id")
          .in("campaign_id", campaignIds)
          .gte("appointment_at", new Date().toISOString())
          .order("appointment_at", { ascending: true })
          .limit(20),
      ]);

      const totalAppts = appointmentsRes.data?.length || 0;
      const completedAppts = appointmentsRes.data?.filter((a) => a.status === "completed").length || 0;
      const noShowCount = appointmentsRes.data?.filter((a) => a.status === "no_show").length || 0;

      // Fetch contact names for upcoming
      const upcomingWithNames: AppointmentRow[] = [];
      if (upcomingRes.data) {
        const contactIds = [...new Set(upcomingRes.data.map((a) => a.contact_id))];
        const { data: contacts } = await supabase
          .from("contacts")
          .select("id, first_name, last_name")
          .in("id", contactIds);
        const contactMap = new Map(contacts?.map((c) => [c.id, `${c.first_name} ${c.last_name}`]) || []);

        for (const apt of upcomingRes.data) {
          upcomingWithNames.push({
            id: apt.id,
            appointment_at: apt.appointment_at,
            status: apt.status,
            address: apt.address,
            city: apt.city,
            state: apt.state,
            contact_name: contactMap.get(apt.contact_id) || "Unknown",
          });
        }
      }

      setStats({
        totalCalls: callsRes.count || 0,
        appointmentsBooked: totalAppts,
        showRate: totalAppts > 0 ? Math.round((completedAppts / totalAppts) * 100) : 0,
        noShows: noShowCount,
        upcomingAppointments: upcomingRes.data?.length || 0,
      });
      setUpcoming(upcomingWithNames);
      setLoading(false);
    };

    fetchPortalData();
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Calls", value: stats.totalCalls, icon: Phone, color: "text-primary" },
    { label: "Appointments Booked", value: stats.appointmentsBooked, icon: CalendarClock, color: "text-green-400" },
    { label: "Show Rate", value: `${stats.showRate}%`, icon: TrendingUp, color: "text-amber-400" },
    { label: "No-Shows", value: stats.noShows, icon: AlertTriangle, color: "text-destructive" },
    { label: "Upcoming", value: stats.upcomingAppointments, icon: Users, color: "text-primary" },
  ];

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Client Portal</h1>
        <p className="text-muted-foreground text-sm mt-1">Campaign performance overview</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              What's Happened
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total calls made</span>
              <span className="font-medium text-foreground">{stats.totalCalls}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Appointments booked</span>
              <span className="font-medium text-foreground">{stats.appointmentsBooked}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Completed (showed up)</span>
              <span className="font-medium text-green-400">
                {Math.round((stats.showRate / 100) * stats.appointmentsBooked)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">No-shows</span>
              <span className="font-medium text-destructive">{stats.noShows}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarClock className="w-5 h-5" />
              What's Next
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcoming.length === 0 ? (
              <p className="text-muted-foreground text-sm">No upcoming appointments.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.slice(0, 8).map((apt) => (
                  <div key={apt.id} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                    <div>
                      <span className="font-medium text-foreground">{apt.contact_name}</span>
                      {apt.city && apt.state && (
                        <span className="text-muted-foreground ml-2">• {apt.city}, {apt.state}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {apt.status || "booked"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(apt.appointment_at).toLocaleDateString()} {new Date(apt.appointment_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
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
