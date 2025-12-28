/**
 * PACAF Airlift Demo - Urgent Brief Mode
 * Spec Reference: Section 12.2
 * 
 * Quick 1-click output showing aircraft counts and key metrics.
 * Designed for leadership meetings requiring instant aircraft estimates.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  AllocationResult,
  ParseResult,
  InsightsSummary
} from '../lib/pacafTypes';

interface UrgentBriefScreenProps {
  parseResult: ParseResult;
  allocationResult: AllocationResult;
  insights: InsightsSummary;
  onViewLoadPlans: () => void;
  onBack: () => void;
  onHome?: () => void;
}

export default function UrgentBriefScreen({
  parseResult,
  allocationResult,
  insights,
  onViewLoadPlans,
  onBack,
  onHome
}: UrgentBriefScreenProps) {
  const { summary } = parseResult;
  
  return (
    <div className="min-h-screen bg-background p-8">
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="flex items-center space-x-2 text-muted-foreground hover:text-foreground transition bg-card px-4 py-2 rounded-lg border border-border"
          >
            <span>←</span>
            <span>Back</span>
          </button>
          {onHome && (
            <button
              onClick={onHome}
              className="flex items-center space-x-2 text-muted-foreground hover:text-foreground transition bg-card px-4 py-2 rounded-lg border border-border"
            >
              <span>🏠</span>
              <span>Home</span>
            </button>
          )}
        </div>
        <div className="text-muted-foreground text-sm bg-card px-4 py-2 rounded-lg border border-border">
          Arka Cargo Operations • Urgent Brief
        </div>
      </header>

      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-5xl font-bold text-foreground mb-2">
            Mission Aircraft Requirement
          </h1>
          <p className="text-muted-foreground text-lg">
            {allocationResult.aircraft_type} Fleet Allocation Summary
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-3 gap-6 mb-12"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="bg-card backdrop-blur rounded-2xl p-8 text-center border border-border shadow-sm">
            <p className="text-muted-foreground text-lg mb-2">ADVON Aircraft</p>
            <p className="text-7xl font-bold text-blue-600">
              {allocationResult.advon_aircraft}
            </p>
          </div>
          <div className="bg-card backdrop-blur rounded-2xl p-8 text-center border-2 border-blue-500 shadow-lg">
            <p className="text-foreground text-lg mb-2">TOTAL AIRCRAFT</p>
            <p className="text-8xl font-bold text-foreground">
              {allocationResult.total_aircraft}
            </p>
          </div>
          <div className="bg-card backdrop-blur rounded-2xl p-8 text-center border border-border shadow-sm">
            <p className="text-muted-foreground text-lg mb-2">MAIN Aircraft</p>
            <p className="text-7xl font-bold text-green-600">
              {allocationResult.main_aircraft}
            </p>
          </div>
        </motion.div>

        <motion.div
          className="bg-card backdrop-blur rounded-xl p-6 mb-8 border border-border shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h3 className="text-foreground font-bold text-lg mb-4">Weight Distribution</h3>
          <div className="relative h-8 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-blue-500 to-blue-600"
              style={{ width: `${(allocationResult.total_weight / (allocationResult.total_aircraft * 170900)) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-foreground font-bold">
                {allocationResult.total_weight.toLocaleString()} lbs total
              </span>
            </div>
          </div>
          <div className="flex justify-between mt-2 text-sm text-muted-foreground">
            <span>0 lbs</span>
            <span>{(allocationResult.total_aircraft * 170900).toLocaleString()} lbs capacity</span>
          </div>
        </motion.div>

        <motion.div
          className="grid grid-cols-4 gap-4 mb-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="bg-card rounded-lg p-4 text-center border border-border shadow-sm">
            <p className="text-muted-foreground text-sm">Total Pallets</p>
            <p className="text-2xl font-bold text-foreground">{allocationResult.total_pallets}</p>
          </div>
          <div className="bg-card rounded-lg p-4 text-center border border-border shadow-sm">
            <p className="text-muted-foreground text-sm">Rolling Stock</p>
            <p className="text-2xl font-bold text-foreground">{allocationResult.total_rolling_stock}</p>
          </div>
          <div className="bg-card rounded-lg p-4 text-center border border-border shadow-sm">
            <p className="text-muted-foreground text-sm">Personnel</p>
            <p className="text-2xl font-bold text-foreground">{allocationResult.total_pax}</p>
          </div>
          <div className="bg-card rounded-lg p-4 text-center border border-border shadow-sm">
            <p className="text-muted-foreground text-sm">Items Validated</p>
            <p className="text-2xl font-bold text-foreground">{summary.valid_items}</p>
          </div>
        </motion.div>

        <motion.div
          className="bg-card backdrop-blur rounded-xl p-6 mb-8 border border-border shadow-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <h3 className="text-foreground font-bold text-lg mb-4">Top 5 Heaviest Items</h3>
          <div className="space-y-3">
            {insights.weight_drivers.slice(0, 5).map((item, idx) => (
              <div key={idx} className="flex items-center justify-between bg-muted rounded-lg p-3">
                <div className="flex items-center space-x-4">
                  <span className="text-muted-foreground font-mono">#{idx + 1}</span>
                  <span className="text-foreground">{item.description}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <span className="text-foreground font-bold">
                    {item.weight.toLocaleString()} lbs
                  </span>
                  <span className="text-muted-foreground text-sm">
                    ({item.percent_of_total.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {allocationResult.warnings.length > 0 && (
          <motion.div
            className="bg-amber-50 border border-amber-300 rounded-xl p-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <h3 className="text-amber-700 font-bold text-lg mb-3 flex items-center space-x-2">
              <span>⚠️</span>
              <span>Warnings ({allocationResult.warnings.length})</span>
            </h3>
            <ul className="space-y-2">
              {allocationResult.warnings.map((warning, idx) => (
                <li key={idx} className="text-amber-700 text-sm">• {warning}</li>
              ))}
            </ul>
          </motion.div>
        )}

        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <button
            onClick={onViewLoadPlans}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xl px-12 py-4 rounded-lg transition shadow-lg"
          >
            View Detailed Load Plans →
          </button>
          <p className="text-muted-foreground text-sm mt-4">
            See ICODES-style diagrams for each aircraft
          </p>
        </motion.div>
      </div>
    </div>
  );
}
