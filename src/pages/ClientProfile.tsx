import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, User, Phone, Mail, MapPin } from "lucide-react";
import ClientDetailsTab from "@/components/clients/ClientDetailsTab";
import ClientNotesTab from "@/components/clients/ClientNotesTab";
import JobCardHistoryTab from "@/components/clients/JobCardHistoryTab";
import ClientPhotosTab from "@/components/clients/ClientPhotosTab";

export default function ClientProfile() {
  const { id } = useParams<{ id: string }>();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading client...</div>;
  }
  if (!client) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Client not found.</p>
        <Link to="/clients"><Button variant="outline" className="mt-4"><ArrowLeft className="w-4 h-4 mr-1" />Back</Button></Link>
      </div>
    );
  }

  const fullName = [client.first_name, client.last_name].filter(Boolean).join(" ") || "Unnamed Client";

  return (
    <div className="space-y-4">
      <Link to="/clients" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Clients
      </Link>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/15 text-primary flex items-center justify-center">
            <User className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{fullName}</h1>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
              {client.phone_e164 && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{client.phone_e164}</span>}
              {client.email && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{client.email}</span>}
              {(client.address || client.city) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {[client.address, client.city, client.state, client.zip_code].filter(Boolean).join(", ")}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Client Details</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="history">Job Card History</TabsTrigger>
          <TabsTrigger value="photos">Job Card Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <ClientDetailsTab client={client} />
        </TabsContent>
        <TabsContent value="notes">
          <ClientNotesTab clientId={client.id} companyId={client.company_id} />
        </TabsContent>
        <TabsContent value="history">
          <JobCardHistoryTab clientId={client.id} />
        </TabsContent>
        <TabsContent value="photos">
          <ClientPhotosTab clientId={client.id} companyId={client.company_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}