import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageSquare, Star, CheckCircle2, ThumbsUp, AlertTriangle, BookOpen } from "lucide-react";
import { toast } from "sonner";

interface FeedbackRow {
  id: string;
  feedback_type: string;
  message: string;
  acknowledged: boolean;
  created_at: string;
  feedback_by_name: string;
}

interface QaRow {
  id: string;
  total_score: number;
  opening_score: number;
  script_adherence_score: number;
  qualification_score: number;
  objection_handling_score: number;
  communication_score: number;
  compliance_score: number;
  closing_score: number;
  strengths: string | null;
  improvement_feedback: string | null;
  notes: string | null;
  created_at: string;
}

export default function MyFeedback() {
  const { user } = useAuth();
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [qaScores, setQaScores] = useState<QaRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const [{ data: fb }, { data: qa }] = await Promise.all([
        supabase.from("notes").select("*").eq("agent_id", user.id).order("created_at", { ascending: false }),
        supabase.from("qa_reviews").select("*").eq("agent_id", user.id).order("created_at", { ascending: false }),
      ]);

      // Get feedback giver names
      const fbByIds = [...new Set((fb || []).map((f: any) => f.feedback_by))];
      const { data: profiles } = fbByIds.length > 0
        ? await supabase.from("profiles").select("user_id, display_name, email").in("user_id", fbByIds)
        : { data: [] };
      const nameMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => { nameMap[p.user_id] = p.display_name || p.email || "Supervisor"; });

      setFeedback((fb || []).map((f: any) => ({
        id: f.id,
        feedback_type: f.feedback_type,
        message: f.message,
        acknowledged: f.acknowledged,
        created_at: f.created_at,
        feedback_by_name: nameMap[f.feedback_by] || "Supervisor",
      })));

      setQaScores((qa || []).map((q: any) => ({
        id: q.id,
        total_score: Number(q.total_score) || 0,
        opening_score: q.opening_score,
        script_adherence_score: q.script_adherence_score,
        qualification_score: q.qualification_score,
        objection_handling_score: q.objection_handling_score,
        communication_score: q.communication_score,
        compliance_score: q.compliance_score,
        closing_score: q.closing_score,
        strengths: q.strengths,
        improvement_feedback: q.improvement_feedback,
        notes: q.notes,
        created_at: q.created_at,
      })));

      setLoading(false);
    };
    fetch();
  }, [user]);

  const handleAcknowledge = async (id: string) => {
    await supabase.from("notes").update({ acknowledged: true } as any).eq("id", id);
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, acknowledged: true } : f));
    toast.success("Feedback acknowledged");
  };

  const typeIcon = (type: string) => {
    switch (type) {
      case "praise": return <ThumbsUp className="w-4 h-4 text-green-400" />;
      case "improvement": return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case "coaching": return <BookOpen className="w-4 h-4 text-cyan-400" />;
      default: return <MessageSquare className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const scoreColor = (s: number) => s >= 4 ? "text-green-400" : s >= 3 ? "text-amber-400" : "text-red-400";

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Feedback & QA</h1>
        <p className="text-muted-foreground text-sm mt-1">Your coaching feedback and call quality scores</p>
      </div>

      <Tabs defaultValue="feedback">
        <TabsList>
          <TabsTrigger value="feedback" className="gap-1"><MessageSquare className="w-3.5 h-3.5" /> Feedback ({feedback.length})</TabsTrigger>
          <TabsTrigger value="qa" className="gap-1"><Star className="w-3.5 h-3.5" /> QA Scores ({qaScores.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="feedback" className="mt-4 space-y-2">
          {feedback.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No feedback received yet.</p>
            </CardContent></Card>
          ) : feedback.map(f => (
            <Card key={f.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {typeIcon(f.feedback_type)}
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs capitalize">{f.feedback_type}</Badge>
                        <span className="text-xs text-muted-foreground">from {f.feedback_by_name}</span>
                        <span className="text-xs text-muted-foreground">{new Date(f.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm text-foreground">{f.message}</p>
                    </div>
                  </div>
                  {!f.acknowledged && (
                    <Button variant="outline" size="sm" className="shrink-0 text-xs gap-1" onClick={() => handleAcknowledge(f.id)}>
                      <CheckCircle2 className="w-3 h-3" /> Acknowledge
                    </Button>
                  )}
                  {f.acknowledged && (
                    <Badge variant="secondary" className="text-xs gap-1"><CheckCircle2 className="w-3 h-3" /> Acknowledged</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="qa" className="mt-4 space-y-3">
          {qaScores.length === 0 ? (
            <Card><CardContent className="py-12 text-center">
              <Star className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No QA scores yet.</p>
            </CardContent></Card>
          ) : qaScores.map(q => (
            <Card key={q.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">{new Date(q.created_at).toLocaleDateString()}</span>
                  <span className={`text-lg font-bold ${scoreColor(q.total_score)}`}>{q.total_score.toFixed(1)} / 5.0</span>
                </div>
                <div className="grid grid-cols-4 md:grid-cols-7 gap-2 text-xs mb-2">
                  {[
                    { label: "Opening", score: q.opening_score },
                    { label: "Script", score: q.script_adherence_score },
                    { label: "Qualification", score: q.qualification_score },
                    { label: "Objections", score: q.objection_handling_score },
                    { label: "Communication", score: q.communication_score },
                    { label: "Compliance", score: q.compliance_score },
                    { label: "Closing", score: q.closing_score },
                  ].map(c => (
                    <div key={c.label} className="text-center">
                      <p className={`font-bold ${scoreColor(c.score)}`}>{c.score}/5</p>
                      <p className="text-muted-foreground truncate">{c.label}</p>
                    </div>
                  ))}
                </div>
                {q.strengths && <p className="text-xs text-green-400">✓ {q.strengths}</p>}
                {q.improvement_feedback && <p className="text-xs text-amber-400">△ {q.improvement_feedback}</p>}
                {q.notes && <p className="text-xs text-muted-foreground mt-1">{q.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
