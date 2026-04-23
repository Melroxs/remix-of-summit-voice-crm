import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileSpreadsheet, CheckCircle, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { parseCSV, autoMapColumns, processImport, dryRunImport, ColumnMapping, DryRunResult } from "@/lib/csv-import";
import ColumnMapper from "@/components/imports/ColumnMapper";
import { useAuth } from "@/hooks/use-auth";
import ImportDeleteDialog from "@/components/imports/ImportDeleteDialog";

type Step = "upload" | "mapping" | "processing" | "done";

export default function Imports() {
  const { isAdmin } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("upload");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [fileName, setFileName] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const [result, setResult] = useState<{ successful: number; failed: number; duplicates: number } | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteJob, setDeleteJob] = useState<any | null>(null);

  const fetchJobs = useCallback(async () => {
    const { data } = await supabase
      .from("lead_imports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setJobs(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchJobs();
    supabase.from("campaigns").select("id, name").then(({ data }) => setCampaigns(data || []));
  }, [fetchJobs]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".csv")) {
      toast({ title: "Invalid file", description: "Please select a CSV file.", variant: "destructive" });
      return;
    }

    try {
      const { headers, rows } = await parseCSV(file);
      if (rows.length === 0) {
        toast({ title: "Empty file", description: "The CSV file has no data rows.", variant: "destructive" });
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      setFileName(file.name);
      setMapping(autoMapColumns(headers));
      setStep("mapping");
    } catch {
      toast({ title: "Parse error", description: "Failed to parse CSV file.", variant: "destructive" });
    }
  };

  // Recompute dry-run whenever mapping changes during the mapping step
  useEffect(() => {
    if (step !== "mapping" || csvRows.length === 0) return;
    let cancelled = false;
    setDryRunning(true);
    dryRunImport(csvRows, mapping)
      .then((r) => { if (!cancelled) setDryRun(r); })
      .finally(() => { if (!cancelled) setDryRunning(false); });
    return () => { cancelled = true; };
  }, [step, csvRows, mapping]);

  const handleStartImport = async () => {
    setStep("processing");
    setProgress({ processed: 0, total: csvRows.length });

    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    const { data: job, error } = await supabase
      .from("lead_imports")
      .insert({
        filename: fileName,
        total_rows: csvRows.length,
        status: "processing" as any,
        uploaded_by: userId || null,
        campaign_id: campaignId,
        column_mapping: mapping as any,
      })
      .select("id")
      .single();

    if (error || !job) {
      toast({ title: "Error", description: "Failed to create import job.", variant: "destructive" });
      setStep("upload");
      return;
    }

    const importResult = await processImport(
      csvRows,
      mapping,
      job.id,
      campaignId,
      (processed, total) => setProgress({ processed, total })
    );

    setResult(importResult);
    setStep("done");
    fetchJobs();

    toast({
      title: "Import Complete",
      description: `${importResult.successful} imported, ${importResult.duplicates} duplicates, ${importResult.failed - importResult.duplicates} errors.`,
    });
  };

  const resetImport = () => {
    setStep("upload");
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({});
    setFileName("");
    setResult(null);
    setDryRun(null);
    setProgress({ processed: 0, total: 0 });
    if (fileRef.current) fileRef.current.value = "";
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      uploading: "bg-warning/10 text-warning",
      mapping: "bg-primary/10 text-primary",
      processing: "bg-primary/10 text-primary",
      completed: "bg-green-500/10 text-green-400",
      failed: "bg-destructive/10 text-destructive",
    };
    return map[s] || "";
  };

  const handleDeleteComplete = () => {
    setDeleteJob(null);
    fetchJobs();
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CSV Imports</h1>
          <p className="text-muted-foreground text-sm mt-1">Import leads from CSV files</p>
        </div>
        {step !== "upload" && (
          <Button variant="outline" onClick={resetImport}>New Import</Button>
        )}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <Card className="border-dashed border-2">
          <CardContent className="py-12 text-center space-y-4">
            <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
            <div>
              <p className="text-foreground font-medium">Drop your CSV file here</p>
              <p className="text-muted-foreground text-sm mt-1">Supports up to 50,000+ leads with duplicate detection.</p>
            </div>

            {campaigns.length > 0 && (
              <div className="max-w-xs mx-auto">
                <Select value={campaignId || "__none__"} onValueChange={(v) => setCampaignId(v === "__none__" ? null : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Assign to campaign (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No campaign</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Select CSV File
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step: Column Mapping */}
      {step === "mapping" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            <strong>{fileName}</strong> — {csvRows.length.toLocaleString()} rows detected
          </p>
          <ColumnMapper
            csvHeaders={csvHeaders}
            mapping={mapping}
            previewRows={csvRows.slice(0, 3)}
            onMappingChange={setMapping}
            onConfirm={handleStartImport}
            onCancel={resetImport}
          />
        </div>
      )}

      {/* Step: Processing */}
      {step === "processing" && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <Loader2 className="w-10 h-10 text-primary mx-auto animate-spin" />
            <p className="text-foreground font-medium">Importing contacts...</p>
            <div className="max-w-md mx-auto space-y-2">
              <Progress value={progress.total > 0 ? (progress.processed / progress.total) * 100 : 0} />
              <p className="text-sm text-muted-foreground">
                {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} rows
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step: Done */}
      {step === "done" && result && (
        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto" />
            <p className="text-foreground font-medium text-lg">Import Complete</p>
            <div className="flex justify-center gap-6 text-sm">
              <div>
                <p className="text-2xl font-bold text-green-400">{result.successful}</p>
                <p className="text-muted-foreground">Imported</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-400">{result.duplicates}</p>
                <p className="text-muted-foreground">Duplicates</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-destructive">{result.failed - result.duplicates}</p>
                <p className="text-muted-foreground">Errors</p>
              </div>
            </div>
            <Button variant="outline" onClick={resetImport}>Import Another File</Button>
          </CardContent>
        </Card>
      )}

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Import History</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">No imports yet.</p>
          ) : (
            <div className="space-y-3">
              {jobs.map((j) => (
                <div key={j.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="font-medium text-sm text-foreground">{j.filename}</p>
                    <p className="text-xs text-muted-foreground">
                      {j.successful_rows ?? 0}/{j.total_rows ?? 0} rows • {new Date(j.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={statusColor(j.status)}>
                      {j.status}
                    </Badge>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteJob(j)}
                        title="Delete this import and all its contacts"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      {deleteJob && (
        <ImportDeleteDialog
          job={deleteJob}
          onCancel={() => setDeleteJob(null)}
          onDeleted={handleDeleteComplete}
        />
      )}
    </div>
  );
}
