/**
 * PACAF Airlift Demo - Main Application
 * Spec Reference: Section 12 (UI/UX Specification)
 * 
 * Orchestrates the complete workflow from upload to load plan generation.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AppScreen,
  AppState,
  AircraftType,
  ParseResult,
  ClassifiedItems,
  AllocationResult,
  InsightsSummary
} from '../lib/pacafTypes';
import { parseMovementList } from '../lib/movementParser';
import { classifyItems } from '../lib/classificationEngine';
import { solveAircraftAllocation } from '../lib/aircraftSolver';
import { analyzeMovementList, analyzeAllocation } from '../lib/insightsEngine';
import UploadScreen from './UploadScreen';
import UrgentBriefScreen from './UrgentBriefScreen';
import LoadPlanViewer from './LoadPlanViewer';
import RoutePlanner from './RoutePlanner';
import { MissionProvider } from '../context/MissionContext';
import MissionWorkspace from './MissionWorkspace';

// Sample data for demo purposes - 23 cargo items + 30 PAX
const SAMPLE_CSV = `item_id,description,length_in,width_in,height_in,weight_lb,lead_tcn,pax
1,AFE SUPPLIES 6 SHI,88,108,80,5133,FYS3P112S200080XX,
2,MHU-226 W/ BINS/EM,200,89,93,6050,FYSHP202S100020XX,
3,HESAMS,88,108,96,8025,FYS3P112S100050XX,
4,LOADER WEAPONS,145,53,41,4090,FYSHP112S100080XX,
5,BRU 61 IN CNU 660,88,108,76,3001,FYSHP112S100420XX,
6,INTEL/OPS 2 (CLASS),88,108,96,6343,FYS3P112S100020XX,
7,LOADERS WEAPONS,145,53,41,4360,FYSHP112S100250XX,
8,AFE SUPPLIES 6 SHI,88,108,80,3300,FYS3P112S200020XX,
9,WEAPONS SUPPORT EQ,88,108,90,6671,FYSHP112S200110XX,
10,Bag Pallet,88,108,67,4300,,
11,PLANT MOBILE N2,87,69,63,3890,FYSHP112S100190XX,
12,TRACTOR TOW,128,55,47,8980,FYSHP112E100210XX,
13,INTEL/OPS 1 (CLASS),88,108,96,3887,FYS3P112S100010XX,
14,TOWBAR ACFT LAND,240,16,9,230,FYSHP102S200290XX,
15,Bag Pallet,88,108,67,4300,,
16,SE AMU,88,108,90,5191,FYSHP112E100010XX,
17,LIGHTNING PRO/-21,88,108,90,2681,FYSHP112E100030XX,
18,F-35 DSP 2,88,108,96,4300,FYSHP112S200640XX,
19,BOS RIG/AV CTK AMU,88,108,90,3235,FYSHP112S100210XX,
20,FIRE BOTTLE AMU,88,108,60,2347,FYSHP112S100050XX,
21,F-35 DSP 1,88,108,96,4300,FYSHP112S200650XX,
22,3EA MHU-141 TRAILE,141,92,94,7950,FYSHP202M100130XX,
23,LOADERS WEAPONS,145,53,41,4090,FYSHP112S100140XX,
24,PAX,,,,,,1
25,PAX,,,,,,1
26,PAX,,,,,,4
27,PAX,,,,,,4
28,PAX,,,,,,20`;

interface PACAPAppProps {
  onDashboard?: () => void;
  onLogout?: () => void;
  userEmail?: string;
  loadPlanId?: number | null;
}

export default function PACAPApp({ onDashboard, onLogout, userEmail, loadPlanId }: PACAPAppProps) {
  const [state, setState] = useState<AppState>({
    currentScreen: 'upload',
    selectedAircraft: 'C-17',
    movementData: null,
    classifiedItems: null,
    allocationResult: null,
    insights: null,
    isProcessing: false,
    error: null
  });

  useEffect(() => {
    if (loadPlanId) {
      loadSavedPlan(loadPlanId);
    }
  }, [loadPlanId]);

  const loadSavedPlan = async (planId: number) => {
    setState(prev => ({ ...prev, isProcessing: true, error: null }));
    
    try {
      const response = await fetch(`/api/flight-plans/${planId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to load flight plan');
      }
      
      const plan = await response.json();
      
      // Check for allocation_data - this is required
      if (!plan.allocation_data) {
        throw new Error('Flight plan has no allocation data. Please create a new plan.');
      }
      
      // allocation_data is stored as { allocation_result, split_flights, routes }
      // We need to unwrap allocation_result from the wrapper
      const savedAllocationData = plan.allocation_data as {
        allocation_result?: AllocationResult;
        split_flights?: any[];
        routes?: any[];
      } | AllocationResult;
      
      // Handle both wrapped format (new) and direct format (legacy)
      const allocationResult: AllocationResult = 
        'allocation_result' in savedAllocationData && savedAllocationData.allocation_result
          ? savedAllocationData.allocation_result
          : savedAllocationData as AllocationResult;
      
      // Validate allocationResult has required properties
      if (!allocationResult || !allocationResult.load_plans) {
        console.error('[LoadSavedPlan] Invalid allocation result structure:', allocationResult);
        throw new Error('Flight plan data is corrupted. Please create a new plan.');
      }
      
      // Handle movement_data - may be null for older plans
      let movementData: ParseResult | null = null;
      let classifiedItems: ClassifiedItems | null = null;
      let combinedInsights: InsightsSummary;
      
      if (plan.movement_data && plan.movement_data.items) {
        // Movement data exists - full restore
        movementData = plan.movement_data as ParseResult;
        classifiedItems = classifyItems(movementData);
        
        const movementInsights = analyzeMovementList(movementData.items, classifiedItems);
        const allocationInsights = analyzeAllocation(allocationResult);
        
        combinedInsights = {
          ...movementInsights,
          insights: [...movementInsights.insights, ...allocationInsights]
        };
      } else {
        // No movement data - limited restore with just allocation insights
        console.warn('[LoadSavedPlan] No movement_data found, using allocation-only insights');
        const allocationInsights = analyzeAllocation(allocationResult);
        combinedInsights = {
          insights: allocationInsights,
          weight_drivers: [],
          volume_drivers: [],
          critical_items: [],
          optimization_opportunities: ['Movement data unavailable - some features may be limited']
        };
      }

      setState(prev => ({
        ...prev,
        movementData,
        classifiedItems,
        allocationResult,
        insights: combinedInsights,
        selectedAircraft: allocationResult.aircraft_type || 'C-17',
        isProcessing: false,
        currentScreen: 'mission_workspace'
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Failed to load flight plan'
      }));
    }
  };

  const processMovementList = useCallback(async (content: string, filename: string) => {
    setState(prev => ({ ...prev, isProcessing: true, error: null }));

    try {
      // Step 1: Parse the movement list (Spec Section 2)
      const parseResult = parseMovementList(content);

      if (parseResult.errors.length > 0 && parseResult.items.length === 0) {
        throw new Error(
          `Failed to parse movement list:\n${parseResult.errors.map(e => e.message).join('\n')}`
        );
      }

      // Step 2: Classify items (Spec Section 3)
      const classified = classifyItems(parseResult);

      // Step 3: Run aircraft allocation solver (Spec Section 8)
      const allocation = solveAircraftAllocation(classified, state.selectedAircraft);

      // Step 4: Generate insights (Spec Section 13)
      const movementInsights = analyzeMovementList(parseResult.items, classified);
      const allocationInsights = analyzeAllocation(allocation);
      
      const combinedInsights: InsightsSummary = {
        ...movementInsights,
        insights: [...movementInsights.insights, ...allocationInsights]
      };

      // Update state with results - go directly to mission workspace
      setState(prev => ({
        ...prev,
        movementData: parseResult,
        classifiedItems: classified,
        allocationResult: allocation,
        insights: combinedInsights,
        isProcessing: false,
        currentScreen: 'mission_workspace'
      }));

    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }));
    }
  }, [state.selectedAircraft]);

  const handleFileUpload = useCallback((content: string, filename: string) => {
    processMovementList(content, filename);
  }, [processMovementList]);

  const handleAircraftSelect = useCallback((type: AircraftType) => {
    setState(prev => ({ ...prev, selectedAircraft: type }));
    
    // Re-process if we already have data
    if (state.movementData) {
      const classified = classifyItems(state.movementData);
      const allocation = solveAircraftAllocation(classified, type);
      const movementInsights = analyzeMovementList(state.movementData.items, classified);
      const allocationInsights = analyzeAllocation(allocation);
      
      setState(prev => ({
        ...prev,
        selectedAircraft: type,
        classifiedItems: classified,
        allocationResult: allocation,
        insights: {
          ...movementInsights,
          insights: [...movementInsights.insights, ...allocationInsights]
        }
      }));
    }
  }, [state.movementData]);

  const handleLoadSampleData = useCallback(() => {
    processMovementList(SAMPLE_CSV, 'sample_movement_list.csv');
  }, [processMovementList]);

  const handleViewLoadPlans = useCallback(() => {
    setState(prev => ({ ...prev, currentScreen: 'load_plans' }));
  }, []);

  const handleBack = useCallback(() => {
    setState(prev => {
      let newScreen: typeof prev.currentScreen = 'upload';
      if (prev.currentScreen === 'load_plans') newScreen = 'brief';
      else if (prev.currentScreen === 'route_planning') newScreen = 'load_plans';
      else if (prev.currentScreen === 'mission_workspace') newScreen = 'load_plans';
      else if (prev.currentScreen === 'brief') newScreen = 'upload';
      return { ...prev, currentScreen: newScreen };
    });
  }, []);

  const handleHome = useCallback(() => {
    setState(prev => ({
      ...prev,
      currentScreen: 'upload',
      movementData: null,
      classifiedItems: null,
      allocationResult: null,
      insights: null,
      error: null
    }));
  }, []);

  const handleRoutePlanning = useCallback(() => {
    setState(prev => ({ ...prev, currentScreen: 'route_planning' }));
  }, []);

  const handleMissionWorkspace = useCallback(() => {
    setState(prev => ({ ...prev, currentScreen: 'mission_workspace' }));
  }, []);

  const handleExport = useCallback(() => {
    alert('PDF export would be generated here. This is a demo placeholder.');
  }, []);

  return (
    <AnimatePresence mode="wait">
      {state.currentScreen === 'upload' && (
        <motion.div
          key="upload"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <UploadScreen
            onFileUpload={handleFileUpload}
            onAircraftSelect={handleAircraftSelect}
            selectedAircraft={state.selectedAircraft}
            isProcessing={state.isProcessing}
            error={state.error}
          />
          {/* Demo: Load Sample Data Button */}
          <div className="fixed bottom-8 right-8">
            <button
              onClick={handleLoadSampleData}
              className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg transition"
            >
              Load Demo Data
            </button>
          </div>
        </motion.div>
      )}

      {state.currentScreen === 'brief' && state.movementData && state.allocationResult && state.insights && (
        <motion.div
          key="brief"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <UrgentBriefScreen
            parseResult={state.movementData}
            allocationResult={state.allocationResult}
            insights={state.insights}
            onViewLoadPlans={handleViewLoadPlans}
            onBack={handleBack}
            onHome={handleHome}
          />
        </motion.div>
      )}

      {state.currentScreen === 'load_plans' && state.allocationResult && state.insights && (
        <motion.div
          key="load_plans"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <LoadPlanViewer
            allocationResult={state.allocationResult}
            insights={state.insights}
            onBack={handleBack}
            onHome={handleHome}
            onExport={handleExport}
            onRoutePlanning={handleRoutePlanning}
            onMissionWorkspace={handleMissionWorkspace}
            onDashboard={onDashboard}
            onLogout={onLogout}
            userEmail={userEmail}
          />
        </motion.div>
      )}

      {state.currentScreen === 'route_planning' && state.allocationResult && (
        <motion.div
          key="route_planning"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <RoutePlanner
            allocationResult={state.allocationResult}
            onBack={handleBack}
            onHome={handleHome}
          />
        </motion.div>
      )}

      {state.currentScreen === 'mission_workspace' && state.allocationResult && state.classifiedItems && (
        <motion.div
          key="mission_workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="min-h-screen"
        >
          <MissionProvider
            parseResult={state.movementData}
            allocationResult={state.allocationResult}
            classifiedItems={state.classifiedItems}
            selectedAircraft={state.selectedAircraft}
            insights={state.insights}
          >
            <MissionWorkspace onBack={handleBack} onHome={handleHome} />
          </MissionProvider>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
