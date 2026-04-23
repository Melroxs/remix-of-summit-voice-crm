import { useEffect, lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import ErrorBoundary from "@/components/ErrorBoundary";

import AppLayout from "@/components/layout/AppLayout";
import RoleGuard from "@/components/layout/RoleGuard";

const Auth = lazy(() => import("@/pages/Auth"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Contacts = lazy(() => import("@/pages/Contacts"));
const Campaigns = lazy(() => import("@/pages/Campaigns"));
const CampaignDetail = lazy(() => import("@/pages/CampaignDetail"));
const Dialer = lazy(() => import("@/pages/Dialer"));
const Imports = lazy(() => import("@/pages/Imports"));
const Callbacks = lazy(() => import("@/pages/Callbacks"));
const Recordings = lazy(() => import("@/pages/Recordings"));
const Reports = lazy(() => import("@/pages/Reports"));
const CrmSettings = lazy(() => import("@/pages/CrmSettings"));
const UserManagement = lazy(() => import("@/pages/UserManagement"));
const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
const TeamDashboard = lazy(() => import("@/pages/TeamDashboard"));
const QaDashboard = lazy(() => import("@/pages/QaDashboard"));
const AgentPerformance = lazy(() => import("@/pages/AgentPerformance"));
const MyFeedback = lazy(() => import("@/pages/MyFeedback"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Appointments = lazy(() => import("@/pages/Appointments"));
const DialerScripts = lazy(() => import("@/pages/DialerScripts"));
const TrainingHub = lazy(() => import("@/pages/TrainingHub"));
const FollowUpTasks = lazy(() => import("@/pages/FollowUpTasks"));

const queryClient = new QueryClient();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

function RoleRedirect() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (role === "client") return <Navigate to="/client-portal" replace />;
  if (role === "team_leader") return <Navigate to="/team-dashboard" replace />;
  return <Dashboard />;
}

const LazyFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<LazyFallback />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                element={
                  <AuthGuard>
                    <AppLayout />
                  </AuthGuard>
                }
              >
                <Route path="/" element={<ErrorBoundary><RoleRedirect /></ErrorBoundary>} />

                <Route path="/contacts" element={
                  <RoleGuard allowedRoles={["admin", "agent"]}><Contacts /></RoleGuard>
                } />
                <Route path="/dialer" element={
                  <RoleGuard allowedRoles={["admin", "agent"]}><Dialer /></RoleGuard>
                } />
                <Route path="/callbacks" element={
                  <RoleGuard allowedRoles={["admin", "agent"]}><Callbacks /></RoleGuard>
                } />
                <Route path="/appointments" element={
                  <RoleGuard allowedRoles={["admin", "agent", "team_leader"]}><Appointments /></RoleGuard>
                } />
                <Route path="/tasks" element={
                  <RoleGuard allowedRoles={["admin", "agent", "team_leader"]}><FollowUpTasks /></RoleGuard>
                } />
                <Route path="/scripts" element={
                  <RoleGuard allowedRoles={["admin", "agent", "team_leader"]}><DialerScripts /></RoleGuard>
                } />
                <Route path="/training" element={
                  <RoleGuard allowedRoles={["admin", "agent", "team_leader"]}><TrainingHub /></RoleGuard>
                } />

                <Route path="/campaigns" element={
                  <RoleGuard allowedRoles={["admin"]}><Campaigns /></RoleGuard>
                } />
                <Route path="/campaigns/:id" element={
                  <RoleGuard allowedRoles={["admin"]}><CampaignDetail /></RoleGuard>
                } />
                <Route path="/imports" element={
                  <RoleGuard allowedRoles={["admin"]}><Imports /></RoleGuard>
                } />
                <Route path="/recordings" element={
                  <RoleGuard allowedRoles={["admin"]}><Recordings /></RoleGuard>
                } />
                <Route path="/reports" element={
                  <RoleGuard allowedRoles={["admin"]}><Reports /></RoleGuard>
                } />
                <Route path="/settings" element={
                  <RoleGuard allowedRoles={["admin"]}><CrmSettings /></RoleGuard>
                } />
                <Route path="/users" element={
                  <RoleGuard allowedRoles={["admin"]}><UserManagement /></RoleGuard>
                } />

                <Route path="/team-dashboard" element={
                  <RoleGuard allowedRoles={["admin", "team_leader"]}><TeamDashboard /></RoleGuard>
                } />
                <Route path="/qa-dashboard" element={
                  <RoleGuard allowedRoles={["admin", "team_leader"]}><QaDashboard /></RoleGuard>
                } />
                <Route path="/agent-performance" element={
                  <RoleGuard allowedRoles={["admin", "team_leader"]}><AgentPerformance /></RoleGuard>
                } />
                <Route path="/my-feedback" element={
                  <RoleGuard allowedRoles={["admin", "agent", "team_leader"]}><MyFeedback /></RoleGuard>
                } />

                <Route path="/client-portal" element={
                  <RoleGuard allowedRoles={["client", "admin"]}><ClientPortal /></RoleGuard>
                } />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
