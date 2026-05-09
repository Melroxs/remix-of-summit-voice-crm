import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, Image as ImageIcon } from "lucide-react";

export default function ClientPhotosTab({ clientId, companyId }: { clientId: string; companyId: string | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [jobCardId, setJobCardId] = useState<string>("__none__");
  const [filterCard, setFilterCard] = useState<string>("all");
  const [lightbox, setLightbox] = useState<string | null>(null);

  const { data: cards } = useQuery({
    queryKey: ["job_cards_simple", clientId],
    queryFn: async () => {
      const { data } = await supabase
        .from("job_cards")
        .select("id, job_number")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: photos } = useQuery({
    queryKey: ["client_photos", clientId, filterCard],
    queryFn: async () => {
      let q = supabase.from("client_photos").select("*").eq("client_id", clientId).order("uploaded_at", { ascending: false });
      if (filterCard !== "all") q = q.eq("job_card_id", filterCard);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !user) throw new Error("Pick a file");
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${clientId}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("client-photos").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("client_photos").insert({
        client_id: clientId,
        job_card_id: jobCardId !== "__none__" ? jobCardId : null,
        company_id: companyId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        caption: caption || null,
        uploaded_by: user.id,
      });
      if (insErr) throw insErr;
    },
    onSuccess: () => {
      setFile(null);
      setCaption("");
      qc.invalidateQueries({ queryKey: ["client_photos", clientId] });
      toast({ title: "Photo uploaded" });
    },
    onError: (e: any) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Photo file</Label>
            <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div className="space-y-1.5">
            <Label>Attach to job card (optional)</Label>
            <Select value={jobCardId} onValueChange={setJobCardId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Client only —</SelectItem>
                {cards?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.job_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>Caption</Label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Optional caption" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => upload.mutate()} disabled={!file || upload.isPending}>
            <ImagePlus className="w-4 h-4 mr-1" />
            {upload.isPending ? "Uploading..." : "Upload photo"}
          </Button>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <Label className="text-xs">Filter:</Label>
        <Select value={filterCard} onValueChange={setFilterCard}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All photos</SelectItem>
            {cards?.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.job_number}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(photos?.length ?? 0) === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
          No photos yet.
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos?.map((p) => (
            <PhotoTile key={p.id} photo={p} onClick={(url) => setLightbox(url)} />
          ))}
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl">
          {lightbox && <img src={lightbox} alt="" className="w-full h-auto rounded" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhotoTile({ photo, onClick }: { photo: any; onClick: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase.storage.from("client-photos").createSignedUrl(photo.storage_path, 3600).then(({ data }) => {
      if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
    });
    return () => { cancelled = true; };
  }, [photo.storage_path]);

  return (
    <button
      type="button"
      onClick={() => url && onClick(url)}
      className="aspect-square rounded-md overflow-hidden bg-muted border border-border hover:border-primary transition-colors group relative"
    >
      {url ? (
        <img src={url} alt={photo.caption || photo.file_name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
          <ImageIcon className="w-6 h-6" />
        </div>
      )}
      {photo.caption && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1.5 truncate text-left">
          {photo.caption}
        </div>
      )}
    </button>
  );
}