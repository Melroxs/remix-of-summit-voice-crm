import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "manager" | "team_leader" | "agent" | "client";

interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  agent_status: string | null;
  is_active: boolean;
  company_id: string | null;
}

interface Company {
  id: string;
  name: string;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  isClient: boolean;
  company: Company | null;
  companies: Company[];
  activeCompanyId: string | null;
  setActiveCompanyId: (id: string) => void;
  hasRole: (role: AppRole) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null,
  roles: [],
  loading: true,
  isAdmin: false,
  isAgent: false,
  isClient: false,
  company: null,
  companies: [],
  activeCompanyId: null,
  setActiveCompanyId: () => {},
  hasRole: () => false,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);

  const fetchUserData = useCallback(async (userId: string) => {
    try {
      const [profileRes, rolesRes, companiesRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).single(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase.from("companies").select("id, name").order("name"),
      ]);

      if (profileRes.data) {
        const prof = profileRes.data as unknown as Profile;
        // Enforce is_active check: deactivated users are signed out
        if (!prof.is_active) {
          console.warn("[Auth] User is deactivated, signing out");
          await supabase.auth.signOut();
          setProfile(null);
          setRoles([]);
          return;
        }
        setProfile(prof);
      }

      if (rolesRes.data) {
        setRoles(rolesRes.data.map((r) => r.role as AppRole));
      }

      if (companiesRes.data) {
        setCompanies(companiesRes.data as Company[]);
      }

      // Default active company = profile.company_id (or first available)
      const profCompany = (profileRes.data as unknown as Profile | null)?.company_id ?? null;
      const stored = typeof window !== "undefined" ? localStorage.getItem("activeCompanyId") : null;
      const isAdmin = (rolesRes.data ?? []).some((r) => r.role === "admin");
      const fallback = profCompany ?? companiesRes.data?.[0]?.id ?? null;
      const next = isAdmin && stored && companiesRes.data?.some((c) => c.id === stored) ? stored : fallback;
      setActiveCompanyIdState(next);
    } catch (err) {
      console.error("[Auth] Error fetching user data:", err);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession);
        if (newSession?.user) {
          // Use setTimeout to avoid potential deadlock with Supabase auth
          setTimeout(() => fetchUserData(newSession.user.id), 0);
        } else {
          setProfile(null);
          setRoles([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s?.user) {
        fetchUserData(s.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchUserData]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) {
      await fetchUserData(session.user.id);
    }
  }, [session, fetchUserData]);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id);
    if (typeof window !== "undefined") localStorage.setItem("activeCompanyId", id);
  }, []);

  // Primary role = first in priority order: admin > manager > agent > client
  const rolePriority: AppRole[] = ["admin", "manager", "team_leader", "agent", "client"];
  const primaryRole = rolePriority.find((r) => roles.includes(r)) || null;

  const value: AuthContextType = {
    session,
    user: session?.user || null,
    profile,
    role: primaryRole,
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isAgent: roles.includes("agent"),
    isClient: roles.includes("client") && !roles.includes("admin") && !roles.includes("agent"),
    company: companies.find((c) => c.id === activeCompanyId) ?? null,
    companies,
    activeCompanyId,
    setActiveCompanyId,
    hasRole: (role: AppRole) => roles.includes(role),
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
