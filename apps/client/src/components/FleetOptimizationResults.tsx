import React from 'react';
import { motion } from 'framer-motion';
import {
  Plane,
  DollarSign,
  Gauge,
  Target,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  RefreshCw,
  Info,
} from 'lucide-react';

interface FleetOptimizationResultsProps {
  solution: {
    status: 'FEASIBLE' | 'PARTIAL' | 'INFEASIBLE';
    aircraftUsed: Record<string, number>;
    unallocatedCargoIds: string[];
    metrics: {
      totalCost: number;
      totalAircraft: number;
      utilization: number;
      cobAverage: number;
    };
    explanation: string;
    comparisonData?: {
      preferredOnlySolution: {
        status: 'FEASIBLE' | 'PARTIAL' | 'INFEASIBLE';
        aircraftUsed: Record<string, number>;
        totalCost: number;
        totalAircraft: number;
      };
      chosenSolutionRationale: string;
    };
  };
  availability: Array<{
    typeId: string;
    displayName: string;
    count: number;
    locked: boolean;
  }>;
  onRerun?: () => void;
  onClose?: () => void;
}

const statusConfig = {
  FEASIBLE: {
    label: 'Feasible',
    color: 'bg-green-100 text-green-700 border-green-200',
    icon: CheckCircle,
    iconColor: 'text-green-500',
  },
  PARTIAL: {
    label: 'Partial',
    color: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    icon: AlertTriangle,
    iconColor: 'text-yellow-500',
  },
  INFEASIBLE: {
    label: 'Infeasible',
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: XCircle,
    iconColor: 'text-red-500',
  },
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export default function FleetOptimizationResults({
  solution,
  availability,
  onRerun,
  onClose,
}: FleetOptimizationResultsProps) {
  const statusInfo = statusConfig[solution.status];
  const StatusIcon = statusInfo.icon;

  const aircraftUtilization = availability.map((aircraft) => {
    const used = solution.aircraftUsed[aircraft.typeId] || 0;
    const utilPercent = aircraft.count > 0 ? (used / aircraft.count) * 100 : 0;
    const isMaxed = used === aircraft.count && aircraft.count > 0;
    return {
      ...aircraft,
      used,
      utilPercent,
      isMaxed,
    };
  });

  const mostConstrainedAircraft = aircraftUtilization
    .filter((a) => a.isMaxed && a.count > 0)
    .map((a) => a.displayName);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="glass-card p-6 space-y-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Plane className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-900">Fleet Allocation Solution</h2>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${statusInfo.color}`}
              >
                <StatusIcon className={`w-3.5 h-3.5 ${statusInfo.iconColor}`} />
                {statusInfo.label}
              </span>
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-neutral-500" />
          </button>
        )}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200/50">
          <h3 className="text-sm font-semibold text-neutral-700">Aircraft Used vs Available</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-100/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  Aircraft Type
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  Used
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                  Available
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-600 uppercase tracking-wider min-w-[150px]">
                  Utilization
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {aircraftUtilization.map((aircraft) => (
                <tr
                  key={aircraft.typeId}
                  className={`transition-colors ${aircraft.isMaxed ? 'bg-amber-50/50' : 'hover:bg-neutral-50'}`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-neutral-900">{aircraft.displayName}</span>
                      {aircraft.locked && (
                        <span className="text-xs px-1.5 py-0.5 bg-neutral-200 text-neutral-600 rounded">
                          Locked
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`font-semibold ${aircraft.isMaxed ? 'text-amber-600' : 'text-neutral-900'}`}
                    >
                      {aircraft.used}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-neutral-600">{aircraft.count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            aircraft.isMaxed
                              ? 'bg-amber-500'
                              : aircraft.utilPercent > 50
                                ? 'bg-blue-500'
                                : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(aircraft.utilPercent, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-neutral-600 w-12 text-right">
                        {formatPercent(aircraft.utilPercent)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
              {aircraftUtilization.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    No aircraft data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Plane className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Total Aircraft
            </span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {solution.metrics.totalAircraft}
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Total Cost
            </span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {formatCurrency(solution.metrics.totalCost)}
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Gauge className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Avg Utilization
            </span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {formatPercent(solution.metrics.utilization)}
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
              Avg CoB
            </span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {formatPercent(solution.metrics.cobAverage)}
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-neutral-700">Why This Mix</h3>
        </div>
        <p className="text-sm text-neutral-600 leading-relaxed">{solution.explanation}</p>
        {(solution.status === 'PARTIAL' || solution.status === 'INFEASIBLE') &&
          solution.unallocatedCargoIds.length > 0 && (
            <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                <strong>{solution.unallocatedCargoIds.length}</strong> cargo items could not be
                allocated with current fleet availability.
              </p>
            </div>
          )}
      </div>

      {solution.comparisonData && (
        <div className="glass-card p-4">
          <h3 className="text-sm font-semibold text-neutral-700 mb-4">Solution Comparison</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-neutral-700">Preferred-Only Solution</h4>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                    solution.comparisonData.preferredOnlySolution.status === 'FEASIBLE'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {solution.comparisonData.preferredOnlySolution.status === 'FEASIBLE'
                    ? 'Feasible'
                    : 'Infeasible'}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Total Aircraft</span>
                  <span className="font-medium">
                    {solution.comparisonData.preferredOnlySolution.totalAircraft}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Total Cost</span>
                  <span className="font-medium">
                    {formatCurrency(solution.comparisonData.preferredOnlySolution.totalCost)}
                  </span>
                </div>
                <div className="pt-2 border-t border-neutral-200">
                  <span className="text-xs text-neutral-500">Aircraft Breakdown:</span>
                  <div className="mt-1 space-y-1">
                    {Object.entries(
                      solution.comparisonData.preferredOnlySolution.aircraftUsed
                    ).map(([type, count]) => (
                      <div key={type} className="flex justify-between text-xs">
                        <span className="text-neutral-600">{type}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-blue-700">Chosen Solution</h4>
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusInfo.color}`}
                >
                  {statusInfo.label}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Total Aircraft</span>
                  <span className="font-medium">{solution.metrics.totalAircraft}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Total Cost</span>
                  <span className="font-medium">{formatCurrency(solution.metrics.totalCost)}</span>
                </div>
                <div className="pt-2 border-t border-blue-200">
                  <span className="text-xs text-neutral-500">Aircraft Breakdown:</span>
                  <div className="mt-1 space-y-1">
                    {Object.entries(solution.aircraftUsed).map(([type, count]) => (
                      <div key={type} className="flex justify-between text-xs">
                        <span className="text-neutral-600">{type}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 p-3 bg-neutral-100 rounded-lg">
            <p className="text-sm text-neutral-700">
              <strong>Rationale:</strong> {solution.comparisonData.chosenSolutionRationale}
            </p>
          </div>
        </div>
      )}

      {(solution.status === 'PARTIAL' || solution.status === 'INFEASIBLE') &&
        solution.unallocatedCargoIds.length > 0 && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-red-800 mb-1">Allocation Shortfall</h4>
                <p className="text-sm text-red-700 mb-2">
                  {solution.unallocatedCargoIds.length} cargo items remain unallocated.
                </p>
                {mostConstrainedAircraft.length > 0 && (
                  <p className="text-sm text-red-600">
                    <strong>Suggestion:</strong> Consider increasing availability for{' '}
                    {mostConstrainedAircraft.join(', ')} to accommodate the remaining cargo.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

      {onRerun && (
        <div className="flex justify-end pt-2">
          <button onClick={onRerun} className="btn-primary flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Adjust & Rerun
          </button>
        </div>
      )}
    </motion.div>
  );
}
