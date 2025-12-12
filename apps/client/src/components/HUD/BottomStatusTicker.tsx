import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BottomStatusTickerProps {
  isVisible: boolean;
  isAnimating: boolean;
  currentStep: string;
  completionProgress: number;
}

export default function BottomStatusTicker({
  isVisible,
  isAnimating,
  currentStep,
  completionProgress
}: BottomStatusTickerProps) {
  const [statusHistory, setStatusHistory] = useState<string[]>([]);

  useEffect(() => {
    if (currentStep) {
      setStatusHistory(prev => {
        const timestamp = new Date().toLocaleTimeString('en-US', { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });
        const newHistory = [...prev, `${timestamp}: ${currentStep}`];
        return newHistory.slice(-5); // Keep only last 5 messages
      });
    }
  }, [currentStep]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 w-4/5 max-w-5xl"
          initial={{ y: 120, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 120, opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="angular-panel glass-panel p-4">
            {/* Progress Header */}
            <div className="flex items-center mb-3">
              <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse mr-3 glow-yellow"></div>
              <span className="military-title text-sm glow-yellow">MISSION STATUS</span>
              <div className="flex-1 mx-4">
                <div className="angular-small glass-panel p-2 border border-yellow-500/20">
                  <div className="relative w-full bg-gray-700/50 h-2 overflow-hidden angular-small">
                    <motion.div
                      className="h-2 bg-gradient-to-r from-yellow-500 to-orange-500 pulse-glow"
                      initial={{ width: 0 }}
                      animate={{ width: `${completionProgress}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              </div>
              <span className="military-title text-xs text-gray-400">{completionProgress.toFixed(0)}%</span>
            </div>

            {/* Status Messages */}
            <div className="space-y-1 max-h-16 overflow-hidden">
              {statusHistory.slice(-3).map((message, index) => (
                <motion.div
                  key={index}
                  className="military-title text-xs text-gray-300"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 0.8 - (index * 0.2), x: 0 }}
                  transition={{ duration: 0.3 }}
                  style={{ opacity: 0.8 - (index * 0.2) }}
                >
                  {message}
                </motion.div>
              )).reverse()}
            </div>

            {/* Current Active Status */}
            {isAnimating && (
              <motion.div
                className="angular-small glass-panel p-3 border border-yellow-500/30 mt-3"
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <div className="flex items-center">
                  <div className="w-2 h-2 bg-yellow-400 rounded-full mr-3 glow-yellow animate-spin"></div>
                  <span className="military-title text-sm text-yellow-200">{currentStep}</span>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}