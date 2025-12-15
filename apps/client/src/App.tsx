/**
 * Arka Cargo Operations Application
 * 
 * Full-featured load planning system with user authentication,
 * persistent storage, and comprehensive airlift planning tools.
 */

import React, { useState, useEffect, useCallback } from "react";
import "@fontsource/inter";
import PACAPApp from "./components/PACAPApp";
import AuthScreen from "./components/AuthScreen";
import Dashboard from "./components/Dashboard";
import { motion } from "framer-motion";
import { useAuthProvider, AuthContext, User } from "./hooks/useAuth";

type AppMode = 'loading' | 'auth' | 'dashboard' | 'planning';

function App() {
  const auth = useAuthProvider();
  const [appMode, setAppMode] = useState<AppMode>('loading');
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  useEffect(() => {
    if (auth.isLoading) {
      setAppMode('loading');
    } else if (auth.isAuthenticated) {
      setAppMode('dashboard');
    } else {
      setAppMode('auth');
    }
  }, [auth.isLoading, auth.isAuthenticated]);

  const handleStartNew = useCallback(() => {
    setSelectedPlanId(null);
    setAppMode('planning');
  }, []);

  const handleLoadPlan = useCallback((planId: number) => {
    setSelectedPlanId(planId);
    setAppMode('planning');
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setAppMode('dashboard');
    setSelectedPlanId(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await auth.logout();
    setAppMode('auth');
  }, [auth]);

  // Loading screen
  if (appMode === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-black flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="text-4xl font-bold text-white mb-4">Arka Cargo Operations</div>
          <div className="text-slate-400">Loading...</div>
        </motion.div>
      </div>
    );
  }

  // Auth screen
  if (appMode === 'auth') {
    return (
      <AuthContext.Provider value={auth}>
        <AuthScreen onLogin={auth.login} onRegister={auth.register} />
      </AuthContext.Provider>
    );
  }

  // Dashboard screen
  if (appMode === 'dashboard' && auth.user) {
    return (
      <AuthContext.Provider value={auth}>
        <Dashboard
          user={auth.user}
          onLogout={handleLogout}
          onStartNew={handleStartNew}
          onLoadPlan={handleLoadPlan}
        />
      </AuthContext.Provider>
    );
  }

  // Planning mode
  return (
    <AuthContext.Provider value={auth}>
      <PACAPApp 
        onDashboard={handleBackToDashboard}
        onLogout={handleLogout}
        userEmail={auth.user?.email}
      />
    </AuthContext.Provider>
  );
}

export default App;
