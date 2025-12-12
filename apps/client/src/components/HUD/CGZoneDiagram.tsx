import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CARGO_BAY_DIMENSIONS } from '../../lib/cargoTypes';

interface CGZoneDiagramProps {
  isVisible: boolean;
  centerOfGravityX?: number;
  centerOfGravityZ?: number;
  balanceScore?: number;
}

// Define center of gravity zone boundaries for C-17 aircraft
const CG_ZONE_LIMITS = {
  // Safe zone: center 50% of cargo bay length
  forwardLimit: -CARGO_BAY_DIMENSIONS.length * 0.25, // 25% forward from center
  aftLimit: CARGO_BAY_DIMENSIONS.length * 0.25,      // 25% aft from center
  leftLimit: -CARGO_BAY_DIMENSIONS.width * 0.4,      // 40% left from center
  rightLimit: CARGO_BAY_DIMENSIONS.width * 0.4,      // 40% right from center
  
  // Warning zones extend further
  forwardWarningLimit: -CARGO_BAY_DIMENSIONS.length * 0.35,
  aftWarningLimit: CARGO_BAY_DIMENSIONS.length * 0.35,
  leftWarningLimit: -CARGO_BAY_DIMENSIONS.width * 0.45,
  rightWarningLimit: CARGO_BAY_DIMENSIONS.width * 0.45,
};

