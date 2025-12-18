/**
 * Mission Navbar Component
 * Persistent navigation bar with dashboard access, aircraft switcher, and user controls.
 * Updated with minimalist glass UI design.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MissionTab, useMission } from '../context/MissionContext';
import { useAuth } from '../hooks/useAuth';
import { 
  Plane, 
  ClipboardList, 
  HardHat, 
  Calendar, 
  Sun, 
  BarChart3,
  Save,
  ChevronDown,
  ArrowLeft,
  Check,
  FileText,
  CheckCircle
} from 'lucide-react';

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

const TABS: Array<{ id: MissionTab; label: string; icon: React.ReactNode }> = [
  { id: 'flights', label: 'Flights', icon: <Plane className="w-4 h-4" /> },
  { id: 'manifest', label: 'Manifest', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'cargo_split', label: 'Flight Manager', icon: <HardHat className="w-4 h-4" /> },
  { id: 'schedules', label: 'Schedules', icon: <Calendar className="w-4 h-4" /> },
  { id: 'weather', label: 'Weather', icon: <Sun className="w-4 h-4" /> },
  { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> }
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
    <nav className="bg-white/80 backdrop-blur-xl border-b border-neutral-200/50 px-2 sm:px-4 py-2 sm:py-2.5 sticky top-0 z-50 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
          <button
            onClick={onDashboard}
            className="flex items-center gap-1 sm:gap-2 text-neutral-600 hover:text-neutral-900 transition group shrink-0"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
            <span className="font-bold text-primary hidden sm:inline">ARKA</span>
          </button>

          <div className="h-6 w-px bg-neutral-200 hidden sm:block" />

          {loadedPlan && (
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                <span className="shrink-0">
                  {loadedPlan.status === 'complete' ? <CheckCircle className="w-5 h-5 text-green-600" /> : <FileText className="w-5 h-5 text-amber-600" />}
                </span>
                <span className="text-neutral-900 font-medium text-sm sm:text-base truncate max-w-[80px] sm:max-w-none">{loadedPlan.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 hidden sm:inline ${
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
                  className="hidden lg:flex items-center space-x-1.5 bg-green-50 hover:bg-green-100 text-green-600 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isUpdatingStatus ? 'Updating...' : 'Mark Complete'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {showTabs && mission.allocationResult && (
          <div className="flex items-center gap-0.5 sm:gap-1 bg-neutral-100 rounded-lg sm:rounded-xl p-0.5 sm:p-1 overflow-x-auto scrollbar-thin">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => mission.setCurrentTab(tab.id)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg text-xs sm:text-sm transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap ${
                  mission.currentTab === tab.id
                    ? 'bg-white text-neutral-900 shadow-soft font-medium'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {aircraftList.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowAircraftDropdown(!showAircraftDropdown)}
                className="flex items-center gap-1 sm:gap-2 bg-neutral-100 hover:bg-neutral-200 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm transition-colors"
              >
                <Plane className="w-4 h-4 text-neutral-600" />
                <span className="text-neutral-900 font-medium hidden sm:inline">
                  {currentAircraft?.aircraft_id || `Aircraft ${mission.selectedAircraftIndex + 1}`}
                </span>
                <span className="text-neutral-500 text-xs">
                  ({mission.selectedAircraftIndex + 1}/{aircraftList.length})
                </span>
                <ChevronDown className="w-3 h-3 text-neutral-400" />
              </button>

              <AnimatePresence>
                {showAircraftDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full right-0 mt-2 glass-card shadow-glass-lg min-w-[200px] sm:min-w-[220px] overflow-hidden"
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
            <div className="hidden xl:flex items-center gap-3 text-xs">
              <span className="badge">{mission.analytics.total_aircraft} aircraft</span>
              <span className="badge">{mission.analytics.total_pallets} pallets</span>
              <span className="badge">{(mission.analytics.total_weight_lb / 1000).toFixed(0)}K lbs</span>
            </div>
          )}

          {mission.allocationResult && (
            <button
              onClick={async () => {
                if (mission.activePlanId) {
                  await mission.updateConfiguration(mission.activePlanId);
                  alert('Flight plan saved!');
                } else {
                  const name = prompt('Enter a name for this flight plan:');
                  if (name) {
                    await mission.saveConfiguration(name);
                    alert(`Flight plan "${name}" saved successfully!`);
                  }
                }
              }}
              className="flex items-center gap-1 sm:gap-2 bg-primary text-white px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm hover:bg-primary-dark transition-colors shadow-soft"
            >
              <Save className="w-4 h-4" />
              <span className="hidden sm:inline">Save</span>
            </button>
          )}

          <div className="h-6 w-px bg-neutral-200 hidden sm:block" />

          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition"
            >
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-full flex items-center justify-center text-white text-xs sm:text-sm font-bold shadow-soft">
                {user?.username?.charAt(0).toUpperCase() || 'U'}
              </div>
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute top-full right-0 mt-2 glass-card shadow-glass-lg min-w-[180px] sm:min-w-[200px] overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-neutral-200">
                    <div className="text-neutral-900 font-medium text-sm">{user?.username}</div>
                    <div className="text-neutral-500 text-xs truncate">{user?.email}</div>
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
