import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-[68px] lg:ml-[240px] min-h-screen transition-all duration-300">
        <div className="p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