export default function CGZoneDiagram({ 
  isVisible, 
  centerOfGravityX = 0, 
  centerOfGravityZ = 0, 
  balanceScore = 0 
}: CGZoneDiagramProps) {
  // Scale factor for display (pixels per meter)
  const scale = 12;
  const diagramWidth = CARGO_BAY_DIMENSIONS.width * scale;
  const diagramLength = CARGO_BAY_DIMENSIONS.length * scale;

  // Convert real coordinates to diagram coordinates
  const cgDisplayX = (centerOfGravityX * scale) + (diagramWidth / 2);
  const cgDisplayZ = (-centerOfGravityZ * scale) + (diagramLength / 2); // Flip Z for top-down view

  // Determine CG zone status
  const getCGZoneStatus = () => {
    const inSafeX = centerOfGravityX >= CG_ZONE_LIMITS.leftLimit && centerOfGravityX <= CG_ZONE_LIMITS.rightLimit;
    const inSafeZ = centerOfGravityZ >= CG_ZONE_LIMITS.forwardLimit && centerOfGravityZ <= CG_ZONE_LIMITS.aftLimit;
    
    const inWarningX = centerOfGravityX >= CG_ZONE_LIMITS.leftWarningLimit && centerOfGravityX <= CG_ZONE_LIMITS.rightWarningLimit;
    const inWarningZ = centerOfGravityZ >= CG_ZONE_LIMITS.forwardWarningLimit && centerOfGravityZ <= CG_ZONE_LIMITS.aftWarningLimit;

    if (inSafeX && inSafeZ) return 'safe';
    if (inWarningX && inWarningZ) return 'warning';
    return 'danger';
  };

  const cgStatus = getCGZoneStatus();

  const statusColors = {
    safe: { bg: 'bg-green-500/20', border: 'border-green-400', glow: 'glow-green', dot: 'bg-green-400' },
    warning: { bg: 'bg-yellow-500/20', border: 'border-yellow-400', glow: 'glow-yellow', dot: 'bg-yellow-400' },
    danger: { bg: 'bg-red-500/20', border: 'border-red-400', glow: 'glow-red', dot: 'bg-red-400' }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed left-1/2 bottom-8 transform -translate-x-1/2 z-40"
          initial={{ y: 100, opacity: 0, scale: 0.8 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 100, opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="angular-panel glass-panel p-4 border border-blue-500/30">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center">
                <div className={`w-3 h-3 rounded-full mr-3 animate-pulse ${statusColors[cgStatus].dot} ${statusColors[cgStatus].glow}`}></div>
                <h3 className="military-title text-sm glow-blue">CENTER OF GRAVITY ZONE</h3>
              </div>
              <div className={`military-title text-xs px-2 py-1 rounded ${statusColors[cgStatus].bg} ${statusColors[cgStatus].border} border ${statusColors[cgStatus].glow}`}>
                {cgStatus.toUpperCase()}
              </div>
            </div>

            {/* CG Zone Diagram */}
            <div className="relative bg-gray-900/80 border border-gray-600/30 rounded p-3">
              <svg
                width={diagramWidth}
                height={diagramLength}
                className="border border-gray-700/50 rounded"
                style={{ maxWidth: '400px', maxHeight: '200px' }}
                viewBox={`0 0 ${diagramWidth} ${diagramLength}`}
              >
                {/* Cargo Bay Outline */}
                <rect
                  x="2"
                  y="2"
                  width={diagramWidth - 4}
                  height={diagramLength - 4}
                  fill="rgba(15, 23, 42, 0.8)"
                  stroke="rgba(71, 85, 105, 0.8)"
                  strokeWidth="2"
                  rx="4"
                />

                {/* Warning Zone */}
                <rect
                  x={(CARGO_BAY_DIMENSIONS.width / 2 + CG_ZONE_LIMITS.leftWarningLimit) * scale}
                  y={(CARGO_BAY_DIMENSIONS.length / 2 + CG_ZONE_LIMITS.forwardWarningLimit) * scale}
                  width={(CG_ZONE_LIMITS.rightWarningLimit - CG_ZONE_LIMITS.leftWarningLimit) * scale}
                  height={(CG_ZONE_LIMITS.aftWarningLimit - CG_ZONE_LIMITS.forwardWarningLimit) * scale}
                  fill="rgba(255, 193, 7, 0.1)"
                  stroke="rgba(255, 193, 7, 0.4)"
                  strokeWidth="1"
                  strokeDasharray="4,2"
                />

                {/* Safe Zone */}
                <rect
                  x={(CARGO_BAY_DIMENSIONS.width / 2 + CG_ZONE_LIMITS.leftLimit) * scale}
                  y={(CARGO_BAY_DIMENSIONS.length / 2 + CG_ZONE_LIMITS.forwardLimit) * scale}
                  width={(CG_ZONE_LIMITS.rightLimit - CG_ZONE_LIMITS.leftLimit) * scale}
                  height={(CG_ZONE_LIMITS.aftLimit - CG_ZONE_LIMITS.forwardLimit) * scale}
                  fill="rgba(34, 197, 94, 0.15)"
                  stroke="rgba(34, 197, 94, 0.6)"
                  strokeWidth="2"
                />

                {/* Center Lines */}
                <line
                  x1={diagramWidth / 2}
                  y1="0"
                  x2={diagramWidth / 2}
                  y2={diagramLength}
                  stroke="rgba(71, 85, 105, 0.6)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <line
                  x1="0"
                  y1={diagramLength / 2}
                  x2={diagramWidth}
                  y2={diagramLength / 2}
                  stroke="rgba(71, 85, 105, 0.6)"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />

                {/* Current Center of Gravity Position */}
                <motion.circle
                  cx={cgDisplayX}
                  cy={cgDisplayZ}
                  r="4"
                  fill={cgStatus === 'safe' ? '#22c55e' : cgStatus === 'warning' ? '#eab308' : '#ef4444'}
                  className={`${statusColors[cgStatus].glow}`}
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
                
                {/* CG Position Crosshairs */}
                <line
                  x1={cgDisplayX - 8}
                  y1={cgDisplayZ}
                  x2={cgDisplayX + 8}
                  y2={cgDisplayZ}
                  stroke={cgStatus === 'safe' ? '#22c55e' : cgStatus === 'warning' ? '#eab308' : '#ef4444'}
                  strokeWidth="1"
                />
                <line
                  x1={cgDisplayX}
                  y1={cgDisplayZ - 8}
                  x2={cgDisplayX}
                  y2={cgDisplayZ + 8}
                  stroke={cgStatus === 'safe' ? '#22c55e' : cgStatus === 'warning' ? '#eab308' : '#ef4444'}
                  strokeWidth="1"
                />
              </svg>

              {/* Labels */}
              <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 military-title">
                FORWARD
              </div>
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 military-title">
                AFT
              </div>
              <div className="absolute top-1/2 left-1 transform -translate-y-1/2 -rotate-90 text-xs text-gray-400 military-title">
                PORT
              </div>
              <div className="absolute top-1/2 right-1 transform -translate-y-1/2 rotate-90 text-xs text-gray-400 military-title">
                STBD
              </div>
            </div>

            {/* CG Position Data */}
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div className="angular-small glass-panel p-2 border border-gray-600/20">
                <div className="text-gray-400 military-title">LATERAL</div>
                <div className={`military-title ${statusColors[cgStatus].glow}`}>
                  {centerOfGravityX >= 0 ? '+' : ''}{centerOfGravityX.toFixed(2)}m
                </div>
              </div>
              <div className="angular-small glass-panel p-2 border border-gray-600/20">
                <div className="text-gray-400 military-title">LONGITUDINAL</div>
                <div className={`military-title ${statusColors[cgStatus].glow}`}>
                  {centerOfGravityZ >= 0 ? '+' : ''}{centerOfGravityZ.toFixed(2)}m
                </div>
              </div>
              <div className="angular-small glass-panel p-2 border border-gray-600/20">
                <div className="text-gray-400 military-title">BALANCE</div>
                <div className={`military-title ${statusColors[cgStatus].glow}`}>
                  {balanceScore.toFixed(0)}%
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-3 flex justify-center space-x-4 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-2 bg-green-500/30 border border-green-400 mr-2"></div>
                <span className="text-gray-400 military-title">SAFE ZONE</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-2 bg-yellow-500/20 border border-yellow-400 border-dashed mr-2"></div>
                <span className="text-gray-400 military-title">WARNING</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-red-400 rounded-full mr-2"></div>
                <span className="text-gray-400 military-title">CURRENT CG</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}