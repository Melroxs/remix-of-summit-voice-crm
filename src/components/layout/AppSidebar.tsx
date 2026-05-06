import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Upload,
  Megaphone,
  Phone,
  CalendarClock,
  Disc3,
  BarChart3,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  UserCog,
  Eye,
  Headphones,
  Star,
  BarChart2,
  MessageSquare,
  CalendarCheck,
  ScrollText,
  GraduationCap,
  ListTodo,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import summitLogo from "@/assets/summit-logo.webp";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  roles: string[]; // empty = all roles
}

const allNavItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", roles: ["admin", "agent"] },
  { to: "/contacts", icon: Users, label: "Contacts", roles: ["admin", "agent"] },
  { to: "/imports", icon: Upload, label: "Imports", roles: ["admin"] },
  { to: "/campaigns", icon: Megaphone, label: "Campaigns", roles: ["admin"] },
  { to: "/dialer", icon: Phone, label: "Dialer", roles: ["admin", "agent"] },
  { to: "/scripts", icon: ScrollText, label: "Scripts", roles: ["admin", "agent", "team_leader"] },
  { to: "/callbacks", icon: CalendarClock, label: "Callbacks", roles: ["admin", "agent"] },
  { to: "/appointments", icon: CalendarCheck, label: "Appointments", roles: ["admin", "agent", "team_leader"] },
  { to: "/technicians", icon: Wrench, label: "Technicians", roles: ["admin", "manager", "team_leader"] },
  { to: "/tasks", icon: ListTodo, label: "Follow-ups", roles: ["admin", "agent", "team_leader"] },
  { to: "/training", icon: GraduationCap, label: "Training Hub", roles: ["admin", "agent", "team_leader"] },
  { to: "/recordings", icon: Disc3, label: "Recordings", roles: ["admin"] },
  { to: "/reports", icon: BarChart3, label: "Reports", roles: ["admin"] },
  { to: "/users", icon: UserCog, label: "Users", roles: ["admin"] },
  { to: "/settings", icon: Settings, label: "Settings", roles: ["admin"] },
  { to: "/team-dashboard", icon: Headphones, label: "Team Monitor", roles: ["admin", "team_leader"] },
  { to: "/qa-dashboard", icon: Star, label: "QA Scoring", roles: ["admin", "team_leader"] },
  { to: "/agent-performance", icon: BarChart2, label: "Agent Perf", roles: ["admin", "team_leader"] },
  { to: "/my-feedback", icon: MessageSquare, label: "My Feedback", roles: ["agent"] },
  { to: "/client-portal", icon: Eye, label: "Client Portal", roles: ["client"] },
];

export default function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { role, profile, isAdmin, companies, activeCompanyId, setActiveCompanyId, company } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const navItems = allNavItems.filter(
    (item) => item.roles.length === 0 || (role && item.roles.includes(role))
  );

  return (
    <aside
      className={`fixed left-0 top-0 h-screen bg-sidebar flex flex-col z-50 transition-all duration-300 border-r border-sidebar-border ${
        collapsed ? "w-[68px]" : "w-[240px]"
      }`}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 h-16 border-b border-sidebar-border">
        <img
          src={summitLogo}
          alt="Summit Leads"
          className="w-9 h-9 object-contain shrink-0"
        />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display font-bold text-foreground text-[15px] leading-tight tracking-tight truncate">
              Summit Leads
            </p>
            <p className="text-[10px] uppercase tracking-wider text-sidebar-muted">
              Sales OS
            </p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {/* Company context */}
        {!collapsed && (companies.length > 0) && (
          <div className="mb-3 px-1">
            {isAdmin && companies.length > 1 ? (
              <Select value={activeCompanyId ?? undefined} onValueChange={setActiveCompanyId}>
                <SelectTrigger className="h-9 bg-sidebar-accent/40 border-sidebar-border text-xs">
                  <Building2 className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : company ? (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-sidebar-accent/30 text-xs text-muted-foreground">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{company.name}</span>
              </div>
            ) : null}
          </div>
        )}

        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={isActive ? "sidebar-item-active" : "sidebar-item"}
              title={item.label}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-sidebar-border space-y-1">
        {!collapsed && profile && (
          <div className="flex items-center gap-2 px-2 py-2 mb-1 rounded-md bg-sidebar-accent/40">
            <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
              {(profile.display_name || profile.email || "?").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-sidebar-accent-foreground truncate">{profile.display_name || profile.email}</p>
              <p className="text-[10px] uppercase tracking-wider text-sidebar-muted">{role}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="sidebar-item w-full"
          title="Logout"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="sidebar-item w-full justify-center"
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <ChevronLeft className="w-5 h-5" />
          )}
        </button>
      </div>
    </aside>
  );
}
