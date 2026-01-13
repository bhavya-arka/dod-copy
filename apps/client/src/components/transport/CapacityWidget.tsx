import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

type TransportMode = 'air' | 'land' | 'sea';

export interface CapacityWidgetProps {
  current: number;
  max: number;
  label: string;
  unit?: string;
  mode?: TransportMode;
  showPercentage?: boolean;
}

const modeAccents: Record<TransportMode, string> = {
  air: 'ring-blue-500/30',
  land: 'ring-amber-500/30',
  sea: 'ring-teal-500/30',
};

function getCapacityColor(percentage: number): {
  bar: string;
  text: string;
  bg: string;
} {
  if (percentage > 85) {
    return {
      bar: 'bg-gradient-to-r from-red-500 to-red-600',
      text: 'text-red-400',
      bg: 'bg-red-500/10',
    };
  }
  if (percentage >= 60) {
    return {
      bar: 'bg-gradient-to-r from-amber-500 to-yellow-500',
      text: 'text-amber-400',
      bg: 'bg-amber-500/10',
    };
  }
  return {
    bar: 'bg-gradient-to-r from-green-500 to-emerald-500',
    text: 'text-green-400',
    bg: 'bg-green-500/10',
  };
}

function formatValue(value: number, unit?: string): string {
  if (unit === 'lbs') {
    return `${value.toLocaleString()} lbs`;
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString();
}

export function CapacityWidget({
  current,
  max,
  label,
  unit,
  mode,
  showPercentage = true,
}: CapacityWidgetProps) {
  const [animatedWidth, setAnimatedWidth] = useState(0);
  const percentage = max > 0 ? Math.round((current / max) * 100) : 0;
  const clampedPercentage = Math.min(100, percentage);
  const colors = getCapacityColor(percentage);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedWidth(clampedPercentage);
    }, 100);
    return () => clearTimeout(timer);
  }, [clampedPercentage]);

  return (
    <div
      className={cn(
        'p-4 rounded-2xl bg-[#0f172a] border border-white/10',
        mode && `ring-1 ${modeAccents[mode]}`
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="text-sm font-medium text-white">{label}</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatValue(current, unit)} / {formatValue(max, unit)}
            {unit && !unit.includes('lbs') && ` ${unit}`}
          </p>
        </div>
        {showPercentage && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              'px-2 py-1 rounded-lg text-sm font-bold',
              colors.bg,
              colors.text
            )}
          >
            {percentage}%
          </motion.span>
        )}
      </div>

      <div className="h-3 rounded-full bg-slate-800 overflow-hidden">
        <motion.div
          className={cn('h-full rounded-full', colors.bar)}
          initial={{ width: 0 }}
          animate={{ width: `${animatedWidth}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>

      <div className="flex justify-between mt-2 text-xs text-slate-500">
        <span>0%</span>
        <div className="flex gap-3">
          <span className="text-green-500">60%</span>
          <span className="text-amber-500">85%</span>
        </div>
        <span>100%</span>
      </div>
    </div>
  );
}
