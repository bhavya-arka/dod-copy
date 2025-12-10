import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface EdgeTriggersProps {
  showLeftTrigger: boolean;
  showRightTrigger: boolean;
  onLeftClick: () => void;
  onRightClick: () => void;
}

export default function EdgeTriggers({
  showLeftTrigger,
  showRightTrigger,
  onLeftClick,
  onRightClick
}: EdgeTriggersProps) {
  return (
    <>
      {/* Left Edge Trigger */}
      <AnimatePresence>
        {showLeftTrigger && (
          <motion.div
            className="fixed left-0 top-1/2 transform -translate-y-1/2 z-40 cursor-pointer"
            initial={{ x: -60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -60, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onLeftClick}
          >
            <div className="angular-button glass-panel hover-glow border border-blue-500/30 p-3">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-300 glow-blue"></div>
                <div className="transform -rotate-90 military-title text-xs glow-blue whitespace-nowrap">
                  MISSION
                </div>
                <div className="w-3 h-3 bg-blue-400 rounded-full animate-pulse glow-blue"></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right Edge Trigger */}
      <AnimatePresence>
        {showRightTrigger && (
          <motion.div
            className="fixed right-0 top-1/2 transform -translate-y-1/2 z-40 cursor-pointer"
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onRightClick}
          >
            <div className="angular-button glass-panel hover-glow border border-green-500/30 p-3">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-1 h-8 bg-gradient-to-b from-green-500 to-green-300 glow-green"></div>
                <div className="transform -rotate-90 military-title text-xs glow-green whitespace-nowrap">
                  METRICS
                </div>
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse glow-green"></div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}