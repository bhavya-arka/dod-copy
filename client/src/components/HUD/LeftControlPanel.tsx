import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeftControlPanelProps {
  isVisible: boolean;
  isMinimized: boolean;
  onToggleMinimize: () => void;
  isAnimating: boolean;
  animationSpeed: number;
  setAnimationSpeed: (speed: number) => void;
  allowRotation: boolean;
  setAllowRotation: (allow: boolean) => void;
  showCGZone: boolean;
  setShowCGZone: (show: boolean) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onAddPallet: () => void;
  onAddHumvee: () => void;
  missionStatus: string;
}

const speedOptions = [0.5, 1.0, 1.5, 2.0];

const AlertMessage = ({ message, type }: { message: string; type: 'info' | 'warning' | 'error' }) => {
  const colors = {
    info: 'text-blue-300 glow-blue',
    warning: 'text-yellow-300 glow-yellow',
    error: 'text-red-300 glow-red'
  };
  
  const icons = {
    info: '📡',
    warning: '⚠️',
    error: '🚨'
  };
  
  return (
    <motion.div
      className="flex items-center space-x-2 p-2 rounded angular-small glass-panel border border-gray-600/20"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <span className="text-xs">{icons[type]}</span>
      <span className={`text-xs military-title ${colors[type]}`}>{message}</span>
    </motion.div>
  );
};

