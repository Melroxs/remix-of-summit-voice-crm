import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Clock, Search, ListTodo, X } from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Task {
  id: string;
  contact_id: string;
  appointment_id: string | null;
  task_type: string;
  title: string;
  description: string | null;
  due_at: string;
  status: string;
  completed_at: string | null;
  assigned_to: string | null;
  contacts?: { first_name: string; last_name: string; phone_e164: string | null } | null;
}

const TYPE_LABEL: Record<string, string> = {
  confirmation_call: "Confirmation",
  reminder_24h: "24h reminder",
  send_appointment_details: "Send details",
  closer_handoff: "Closer handoff",
  post_appointment_followup: "Post-appt",
  custom: "Custom",
};

const TYPE_COLOR: Record<string, string> = {
  confirmation_call: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  reminder_24h: "bg-primary/10 text-primary border-primary/30",
  send_appointment_details: "bg-blue-500/10 text-blue-400 border-blue-500/30",
  closer_handoff: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  post_appointment_followup: "bg-green-500/10 text-green-400 border-green-500/30",
  custom: "bg-muted text-muted-foreground",
};

export default function FollowUpTasks() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("follow_up_tasks")
      .select("*, contacts(first_name,last_name,phone_e164)")
      .order("due_at", { ascending: true });
    setTasks((data as any[]) ?? []);
    setLoading(false);
  }

  async function setStatus(id: string, status: "completed" | "skipped" | "cancelled") {
    const { error } = await supabase
      .from("follow_up_tasks")
      .update({
        status: status as any,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: status === "completed" ? "Task completed" : `Task ${status}` });
      load();
    }
  }

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const name = `${t.contacts?.first_name ?? ""} ${t.contacts?.last_name ?? ""}`.toLowerCase();
        if (!name.includes(q) && !t.title.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, search, statusFilter]);

  const overdueCount = tasks.filter((t) => t.status === "pending" && isPast(new Date(t.due_at))).length;
  const todayCount = tasks.filter((t) => {
    if (t.status !== "pending") return false;
    const d = new Date(t.due_at);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListTodo className="w-6 h-6 text-primary" /> Follow-up tasks
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "task" : "tasks"}
            {overdueCount > 0 && (
              <span className="text-destructive ml-2">• {overdueCount} overdue</span>
            )}
            {todayCount > 0 && (
              <span className="text-amber-400 ml-2">• {todayCount} due today</span>
            )}
          </p>
        </div>
      </header>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks or contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="skipped">Skipped</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <ListTodo className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
          <p className="text-muted-foreground">No tasks match your filters.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => {
            const overdue = t.status === "pending" && isPast(new Date(t.due_at));
            return (
              <Card key={t.id} className={`p-4 ${overdue ? "border-destructive/40" : ""}`}>
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                  <Badge variant="outline" className={TYPE_COLOR[t.task_type] || ""}>
                    {TYPE_LABEL[t.task_type] || t.task_type}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{t.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {t.contacts ? `${t.contacts.first_name} ${t.contacts.last_name}` : "—"}
                      {t.description && <> · {t.description}</>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Clock className={`w-3 h-3 ${overdue ? "text-destructive" : "text-muted-foreground"}`} />
                    <span className={overdue ? "text-destructive font-medium" : "text-muted-foreground"}>
                      {format(new Date(t.due_at), "MMM d, h:mm a")}
                      {" · "}
                      {formatDistanceToNow(new Date(t.due_at), { addSuffix: true })}
                    </span>
                  </div>
                  {t.status === "pending" ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setStatus(t.id, "completed")}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Done
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStatus(t.id, "skipped")}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ) : (
                    <Badge variant="outline" className="capitalize">{t.status}</Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
