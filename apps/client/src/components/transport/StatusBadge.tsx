import React from "react";
import { motion } from "framer-motion";
import { Edit, Calendar, Package, Play, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = 'draft' | 'planned' | 'loading' | 'underway' | 'completed' | 'cancelled';

export interface StatusBadgeProps {
  status: Status;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const statusConfig: Record<Status, { 
  label: string; 
  bgColor: string; 
  textColor: string; 
  borderColor: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  draft: {
    label: 'Draft',
    bgColor: 'bg-slate-500/20',
    textColor: 'text-slate-400',
    borderColor: 'border-slate-500/30',
    icon: Edit,
  },
  planned: {
    label: 'Planned',
    bgColor: 'bg-blue-500/20',
    textColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    icon: Calendar,
  },
  loading: {
    label: 'Loading',
    bgColor: 'bg-yellow-500/20',
    textColor: 'text-yellow-400',
    borderColor: 'border-yellow-500/30',
    icon: Package,
  },
  underway: {
    label: 'Underway',
    bgColor: 'bg-amber-500/20',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    icon: Play,
  },
  completed: {
    label: 'Completed',
    bgColor: 'bg-green-500/20',
    textColor: 'text-green-400',
    borderColor: 'border-green-500/30',
    icon: Check,
  },
  cancelled: {
    label: 'Cancelled',
    bgColor: 'bg-red-500/20',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/30',
    icon: X,
  },
};

const sizeConfig = {
  sm: {
    padding: 'px-2 py-0.5',
    text: 'text-xs',
    iconSize: 'w-3 h-3',
    gap: 'gap-1',
  },
  md: {
    padding: 'px-2.5 py-1',
    text: 'text-sm',
    iconSize: 'w-3.5 h-3.5',
    gap: 'gap-1.5',
  },
  lg: {
    padding: 'px-3 py-1.5',
    text: 'text-sm',
    iconSize: 'w-4 h-4',
    gap: 'gap-2',
  },
};

export function StatusBadge({ status, size = 'md', showIcon = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;
  const isUnderway = status === 'underway';

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full border',
        config.bgColor,
        config.textColor,
        config.borderColor,
        sizeStyles.padding,
        sizeStyles.text,
        sizeStyles.gap,
        'relative overflow-hidden'
      )}
    >
      {isUnderway && (
        <motion.span
          className="absolute inset-0 bg-amber-400/20 rounded-full"
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {showIcon && (
        <Icon className={cn(sizeStyles.iconSize, 'relative z-10')} />
      )}
      <span className="relative z-10">{config.label}</span>
    </span>
  );
}
