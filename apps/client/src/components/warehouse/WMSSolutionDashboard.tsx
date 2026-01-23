import React, { useState, useEffect } from "react";
import { 
  LayoutGrid, 
  Scale, 
  Box, 
  TrendingUp, 
  Link2, 
  Clock, 
  BarChart3, 
  Layers,
  AlertTriangle,
  CheckCircle,
  ArrowRight,
  Zap
} from "lucide-react";

interface SolutionDashboardProps {
  siteId?: number;
  siteName?: string;
  onClose?: () => void;
}

interface LayoutItem {
  id: string;
  name: string;
  zone: string;
  daysInStorage: number;
  turnoverRate: number;
  accessFrequency: number;
  priority: 'high' | 'medium' | 'low';
}

interface LoadBalance {
  siteName: string;
  utilization: number;
  capacity: number;
  trend: 'up' | 'down' | 'stable';
}

interface DimensionalData {
  zone: string;
  cubicFt: number;
  usedCubicFt: number;
  density: number;
}

interface ForecastData {
  month: string;
  predicted: number;
  shipyardCycle: string;
  demand: number;
}

const mockLayoutItems: LayoutItem[] = [
  { id: 'L1', name: 'Valve Assembly F-18', zone: 'A-1', daysInStorage: 45, turnoverRate: 2.3, accessFrequency: 12, priority: 'high' },
  { id: 'L2', name: 'Pump Housing DDG-51', zone: 'B-3', daysInStorage: 120, turnoverRate: 0.5, accessFrequency: 3, priority: 'low' },
  { id: 'L3', name: 'Bearing Kit CVN-78', zone: 'A-2', daysInStorage: 15, turnoverRate: 4.1, accessFrequency: 28, priority: 'high' },
  { id: 'L4', name: 'Filter Element LCS', zone: 'C-1', daysInStorage: 60, turnoverRate: 1.2, accessFrequency: 8, priority: 'medium' },
  { id: 'L5', name: 'Seal Kit T-AO', zone: 'B-2', daysInStorage: 90, turnoverRate: 0.8, accessFrequency: 5, priority: 'medium' },
];

const mockLoadBalance: LoadBalance[] = [
  { siteName: 'San Diego NAS', utilization: 78, capacity: 50000, trend: 'up' },
  { siteName: 'Pearl Harbor', utilization: 65, capacity: 45000, trend: 'stable' },
  { siteName: 'Norfolk', utilization: 82, capacity: 60000, trend: 'up' },
  { siteName: 'Yokosuka', utilization: 55, capacity: 35000, trend: 'down' },
];

const mockDimensionalData: DimensionalData[] = [
  { zone: 'Zone A - Rack', cubicFt: 12000, usedCubicFt: 9600, density: 80 },
  { zone: 'Zone B - Bulk', cubicFt: 25000, usedCubicFt: 17500, density: 70 },
  { zone: 'Zone C - High-Bay', cubicFt: 18000, usedCubicFt: 14400, density: 80 },
  { zone: 'Zone D - Cold', cubicFt: 5000, usedCubicFt: 4250, density: 85 },
];

const mockForecast: ForecastData[] = [
  { month: 'Jan', predicted: 12500, shipyardCycle: 'CVN-78 Overhaul', demand: 15000 },
  { month: 'Feb', predicted: 14200, shipyardCycle: 'DDG-51 Maintenance', demand: 13500 },
  { month: 'Mar', predicted: 16800, shipyardCycle: 'LCS Availability', demand: 18000 },
  { month: 'Apr', predicted: 15500, shipyardCycle: 'Routine Ops', demand: 14000 },
  { month: 'May', predicted: 18200, shipyardCycle: 'CVN-68 DPIA', demand: 20000 },
  { month: 'Jun', predicted: 17000, shipyardCycle: 'Fleet Week', demand: 16500 },
];

const integrations = [
  { name: 'SAP ERP', status: 'connected', lastSync: '2 min ago', icon: '🔗' },
  { name: 'GCSS-A', status: 'connected', lastSync: '5 min ago', icon: '🔗' },
  { name: 'Navy ERP', status: 'connected', lastSync: '1 min ago', icon: '🔗' },
  { name: 'DLA DAAS', status: 'connected', lastSync: '10 min ago', icon: '🔗' },
];