export default function LeftControlPanel({
  isVisible,
  isMinimized,
  onToggleMinimize,
  isAnimating,
  animationSpeed,
  setAnimationSpeed,
  allowRotation,
  setAllowRotation,
  showCGZone,
  setShowCGZone,
  onStart,
  onPause,
  onReset,
  onAddPallet,
  onAddHumvee,
  missionStatus
}: LeftControlPanelProps) {
  const [palletCount, setPalletCount] = useState(2);
  const [humveeCount, setHumveeCount] = useState(1);
  const [activeTab, setActiveTab] = useState<'control' | 'cargo' | 'tactical'>('control');
  const [alerts, setAlerts] = useState<Array<{ id: string; message: string; type: 'info' | 'warning' | 'error'; timestamp: number }>>([]);

  // Add tactical briefing alerts
  useEffect(() => {
    const newAlert = { 
      id: Date.now().toString(), 
      message: palletCount + humveeCount < 2 ? 'ALERT: Cargo bay utilization below 30%. Suggest: Add 2 pallets.' : 'INFO: Cargo configuration nominal.', 
      type: (palletCount + humveeCount < 2 ? 'warning' : 'info') as 'info' | 'warning' | 'error',
      timestamp: Date.now() 
    };
    setAlerts(prev => [newAlert, ...prev.slice(0, 4)]);
  }, [palletCount, humveeCount]);

  useEffect(() => {
    if (missionStatus === 'ACTIVE') {
      const alert = {
        id: Date.now().toString(),
        message: 'OPERATION: Cargo optimization sequence initiated.',
        type: 'info' as const,
        timestamp: Date.now()
      };
      setAlerts(prev => [alert, ...prev.slice(0, 4)]);
    }
  }, [missionStatus]);

  const handleAddPallet = () => {
    setPalletCount(prev => prev + 1);
    onAddPallet();
  };

  const handleAddHumvee = () => {
    setHumveeCount(prev => prev + 1);
    onAddHumvee();
  };

  const getStatusIndicator = () => {
    switch(missionStatus) {
      case 'ACTIVE': return { color: 'bg-green-400 glow-green', text: 'RUNNING', pulse: true };
      case 'PAUSED': return { color: 'bg-yellow-400 glow-yellow', text: 'PAUSED', pulse: false };
      case 'COMPLETE': return { color: 'bg-blue-400 glow-blue', text: 'COMPLETE', pulse: false };
      default: return { color: 'bg-green-400 glow-green', text: 'READY', pulse: true };
    }
  };

  const speedToAngle = (speed: number) => {
    const minAngle = -135;
    const maxAngle = 135;
    const normalizedSpeed = (speed - 0.5) / (2.0 - 0.5);
    return minAngle + normalizedSpeed * (maxAngle - minAngle);
  };

  const handleSpeedKnobInteraction = (event: React.MouseEvent<SVGElement> | React.TouchEvent<SVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    const angle = Math.atan2(clientY - centerY, clientX - centerX) * (180 / Math.PI);
    
    // Clamp to our dial range (-45 to 225 degrees, representing 0.5x to 2.0x)
    let clampedAngle = angle;
    if (clampedAngle < -45) clampedAngle = -45;
    if (clampedAngle > 225) clampedAngle = 225;
    
    // Handle wrap around for angles > 180
    if (clampedAngle > 180) {
      clampedAngle = Math.min(225, clampedAngle);
    } else if (clampedAngle < -45) {
      clampedAngle = -45;
    }
    
    // Convert angle to normalized speed (0 to 1)
    const normalizedSpeed = (clampedAngle + 45) / 270;
    const newSpeed = 0.5 + normalizedSpeed * (2.0 - 0.5);
    const clampedSpeed = Math.max(0.5, Math.min(2.0, newSpeed));
    
    setAnimationSpeed(Math.round(clampedSpeed * 10) / 10);
  };

  const statusIndicator = getStatusIndicator();
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="fixed left-4 top-32 bottom-8 z-50"
          initial={{ x: -350, y: -50, scale: 0.8, opacity: 0 }}
          animate={{ 
            x: 0, 
            y: 0, 
            scale: 1, 
            opacity: 1,
            width: isMinimized ? 50 : 300
          }}
          exit={{ x: -350, y: -50, scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="angular-panel glass-panel h-full overflow-hidden relative">
            {/* Scan line animation */}
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <motion.div
                className="absolute w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent"
                initial={{ top: '0%' }}
                animate={{ top: '100%' }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              />
            </div>
            {/* Minimize/Expand Button */}
            <div className="absolute top-4 right-4 z-10">
              <button
                onClick={onToggleMinimize}
                className="angular-button glass-panel hover-glow w-8 h-8 flex items-center justify-center text-white transition-all duration-300 border border-blue-500/30"
              >
                <span className="text-xs glow-blue">{isMinimized ? '⊞' : '⊟'}</span>
              </button>
            </div>
            
            <div className={`h-full transition-all duration-300 ${isMinimized ? 'opacity-0 pointer-events-none' : 'opacity-100 p-4 overflow-y-auto'}`}>
              {/* Header with Tabs */}
              <div className="mb-4">
                <div className="flex items-center mb-3">
                  <div className={`w-3 h-3 rounded-full mr-3 ${statusIndicator.color} ${statusIndicator.pulse ? 'animate-pulse' : ''}`}></div>
                  <h3 className="military-title text-sm glow-blue">COCKPIT CONTROL</h3>
                </div>
                
                {/* Tab Navigation */}
                <div className="flex space-x-1 mb-4">
                  {[{id: 'control', icon: '⚡', label: 'CTRL'}, {id: 'cargo', icon: '📦', label: 'CARGO'}, {id: 'tactical', icon: '📡', label: 'BRIEF'}].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      className={`angular-button glass-panel px-3 py-2 text-xs military-title transition-all duration-300 ${
                        activeTab === tab.id 
                          ? 'border border-blue-500/50 glow-blue bg-blue-500/10' 
                          : 'border border-gray-600/30 text-gray-400 hover:text-white'
                      }`}
                    >
                      <span className="flex items-center space-x-1">
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              {activeTab === 'control' && (
                <div className="space-y-4">
                  {/* Mission Status - Hidden during cargo optimization */}
                  {!isAnimating && (
                    <div className="angular-small glass-panel p-4 border border-blue-500/30">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-gray-400 military-title">MISSION STATUS</span>
                        <div className={`w-2 h-2 rounded-full ${statusIndicator.color}`}></div>
                      </div>
                      <div className={`military-title text-lg font-black ${statusIndicator.color.replace('bg-', 'text-').replace('glow-', 'glow-')}`}>
                        {statusIndicator.text}
                      </div>
                    </div>
                  )}

                  {/* Simulation Controls */}
                  <div className="angular-small glass-panel p-4 border border-gray-600/30">
                    <div className="text-xs text-gray-400 mb-3 military-title">SIM CONTROLS</div>
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          console.log('START button clicked, isAnimating:', isAnimating);
                          onStart();
                        }}
                        disabled={isAnimating}
                        className={`angular-button glass-panel hover-glow w-full py-2 text-white text-xs military-title transition-all duration-300 border ${
                          isAnimating 
                            ? 'border-gray-600/30 opacity-50 cursor-not-allowed' 
                            : 'border-green-500/50 hover:border-green-500'
                        }`}
                      >
                        <span className="text-green-400 glow-green">START</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          console.log('PAUSE button clicked, isAnimating:', isAnimating);
                          onPause();
                        }}
                        disabled={!isAnimating}
                        className={`angular-button glass-panel hover-glow w-full py-2 text-white text-xs military-title transition-all duration-300 border ${
                          !isAnimating 
                            ? 'border-gray-600/30 opacity-50 cursor-not-allowed' 
                            : 'border-yellow-500/50 hover:border-yellow-500'
                        }`}
                      >
                        <span className="text-yellow-400 glow-yellow">PAUSE</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          console.log('RESET button clicked, isAnimating:', isAnimating);
                          onReset();
                        }}
                        className="angular-button glass-panel hover-glow w-full py-2 text-white text-xs military-title transition-all duration-300 border border-red-500/50 hover:border-red-500"
                      >
                        <span className="text-red-400 glow-red">RESET</span>
                      </button>
                    </div>
                  </div>

                  {/* Speed Control Knob */}
                  <div className="angular-small glass-panel p-4 border border-gray-600/30">
                    <div className="text-xs text-gray-400 mb-3 military-title">SPEED CONTROL</div>
                    <div className="flex items-center justify-center mb-3">
                      <div className="relative w-28 h-28">
                        <svg 
                          className="w-full h-full cursor-pointer" 
                          viewBox="0 0 100 100"
                          onMouseDown={handleSpeedKnobInteraction}
                          onTouchStart={handleSpeedKnobInteraction}
                        >
                          {/* Simplified dial track - just the path between markers */}
                          {(() => {
                            const startAngle = -45; // 0.5x position
                            const endAngle = 225;   // 2.0x position
                            const startX = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
                            const startY = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
                            const endX = 50 + 40 * Math.cos((endAngle * Math.PI) / 180);
                            const endY = 50 + 40 * Math.sin((endAngle * Math.PI) / 180);
                            
                            return (
                              <path
                                d={`M ${startX} ${startY} A 40 40 0 1 1 ${endX} ${endY}`}
                                fill="none"
                                stroke="rgb(75 85 99)"
                                strokeWidth="3"
                                strokeLinecap="round"
                              />
                            );
                          })()}
                          
                          {/* Speed markers */}
                          {speedOptions.map((speed, index) => {
                            const normalizedSpeed = (speed - 0.5) / (2.0 - 0.5);
                            const angle = -45 + (normalizedSpeed * 270);
                            const x1 = 50 + 35 * Math.cos((angle * Math.PI) / 180);
                            const y1 = 50 + 35 * Math.sin((angle * Math.PI) / 180);
                            const x2 = 50 + 45 * Math.cos((angle * Math.PI) / 180);
                            const y2 = 50 + 45 * Math.sin((angle * Math.PI) / 180);
                            return (
                              <line 
                                key={speed} 
                                x1={x1} 
                                y1={y1} 
                                x2={x2} 
                                y2={y2} 
                                stroke="rgb(59 130 246)" 
                                strokeWidth="2" 
                                className="glow-blue" 
                              />
                            );
                          })}
                          
                          {/* Active arc from start to current position */}
                          {(() => {
                            const startAngle = -45;
                            const normalizedSpeed = (animationSpeed - 0.5) / (2.0 - 0.5);
                            const currentAngle = -45 + (normalizedSpeed * 270);
                            const startX = 50 + 40 * Math.cos((startAngle * Math.PI) / 180);
                            const startY = 50 + 40 * Math.sin((startAngle * Math.PI) / 180);
                            const endX = 50 + 40 * Math.cos((currentAngle * Math.PI) / 180);
                            const endY = 50 + 40 * Math.sin((currentAngle * Math.PI) / 180);
                            const largeArcFlag = (currentAngle - startAngle) > 180 ? 1 : 0;
                            
                            return (
                              <path
                                d={`M ${startX} ${startY} A 40 40 0 ${largeArcFlag} 1 ${endX} ${endY}`}
                                fill="none"
                                stroke="rgb(34 197 94)"
                                strokeWidth="4"
                                strokeLinecap="round"
                                className="glow-green"
                              />
                            );
                          })()}
                          
                          {/* Simplified knob handle */}
                          {(() => {
                            const normalizedSpeed = (animationSpeed - 0.5) / (2.0 - 0.5);
                            const angle = -45 + (normalizedSpeed * 270);
                            const x = 50 + 40 * Math.cos((angle * Math.PI) / 180);
                            const y = 50 + 40 * Math.sin((angle * Math.PI) / 180);
                            return (
                              <circle 
                                cx={x} 
                                cy={y} 
                                r="5" 
                                fill="rgb(34 197 94)" 
                                stroke="rgb(255 255 255)" 
                                strokeWidth="2"
                                className="glow-green cursor-grab active:cursor-grabbing"
                              />
                            );
                          })()}
                          
                          {/* Center dot */}
                          <circle cx="50" cy="50" r="2" fill="rgb(156 163 175)" />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-sm font-bold military-title glow-green bg-black/50 px-2 py-1 rounded angular-small">
                            {animationSpeed.toFixed(1)}x
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 military-title">
                      {speedOptions.map(speed => (
                        <button
                          key={speed}
                          onClick={() => setAnimationSpeed(speed)}
                          className={`px-2 py-1 angular-small transition-all duration-300 ${
                            Math.abs(animationSpeed - speed) < 0.1 ? 'glow-green text-green-400' : 'hover:text-white'
                          }`}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Options */}
                  <div className="angular-small glass-panel p-4 border border-gray-600/30">
                    <div className="text-xs text-gray-400 mb-3 military-title">OPTIONS</div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-blue-400">↻</span>
                          <span className="text-gray-300 text-xs military-title">ROTATION</span>
                        </div>
                        <label className="relative cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowRotation}
                            onChange={(e) => setAllowRotation(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-8 h-4 rounded-full transition-all duration-300 ${
                            allowRotation ? 'bg-blue-500 glow-blue' : 'bg-gray-600'
                          }`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-300 ${
                              allowRotation ? 'translate-x-4' : 'translate-x-0'
                            }`}></div>
                          </div>
                        </label>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-yellow-400">⊙</span>
                          <span className="text-gray-300 text-xs military-title">CG ZONE</span>
                        </div>
                        <label className="relative cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showCGZone}
                            onChange={(e) => setShowCGZone(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-8 h-4 rounded-full transition-all duration-300 ${
                            showCGZone ? 'bg-yellow-500 glow-yellow' : 'bg-gray-600'
                          }`}>
                            <div className={`w-4 h-4 bg-white rounded-full shadow transform transition-transform duration-300 ${
                              showCGZone ? 'translate-x-4' : 'translate-x-0'
                            }`}></div>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'cargo' && (
                <div className="space-y-4">
                  {/* Cargo Management */}
                  <div className="angular-small glass-panel p-4 border border-gray-600/30">
                    <div className="text-xs text-gray-400 mb-3 military-title">CARGO INVENTORY</div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="angular-small glass-panel p-3 border border-blue-500/20 text-center">
                        <div className="text-blue-400 text-2xl mb-1">📦</div>
                        <div className="text-blue-400 text-lg font-bold glow-blue">{palletCount}</div>
                        <div className="text-xs text-gray-400 military-title">PALLETS</div>
                      </div>
                      <div className="angular-small glass-panel p-3 border border-green-500/20 text-center">
                        <div className="text-green-400 text-2xl mb-1">🚗</div>
                        <div className="text-green-400 text-lg font-bold glow-green">{humveeCount}</div>
                        <div className="text-xs text-gray-400 military-title">HUMVEES</div>
                      </div>
                    </div>
                  </div>

                  {/* Add Cargo */}
                  <div className="angular-small glass-panel p-4 border border-gray-600/30">
                    <div className="text-xs text-gray-400 mb-3 military-title">ADD CARGO</div>
                    <div className="space-y-3">
                      <button
                        onClick={handleAddPallet}
                        className="angular-button glass-panel hover-glow w-full py-3 text-white text-xs military-title transition-all duration-300 border border-blue-500/50"
                      >
                        <span className="flex items-center justify-center space-x-2">
                          <span className="text-blue-400 glow-blue">📦</span>
                          <span>463L PALLET</span>
                          <span className="text-blue-400 glow-blue">➕</span>
                        </span>
                      </button>
                      <button
                        onClick={handleAddHumvee}
                        className="angular-button glass-panel hover-glow w-full py-3 text-white text-xs military-title transition-all duration-300 border border-green-500/50"
                      >
                        <span className="flex items-center justify-center space-x-2">
                          <span className="text-green-400 glow-green">🚗</span>
                          <span>M1114 HUMVEE</span>
                          <span className="text-green-400 glow-green">➕</span>
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tactical' && (
                <div className="space-y-4">
                  {/* Tactical Briefing Feed */}
                  <div className="angular-small glass-panel p-4 border border-gray-600/30">
                    <div className="text-xs text-gray-400 mb-3 military-title">TACTICAL BRIEFING</div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      <AnimatePresence>
                        {alerts.map((alert) => (
                          <AlertMessage key={alert.id} message={alert.message} type={alert.type} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Minimized State Icon */}
            {isMinimized && (
              <div className="flex flex-col items-center justify-center h-full space-y-4 p-2">
                <div className={`w-3 h-3 rounded-full ${statusIndicator.color} ${statusIndicator.pulse ? 'animate-pulse' : ''}`}></div>
                <div className="transform -rotate-90 military-title text-xs glow-blue">COCKPIT</div>
                <div className="transform -rotate-90 military-title text-xs glow-blue">CTRL</div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}