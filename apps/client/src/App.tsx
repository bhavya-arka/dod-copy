/**
 * Arka Cargo Operations Application
 *
 * Multi-modal logistics platform with user authentication,
 * persistent storage, and comprehensive cargo planning tools
 * across air, land, sea, and warehouse operations.
 */

import React, { useState, useEffect, useCallback } from "react";
import "@fontsource/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AuthScreen from "./components/AuthScreen";
import OperationsHub, { OperationMode } from "./components/OperationsHub";
import AirOperations from "./components/sections/AirOperations";
import LandLogistics from "./components/sections/LandLogistics";
import SeaFreight from "./components/sections/SeaFreight";
import WarehouseManagement from "./components/sections/WarehouseManagement";
import { motion } from "framer-motion";
import { useAuthProvider, AuthContext } from "./hooks/useAuth";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

type AppMode = "loading" | "auth" | "hub" | "air" | "land" | "sea" | "warehouse";

function AppContent() {
  const auth = useAuthProvider();
  const [appMode, setAppMode] = useState<AppMode>("loading");

  useEffect(() => {
    if (auth.isLoading) {
      setAppMode("loading");
    } else if (auth.isAuthenticated) {
      setAppMode("hub");
    } else {
      setAppMode("auth");
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  const handleSelectMode = useCallback((mode: OperationMode) => {
    setAppMode(mode);
  }, []);

  const handleBackToHub = useCallback(() => {
    setAppMode("hub");
  }, []);

  const handleLogout = useCallback(async () => {
    await auth.logout();
    setAppMode("auth");
  }, [auth]);

  if (appMode === "loading") {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="text-4xl font-bold text-foreground mb-4">
            Arka Cargo Operations
          </div>
          <div className="text-muted-foreground">Loading...</div>
        </motion.div>
      </div>
    );
  }

  if (appMode === "auth") {
    return (
      <AuthContext.Provider value={auth}>
        <AuthScreen onLogin={auth.login} onRegister={auth.register} />
      </AuthContext.Provider>
    );
  }

  if (!auth.user) {
    return null;
  }

  return (
    <AuthContext.Provider value={auth}>
      {appMode === "hub" && (
        <OperationsHub
          user={auth.user}
          onLogout={handleLogout}
          onSelectMode={handleSelectMode}
        />
      )}
      {appMode === "air" && (
        <AirOperations
          user={auth.user}
          onBack={handleBackToHub}
          onLogout={handleLogout}
        />
      )}
      {appMode === "land" && (
        <LandLogistics
          user={auth.user}
          onBack={handleBackToHub}
          onLogout={handleLogout}
        />
      )}
      {appMode === "sea" && (
        <SeaFreight
          user={auth.user}
          onBack={handleBackToHub}
          onLogout={handleLogout}
        />
      )}
      {appMode === "warehouse" && (
        <WarehouseManagement
          user={auth.user}
          onBack={handleBackToHub}
          onLogout={handleLogout}
        />
      )}
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
