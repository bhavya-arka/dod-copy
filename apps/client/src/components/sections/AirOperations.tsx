import React, { useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import Dashboard from "../Dashboard";
import PACAPApp from "../PACAPApp";
import { User } from "../../hooks/useAuth";

interface AirOperationsProps {
  user: User;
  onBack: () => void;
  onLogout: () => void;
}

type AirMode = "dashboard" | "planning";

export default function AirOperations({
  user,
  onBack,
  onLogout,
}: AirOperationsProps) {
  const [airMode, setAirMode] = useState<AirMode>("dashboard");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const handleStartNew = useCallback(() => {
    setSelectedPlanId(null);
    setAirMode("planning");
  }, []);

  const handleLoadPlan = useCallback((planId: number) => {
    setSelectedPlanId(planId);
    setAirMode("planning");
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setAirMode("dashboard");
    setSelectedPlanId(null);
  }, []);

  if (airMode === "planning") {
    return (
      <PACAPApp
        onDashboard={handleBackToDashboard}
        onLogout={onLogout}
        userEmail={user.email}
        loadPlanId={selectedPlanId}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-border shadow-subtle">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Operations Hub
          </button>
        </div>
      </div>
      <Dashboard
        user={user}
        onLogout={onLogout}
        onStartNew={handleStartNew}
        onLoadPlan={handleLoadPlan}
      />
    </div>
  );
}
