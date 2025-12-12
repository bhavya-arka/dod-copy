import React from 'react';
import { motion } from 'framer-motion';

interface MissionHeaderProps {
  palletCount: number;
  humveeCount: number;
  totalItems: number;
  missionStatus: string;
  isAnimating?: boolean;
  onBackToSelection?: () => void;
}

export default function MissionHeader({
  palletCount,
  humveeCount,
  totalItems,
  missionStatus,
  isAnimating,
  onBackToSelection
}: MissionHeaderProps) {
  return (
    <motion.div
      className="fixed top-2 left-4 z-50 max-w-3xl"
      initial={{ y: -60, opacity: 0, scale: 0.9 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
    >
      <div className="angular-panel glass-panel px-4 py-2">
        <div className="flex items-center space-x-4">
          {/* Back Button */}
          {onBackToSelection && (
            <button
              onClick={onBackToSelection}
              className="angular-button glass-panel hover-glow px-2 py-1 text-white military-title text-xs transition-all duration-300 border border-gray-500/30"
            >
              <span className="flex items-center space-x-1">
                <span>←</span>
                <span>BACK</span>
              </span>
            </button>
          )}
          
          {/* Mission Title */}
          <div className="flex items-center">
            <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse mr-2 glow-blue"></div>
            <h1 className="text-sm military-title text-white glow-blue">C-17 CARGO SIMULATION</h1>
          </div>
          
          {/* Divider */}
          <div className="w-px h-6 bg-gradient-to-b from-transparent via-blue-500/50 to-transparent"></div>
          
          {/* Cargo Summary */}
          <div className="flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-blue-400 rounded-full glow-blue"></span>
              <span className="text-blue-300 military-title text-xs">{palletCount}</span>
              <span className="text-gray-400 military-title text-xs">PLT</span>
            </div>
            <span className="text-gray-500">•</span>
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full glow-green"></span>
              <span className="text-green-300 military-title text-xs">{humveeCount}</span>
              <span className="text-gray-400 military-title text-xs">HMV</span>
            </div>
            <span className="text-gray-500">•</span>
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full glow-yellow"></span>
              <span className="text-yellow-300 military-title text-xs">{totalItems}</span>
              <span className="text-gray-400 military-title text-xs">TOT</span>
            </div>
          </div>

          {/* Mission Status - Hidden during cargo optimization */}
          {!isAnimating && (
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${
                missionStatus === 'ACTIVE' ? 'bg-green-400 glow-green' :
                missionStatus === 'PAUSED' ? 'bg-yellow-400 glow-yellow' :
                missionStatus === 'COMPLETE' ? 'bg-blue-400 glow-blue' :
                'bg-green-400 glow-green'
              }`}></div>
              <span className={`military-title text-xs ${
                missionStatus === 'ACTIVE' ? 'glow-green' :
                missionStatus === 'PAUSED' ? 'glow-yellow' :
                missionStatus === 'COMPLETE' ? 'glow-blue' :
                'glow-green'
              }`}>
                {missionStatus}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}