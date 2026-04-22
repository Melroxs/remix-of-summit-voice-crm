import { Navigate } from "react-router-dom";
import { useAuth, type AppRole } from "@/hooks/use-auth";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: AppRole[];
  fallbackPath?: string;
}

export default function RoleGuard({ children, allowedRoles, fallbackPath }: RoleGuardProps) {
  const { role, loading, isClient } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!role) {
    return <Navigate to="/auth" replace />;
  }

  if (!allowedRoles.includes(role)) {
    const redirect = fallbackPath || (isClient ? "/client-portal" : "/");
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}