export default function WMSSolutionDashboard({ siteId, siteName, onClose }: SolutionDashboardProps) {
  const [activeTab, setActiveTab] = useState<'layout' | 'balance' | 'density' | 'forecast' | 'integrations'>('layout');
  const [animatedItems, setAnimatedItems] = useState<string[]>([]);

  useEffect(() => {
    const timer = setInterval(() => {
      setAnimatedItems(prev => {
        const randomItem = mockLayoutItems[Math.floor(Math.random() * mockLayoutItems.length)];
        if (prev.includes(randomItem.id)) {
          return prev.filter(id => id !== randomItem.id);
        }
        return [...prev, randomItem.id];
      });
    }, 2000);
    return () => clearInterval(timer);
  }, []);

  const tabs = [
    { id: 'layout', label: 'Dynamic Layouts', icon: <LayoutGrid className="w-4 h-4" /> },
    { id: 'balance', label: 'Load Balancing', icon: <Scale className="w-4 h-4" /> },
    { id: 'density', label: 'Storage Density', icon: <Box className="w-4 h-4" /> },
    { id: 'forecast', label: 'Predictive Forecast', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'integrations', label: 'Integrations', icon: <Link2 className="w-4 h-4" /> },
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'medium': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'low': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  const getUtilizationColor = (util: number) => {
    if (util >= 80) return 'bg-red-500';
    if (util >= 60) return 'bg-amber-500';
    return 'bg-green-500';
  };

  return (
    <div className="bg-[#0f172a] rounded-2xl border border-white/10 overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Zap className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">WMS Solution Dashboard</h2>
              <p className="text-sm text-slate-400">Advanced warehouse optimization features</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white">×</button>
          )}
        </div>
      </div>

      <div className="flex border-b border-white/10">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/10'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab === 'layout' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-blue-400" />
              <h3 className="text-sm font-medium text-white">Dynamic Layouts by Time-in-Storage, Turnover & Access</h3>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {mockLayoutItems.map(item => (
                <div
                  key={item.id}
                  className={`p-4 rounded-xl border transition-all duration-300 ${
                    animatedItems.includes(item.id)
                      ? 'border-blue-500 bg-blue-500/10 scale-[1.02]'
                      : 'border-white/10 bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`px-2 py-1 rounded text-xs font-medium border ${getPriorityColor(item.priority)}`}>
                        {item.priority.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{item.name}</p>
                        <p className="text-xs text-slate-400">Zone: {item.zone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-sm">
                      <div className="text-center">
                        <p className="text-slate-400 text-xs">Days</p>
                        <p className={`font-medium ${item.daysInStorage > 90 ? 'text-red-400' : item.daysInStorage > 60 ? 'text-amber-400' : 'text-green-400'}`}>
                          {item.daysInStorage}
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-slate-400 text-xs">Turnover</p>
                        <p className="text-white font-medium">{item.turnoverRate}x</p>
                      </div>
                      <div className="text-center">
                        <p className="text-slate-400 text-xs">Access/mo</p>
                        <p className="text-white font-medium">{item.accessFrequency}</p>
                      </div>
                      {animatedItems.includes(item.id) && (
                        <div className="flex items-center gap-1 text-blue-400 text-xs">
                          <ArrowRight className="w-4 h-4 animate-pulse" />
                          <span>Relocating...</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-4">
              <p className="text-xs text-blue-300">
                <strong>AI Recommendation:</strong> High-turnover items automatically moved to accessible zones. 
                Low-access items relocated to deep storage for optimal space utilization.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'balance' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="w-5 h-5 text-teal-400" />
              <h3 className="text-sm font-medium text-white">Intra-Site + Inter-Site Load Balancing</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {mockLoadBalance.map((site, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-white/10 bg-slate-800/50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-white">{site.siteName}</h4>
                    <div className={`flex items-center gap-1 text-xs ${
                      site.trend === 'up' ? 'text-red-400' : site.trend === 'down' ? 'text-green-400' : 'text-slate-400'
                    }`}>
                      {site.trend === 'up' ? '↑' : site.trend === 'down' ? '↓' : '→'}
                      {site.trend}
                    </div>
                  </div>
                  <div className="mb-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">Utilization</span>
                      <span className={`font-medium ${site.utilization >= 80 ? 'text-red-400' : 'text-white'}`}>
                        {site.utilization}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getUtilizationColor(site.utilization)} transition-all duration-500`}
                        style={{ width: `${site.utilization}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">Capacity: {site.capacity.toLocaleString()} lbs</p>
                  {site.utilization >= 80 && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Transfer recommended</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="p-3 rounded-lg bg-teal-500/10 border border-teal-500/20 mt-4">
              <p className="text-xs text-teal-300">
                <strong>Load Balance Alert:</strong> Norfolk at 82% - recommend transferring 5,000 lbs to Yokosuka (55% utilization) for optimal distribution.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'density' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-5 h-5 text-purple-400" />
              <h3 className="text-sm font-medium text-white">Automated Dimensional Mapping for Storage Density</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {mockDimensionalData.map((zone, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-white/10 bg-slate-800/50">
                  <h4 className="text-sm font-medium text-white mb-3">{zone.zone}</h4>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="h-16 bg-purple-500/30 rounded-lg flex items-end justify-center overflow-hidden">
                      <div 
                        className="w-full bg-purple-500 transition-all duration-500"
                        style={{ height: `${zone.density}%` }}
                      />
                    </div>
                    <div className="col-span-2 text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-400">Total:</span>
                        <span className="text-white">{zone.cubicFt.toLocaleString()} ft³</span>
                      </div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-400">Used:</span>
                        <span className="text-white">{zone.usedCubicFt.toLocaleString()} ft³</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Density:</span>
                        <span className={`font-medium ${zone.density >= 85 ? 'text-red-400' : zone.density >= 75 ? 'text-amber-400' : 'text-green-400'}`}>
                          {zone.density}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <p className="text-xs text-purple-300">
                <strong>Density Analysis:</strong> Zone D (Cold Storage) at 85% density - consider expansion or redistribution to Zone B (70% density).
              </p>
            </div>
          </div>
        )}

        {activeTab === 'forecast' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-medium text-white">Predictive Demand & Shipyard-Cycle Forecasting</h3>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full">
                <thead className="bg-slate-800/80">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Month</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">Shipyard Cycle</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Predicted (lbs)</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Demand (lbs)</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">Gap</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {mockForecast.map((row, idx) => {
                    const gap = row.demand - row.predicted;
                    return (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="px-4 py-3 text-sm text-white">{row.month}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{row.shipyardCycle}</td>
                        <td className="px-4 py-3 text-sm text-right text-white">{row.predicted.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-white">{row.demand.toLocaleString()}</td>
                        <td className={`px-4 py-3 text-sm text-right font-medium ${gap > 0 ? 'text-red-400' : 'text-green-400'}`}>
                          {gap > 0 ? '+' : ''}{gap.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-300">
                <strong>Forecast Alert:</strong> May shipyard cycle (CVN-68 DPIA) shows 1,800 lbs supply gap - recommend pre-positioning inventory.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'integrations' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Link2 className="w-5 h-5 text-green-400" />
              <h3 className="text-sm font-medium text-white">SAP / GCSS-A / Existing WMS Integration</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {integrations.map((int, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-white/10 bg-slate-800/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{int.icon}</span>
                      <div>
                        <h4 className="text-sm font-medium text-white">{int.name}</h4>
                        <p className="text-xs text-slate-400">Last sync: {int.lastSync}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-green-400 text-xs">
                      <CheckCircle className="w-4 h-4" />
                      <span>Connected</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-4 rounded-xl border border-white/10 bg-slate-800/50">
              <h4 className="text-sm font-medium text-white mb-3">Data Flow Overview</h4>
              <div className="flex items-center justify-between text-xs">
                <div className="text-center">
                  <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mb-1">
                    <span className="text-lg">📦</span>
                  </div>
                  <span className="text-slate-400">SAP ERP</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <div className="text-center">
                  <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mb-1">
                    <span className="text-lg">🔄</span>
                  </div>
                  <span className="text-slate-400">ARKA WMS</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <div className="text-center">
                  <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center mb-1">
                    <span className="text-lg">🎯</span>
                  </div>
                  <span className="text-slate-400">GCSS-A</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500" />
                <div className="text-center">
                  <div className="w-12 h-12 rounded-lg bg-amber-500/20 flex items-center justify-center mb-1">
                    <span className="text-lg">📊</span>
                  </div>
                  <span className="text-slate-400">Navy ERP</span>
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-green-300">
                <strong>Integration Status:</strong> All systems synchronized. Real-time data flow active across SAP, GCSS-A, Navy ERP, and DLA DAAS.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
