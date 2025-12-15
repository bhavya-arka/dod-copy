/**
 * Mission Navbar Component
 * Persistent navigation bar with dashboard access, aircraft switcher, and user controls.
 * Updated with minimalist glass UI design.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MissionTab, useMission } from '../context/MissionContext';
import { useAuth } from '../hooks/useAuth';

interface LoadedPlanInfo {
  id: number;
  name: string;
  status: 'draft' | 'complete' | 'archived';
}

interface MissionNavbarProps {
  onDashboard: () => void;
  showTabs?: boolean;
  loadedPlan?: LoadedPlanInfo | null;
  onPlanStatusChange?: (newStatus: 'draft' | 'complete' | 'archived') => void;
}

const TABS: Array<{ id: MissionTab; label: string; icon: string }> = [
  { id: 'flights', label: 'Flights', icon: '✈️' },
  { id: 'manifest', label: 'Manifest', icon: '📋' },
  { id: 'cargo_split', label: 'Flight Manager', icon: '📦' },
  { id: 'schedules', label: 'Schedules', icon: '📅' },
  { id: 'weather', label: 'Weather', icon: '🌤️' },
  { id: 'analytics', label: 'Analytics', icon: '📊' }
];

export default function MissionNavbar({ onDashboard, showTabs = true, loadedPlan, onPlanStatusChange }: MissionNavbarProps) {
  const { user, logout } = useAuth();
  const mission = useMission();
  const [showAircraftDropdown, setShowAircraftDropdown] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const handleMarkComplete = async () => {
    if (!loadedPlan || loadedPlan.status !== 'draft') return;
    
    setIsUpdatingStatus(true);
    try {
      const response = await fetch(`/api/flight-plans/${loadedPlan.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'complete' })
      });
      if (response.ok) {
        onPlanStatusChange?.('complete');
      }
    } catch (error) {
      console.error('Failed to update plan status:', error);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const aircraftList = mission.allocationResult?.load_plans || [];
  const currentAircraft = aircraftList[mission.selectedAircraftIndex];

  const handleLogout = async () => {
    await logout();
    onDashboard();
  };

  return (
    <nav className="bg-white/80 backdrop-blur-xl border-b border-neutral-200/50 px-4 py-2.5 flex items-center justify-between sticky top-0 z-50 shadow-soft">
      <div className="flex items-center space-x-4">
        <button
          onClick={onDashboard}
          className="flex items-center space-x-2 text-neutral-600 hover:text-neutral-900 transition group"
        >
          <span className="text-lg group-hover:-translate-x-0.5 transition-transform">←</span>
          <span className="font-bold text-primary">ARKA</span>
        </button>

        <div className="h-6 w-px bg-neutral-200" />

        {loadedPlan && (
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className="text-lg">
                {loadedPlan.status === 'complete' ? '✅' : '📝'}
              </span>
              <span className="text-neutral-900 font-medium">{loadedPlan.name}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                loadedPlan.status === 'complete' 
                  ? 'bg-green-100 text-green-700'
                  : loadedPlan.status === 'draft'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-neutral-100 text-neutral-700'
              }`}>
                {loadedPlan.status.toUpperCase()}
              </span>
            </div>
            {loadedPlan.status === 'draft' && (
              <button
                onClick={handleMarkComplete}
                disabled={isUpdatingStatus}
                className="flex items-center space-x-1.5 bg-green-50 hover:bg-green-100 text-green-600 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                <span>✓</span>
                <span>{isUpdatingStatus ? 'Updating...' : 'Mark Complete'}</span>
              </button>
            )}
            <div className="h-6 w-px bg-neutral-200" />
          </div>
        )}

        {showTabs && mission.allocationResult && (
          <div className="flex items-center space-x-1 bg-neutral-100 rounded-xl p-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => mission.setCurrentTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center space-x-1.5 ${
                  mission.currentTab === tab.id
                    ? 'bg-white text-neutral-900 shadow-soft font-medium'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden md:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center space-x-4">
        {aircraftList.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowAircraftDropdown(!showAircraftDropdown)}
              className="flex items-center space-x-2 bg-neutral-100 hover:bg-neutral-200 px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <span>✈️</span>
              <span className="text-neutral-900 font-medium">
                {currentAircraft?.aircraft_id || `Aircraft ${mission.selectedAircraftIndex + 1}`}
              </span>
              <span className="text-neutral-500 text-xs">
                ({mission.selectedAircraftIndex + 1}/{aircraftList.length})
              </span>
              <span className="text-neutral-400 text-xs">▼</span>
            </button>

            <AnimatePresence>
              {showAircraftDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full right-0 mt-2 glass-card shadow-glass-lg min-w-[220px] overflow-hidden"
                >
                  {aircraftList.map((plan, idx) => (
                    <button
                      key={plan.aircraft_id}
                      onClick={() => {
                        mission.setSelectedAircraftIndex(idx);
                        setShowAircraftDropdown(false);
                      }}
                      className={`w-full px-4 py-2.5 text-left text-sm flex items-center justify-between transition-colors ${
                        idx === mission.selectedAircraftIndex
                          ? 'bg-primary/10 text-primary'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <span className="font-medium">{plan.aircraft_id}</span>
                      <span className="text-neutral-500 text-xs">
                        {Math.round(plan.total_weight / 1000)}K lbs
                      </span>
                    </button>
                  ))}
                  {aircraftList.length > 1 && (
                    <>
                      <div className="border-t border-neutral-200" />
                      <button
                        onClick={() => {
                          setShowAircraftDropdown(false);
                          mission.setCurrentTab('cargo_split');
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-primary hover:bg-neutral-100 font-medium"
                      >
                        + Add Aircraft / Split Cargo
                      </button>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {mission.analytics && (
          <div className="hidden lg:flex items-center space-x-3 text-xs">
            <span className="badge">{mission.analytics.total_aircraft} aircraft</span>
            <span className="badge">{mission.analytics.total_pallets} pallets</span>
            <span className="badge">{(mission.analytics.total_weight_lb / 1000).toFixed(0)}K lbs</span>
          </div>
        )}

        {mission.allocationResult && (
          <button
            onClick={async () => {
              if (loadedPlan) {
                await mission.updateConfiguration(loadedPlan.id);
                alert('Flight plan saved!');
              } else {
                const name = prompt('Enter a name for this flight plan:');
                if (name) {
                  await mission.saveConfiguration(name);
                  alert(`Flight plan "${name}" saved successfully!`);
                }
              }
            }}
            className="flex items-center space-x-2 bg-primary text-white px-3 py-1.5 rounded-lg text-sm hover:bg-primary-dark transition-colors shadow-soft"
          >
            <span>💾</span>
            <span className="hidden md:inline">Save Plan</span>
          </button>
        )}

        <div className="h-6 w-px bg-neutral-200" />

        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center space-x-2 text-neutral-600 hover:text-neutral-900 transition"
          >
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-bold shadow-soft">
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <span className="hidden md:inline text-sm font-medium">{user?.email}</span>
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full right-0 mt-2 glass-card shadow-glass-lg min-w-[200px] overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-neutral-200">
                  <div className="text-neutral-900 font-medium">{user?.username}</div>
                  <div className="text-neutral-500 text-sm">{user?.email}</div>
                </div>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onDashboard();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-neutral-700 hover:bg-neutral-100 transition-colors"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    handleLogout();
                  }}
                  className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {showAircraftDropdown && (
        <div className="fixed inset-0 z-40" onClick={() => setShowAircraftDropdown(false)} />
      )}
      {showUserMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
      )}
    </nav>
  );
}
