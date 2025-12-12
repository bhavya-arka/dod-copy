import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface OptimizationStep {
  stepId: number;
  description: string;
  cargoId: string;
  fromPosition: [number, number, number];
  toPosition: [number, number, number];
  rotation: [number, number, number];
  reasoning: string;
}

interface RightMetricsPanelProps {
  isVisible: boolean;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  volumeUtilization: number;
  totalItems: number;
  palletCount: number;
  humveeCount: number;
  estimatedVolume: number;
  isOptimal: boolean;
  // Enhanced optimization metrics
  optimizationScore?: number;
  freeSpace?: number;
  weightDistribution?: number;
  balanceScore?: number;
  currentOptimizationStep?: OptimizationStep | null;
}

const AnimatedCounter = ({ value, duration = 500 }: { value: number; duration?: number }) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = displayValue;
    const difference = value - startValue;

    const updateCounter = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      
      setDisplayValue(Math.round(startValue + difference * easeOutQuart));

      if (progress < 1) {
        requestAnimationFrame(updateCounter);
      }
    };

    requestAnimationFrame(updateCounter);
  }, [value, duration, displayValue]);

  return <span className="count-up">{displayValue}</span>;
};

export default function RightMetricsPanel({
  isVisible,
  isMinimized,
  onToggleMinimize,
  volumeUtilization,
  totalItems,
  palletCount,
  humveeCount,
  estimatedVolume,
  isOptimal,
  optimizationScore = 0,
  freeSpace = 0,
  weightDistribution = 0,
  balanceScore = 0,
  currentOptimizationStep
}: RightMetricsPanelProps) {
  const getUtilizationColor = () => {
    if (volumeUtilization > 90) return 'glow-red';
    if (volumeUtilization > 70) return 'glow-yellow';
    return 'glow-green';
  };

  const getEfficiencyStatus = () => {
    if (volumeUtilization > 95) return { status: 'CRITICAL', color: 'glow-red' };
    if (volumeUtilization > 80) return { status: 'OPTIMAL', color: 'glow-green' };
    if (volumeUtilization > 50) return { status: 'OPTIMAL', color: 'glow-green' };
    return { status: 'SUBOPTIMAL', color: 'glow-yellow' };
  };

  const getEfficiencyTips = () => {
    if (volumeUtilization > 95) {
      return [
        { icon: '⚠', text: 'CRITICAL: Bay near capacity', color: 'glow-red' },
        { icon: '⬇', text: 'Consider reducing cargo load', color: 'glow-yellow' },
        { icon: '⚖', text: 'Check weight distribution', color: 'glow-blue' }
      ];
    } else if (volumeUtilization > 80) {
      return [
        { icon: '✓', text: 'OPTIMAL: Efficient space usage', color: 'glow-green' },
        { icon: '📋', text: 'Monitor loading sequence', color: 'glow-blue' },
        { icon: '🔗', text: 'Verify cargo securing points', color: 'glow-blue' }
      ];
    } else if (volumeUtilization > 50) {
      return [
        { icon: '✓', text: 'OPTIMAL: Good space efficiency', color: 'glow-green' },
        { icon: '⬆', text: 'Room for additional cargo', color: 'glow-blue' },
        { icon: '🔄', text: 'Consider rotation options', color: 'glow-blue' }
      ];
    } else {
      return [
        { icon: '⚠', text: 'SUBOPTIMAL: Underutilized capacity', color: 'glow-yellow' },
        { icon: '➕', text: 'Add more cargo items', color: 'glow-green' },
        { icon: '⬆', text: 'Maximize mission efficiency', color: 'glow-blue' }
      ];
    }
  };

  const efficiencyStatus = getEfficiencyStatus();
  const tips = getEfficiencyTips();

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed right-4 top-20 bottom-8 z-50"
          initial={{ x: 350, y: -50, scale: 0.8, opacity: 0 }}
          animate={{ 
            x: 0, 
            y: 0, 
            scale: 1, 
            opacity: 1,
            width: isMinimized ? 50 : 260
          }}
          exit={{ x: 350, y: -50, scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="angular-panel glass-panel h-full overflow-hidden">
            {/* Minimize/Expand Button */}
            <div className="absolute top-4 left-4 z-10">
              <button
                onClick={onToggleMinimize}
                className="angular-button glass-panel hover-glow w-8 h-8 flex items-center justify-center text-white transition-all duration-300 border border-green-500/30"
              >
                <span className="text-xs glow-green">{isMinimized ? '←' : '→'}</span>
              </button>
            </div>
            
            <div className={`h-full transition-all duration-300 ${isMinimized ? 'opacity-0 pointer-events-none' : 'opacity-100 p-4 overflow-y-auto'}`}>
              {/* Header */}
            <div className="flex items-center mb-4">
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse mr-3 glow-green"></div>
              <h3 className="military-title text-sm glow-green">METRICS</h3>
            </div>

            {/* Bay Utilization */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs text-gray-400 military-title">BAY UTILIZATION</span>
                <span className={`text-2xl military-title ${getUtilizationColor()}`}>
                  <AnimatedCounter value={Math.round(volumeUtilization)} />%
                </span>
              </div>
              <div className="angular-small glass-panel p-3 border border-blue-500/20">
                <div className="relative w-full bg-gray-700/50 h-4 overflow-hidden angular-small">
                  <motion.div
                    className={`h-4 relative ${
                      volumeUtilization > 90 ? 'bg-gradient-to-r from-red-500 to-red-600' :
                      volumeUtilization > 70 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                      'bg-gradient-to-r from-green-500 to-green-600'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(volumeUtilization, 100)}%` }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                  >
                    <div className="absolute inset-0 bg-white/20 pulse-glow"></div>
                  </motion.div>
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-2 military-title">
                {estimatedVolume.toFixed(1)} M³ / 858 M³ CAPACITY
              </div>
            </div>

            {/* Cargo Manifest */}
            <div className="mb-4 angular-small glass-panel p-3 border border-blue-500/20">
              <div className="text-xs text-gray-400 mb-2 military-title">CARGO MANIFEST</div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-blue-300 text-xs military-title">463L PALLETS</span>
                  <span className="text-white military-title text-lg glow-blue">
                    <AnimatedCounter value={palletCount} />
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-cyan-300 text-xs military-title">M1114 HUMVEES</span>
                  <span className="text-white military-title text-lg glow-green">
                    <AnimatedCounter value={humveeCount} />
                  </span>
                </div>
                <div className="border-t border-gray-600/50 pt-3 mt-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300 military-title text-xs">TOTAL ITEMS</span>
                    <span className="text-green-400 military-title text-xl glow-green">
                      <AnimatedCounter value={totalItems} />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Efficiency Status */}
            <div className="mb-4 angular-small glass-panel p-3 border border-gray-600/20">
              <div className="flex items-center mb-2">
                <div className={`w-3 h-3 rounded-full mr-3 ${
                  efficiencyStatus.status === 'OPTIMAL' ? 'bg-green-400 glow-green' :
                  efficiencyStatus.status === 'CRITICAL' ? 'bg-red-400 glow-red' :
                  'bg-yellow-400 glow-yellow'
                }`}></div>
                <span className="text-xs text-gray-400 military-title">EFFICIENCY STATUS</span>
              </div>
              <div className={`military-title text-sm ${efficiencyStatus.color}`}>
                {efficiencyStatus.status}
              </div>
            </div>

            {/* Enhanced Optimization Metrics */}
            {optimizationScore > 0 && (
              <>
                {/* Optimization Score */}
                <div className="mb-4 angular-small glass-panel p-3 border border-purple-500/20">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-gray-400 military-title">OPTIMIZATION SCORE</span>
                    <span className={`text-2xl military-title ${
                      optimizationScore >= 80 ? 'glow-green' :
                      optimizationScore >= 60 ? 'glow-yellow' : 'glow-red'
                    }`}>
                      <AnimatedCounter value={Math.round(optimizationScore)} />
                    </span>
                  </div>
                  <div className="relative w-full bg-gray-700/50 h-3 overflow-hidden angular-small">
                    <motion.div
                      className={`h-3 ${
                        optimizationScore >= 80 ? 'bg-gradient-to-r from-green-500 to-green-600' :
                        optimizationScore >= 60 ? 'bg-gradient-to-r from-yellow-500 to-yellow-600' :
                        'bg-gradient-to-r from-red-500 to-red-600'
                      }`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(optimizationScore, 100)}%` }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Space Analysis */}
                <div className="mb-4 angular-small glass-panel p-3 border border-cyan-500/20">
                  <div className="text-xs text-gray-400 mb-2 military-title">SPACE ANALYSIS</div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-xs military-title">FREE SPACE</span>
                      <span className="text-cyan-400 military-title glow-cyan">
                        <AnimatedCounter value={Math.round(freeSpace)} /> M³
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-xs military-title">WEIGHT DIST.</span>
                      <span className={`military-title ${
                        weightDistribution >= 80 ? 'glow-green' :
                        weightDistribution >= 60 ? 'glow-yellow' : 'glow-red'
                      }`}>
                        <AnimatedCounter value={Math.round(weightDistribution)} />%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300 text-xs military-title">BALANCE</span>
                      <span className={`military-title ${
                        balanceScore >= 80 ? 'glow-green' :
                        balanceScore >= 60 ? 'glow-yellow' : 'glow-red'
                      }`}>
                        <AnimatedCounter value={Math.round(balanceScore)} />%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Current Optimization Step */}
                {currentOptimizationStep && (
                  <div className="mb-4 angular-small glass-panel p-3 border border-orange-500/20">
                    <div className="text-xs text-gray-400 mb-2 military-title">OPTIMIZATION STEP</div>
                    <div className="text-orange-400 text-xs military-title glow-orange mb-2">
                      STEP {currentOptimizationStep.stepId}: {currentOptimizationStep.description}
                    </div>
                    <div className="text-xs text-gray-300 military-title leading-relaxed">
                      {currentOptimizationStep.reasoning}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Tactical Briefing */}
            <div>
              <div className="text-xs text-gray-400 mb-2 military-title">TACTICAL BRIEFING</div>
              <div className="space-y-2">
                {tips.map((tip, index) => (
                  <motion.div
                    key={index}
                    className="angular-small glass-panel p-2 border border-gray-600/20 hover-glow"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center">
                      <span className={`mr-3 military-title ${tip.color}`}>{tip.icon}</span>
                      <span className="text-xs text-gray-300 military-title">{tip.text}</span>
                    </div>
                  </motion.div>
                ))}
                </div>
              </div>
            </div>
            
            {/* Minimized State Icon */}
            {isMinimized && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 p-2">
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse glow-green"></div>
                <div className="transform -rotate-90 military-title text-xs glow-green">METRICS</div>
                <div className="flex flex-col items-center space-y-2">
                  <div className={`w-2 h-2 rounded-full ${getUtilizationColor()}`}></div>
                  <div className="transform -rotate-90 military-title text-xs text-gray-400">{Math.round(volumeUtilization)}%</div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}