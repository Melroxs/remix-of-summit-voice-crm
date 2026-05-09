import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function ClientDetailsTab({ client }: { client: any }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    first_name: client.first_name || "",
    last_name: client.last_name || "",
    email: client.email || "",
    phone_e164: client.phone_e164 || "",
    address: client.address || "",
    city: client.city || "",
    state: client.state || "",
    zip_code: client.zip_code || "",
    source: client.source || "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("clients").update(form).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved" });
      qc.invalidateQueries({ queryKey: ["client", client.id] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const F = ({ label, k }: { label: string; k: keyof typeof form }) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  return (
    <Card className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <F label="First name" k="first_name" />
        <F label="Last name" k="last_name" />
        <F label="Email" k="email" />
        <F label="Phone" k="phone_e164" />
        <div className="col-span-2"><F label="Address" k="address" /></div>
        <F label="City" k="city" />
        <F label="State" k="state" />
        <F label="Zip" k="zip_code" />
        <F label="Source" k="source" />
      </div>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}