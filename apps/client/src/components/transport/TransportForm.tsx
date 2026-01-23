import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Plane, Truck, Ship, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TransportPlan, TransportMode } from "@shared/transportTypes";

export interface TransportFormProps {
  mode: TransportMode;
  initialData?: Partial<TransportPlan>;
  onSubmit: (data: Partial<TransportPlan>) => Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

type FormErrors = Partial<Record<keyof TransportPlan | 'general', string>>;

const modeConfig: Record<TransportMode, {
  iconBg: string;
  iconColor: string;
  buttonBg: string;
  buttonHover: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  specificFields: { key: string; label: string; type: string; placeholder?: string }[];
}> = {
  air: {
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    buttonBg: 'bg-blue-600',
    buttonHover: 'hover:bg-blue-700',
    icon: Plane,
    label: 'Flight',
    specificFields: [
      { key: 'aircraft_type', label: 'Aircraft Type', type: 'text', placeholder: 'e.g., C-17, C-130' },
      { key: 'flight_number', label: 'Flight Number', type: 'text', placeholder: 'e.g., AF1234' },
      { key: 'altitude_ft', label: 'Cruise Altitude (ft)', type: 'number', placeholder: '35000' },
    ],
  },
  land: {
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-400',
    buttonBg: 'bg-amber-600',
    buttonHover: 'hover:bg-amber-700',
    icon: Truck,
    label: 'Convoy',
    specificFields: [
      { key: 'vehicle_count', label: 'Vehicle Count', type: 'number', placeholder: '5' },
      { key: 'convoy_id', label: 'Convoy ID', type: 'text', placeholder: 'e.g., CONVOY-001' },
      { key: 'route_type', label: 'Route Type', type: 'text', placeholder: 'e.g., Highway, Off-road' },
    ],
  },
  sea: {
    iconBg: 'bg-teal-500/20',
    iconColor: 'text-teal-400',
    buttonBg: 'bg-teal-600',
    buttonHover: 'hover:bg-teal-700',
    icon: Ship,
    label: 'Voyage',
    specificFields: [
      { key: 'vessel_name', label: 'Vessel Name', type: 'text', placeholder: 'e.g., USNS Comfort' },
      { key: 'vessel_type', label: 'Vessel Type', type: 'text', placeholder: 'e.g., Container Ship' },
      { key: 'port_calls', label: 'Port Calls', type: 'text', placeholder: 'Intermediate ports' },
    ],
  },
};

export function TransportForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  loading = false,
}: TransportFormProps) {
  const config = modeConfig[mode];
  const Icon = config.icon;

  const specificFieldDefaults = config.specificFields.reduce<Record<string, string | number>>(
    (acc, field) => {
      const value = (initialData as Record<string, unknown>)?.[field.key];
      acc[field.key] = typeof value === 'string' || typeof value === 'number' ? value : '';
      return acc;
    },
    {}
  );

  const [formData, setFormData] = useState<Record<string, string | number>>({
    name: initialData?.name || '',
    origin: initialData?.origin || '',
    destination: initialData?.destination || '',
    departure_time: initialData?.departure_time || '',
    notes: '',
    ...specificFieldDefaults,
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const handleChange = useCallback((key: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    if (errors[key as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }, [errors]);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name || String(formData.name).trim() === '') {
      newErrors.name = 'Name is required';
    }
    if (!formData.origin || String(formData.origin).trim() === '') {
      newErrors.origin = 'Origin is required';
    }
    if (!formData.destination || String(formData.destination).trim() === '') {
      newErrors.destination = 'Destination is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await onSubmit({
        ...initialData,
        mode,
        name: String(formData.name),
        origin: String(formData.origin),
        destination: String(formData.destination),
        departure_time: formData.departure_time ? String(formData.departure_time) : undefined,
        status: initialData?.status || 'draft',
      } as Partial<TransportPlan>);
    } catch (err) {
      setErrors({ general: 'Failed to submit. Please try again.' });
    }
  };

  const inputClasses = cn(
    'w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl',
    'text-white placeholder:text-slate-500 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20',
    'transition-all'
  );

  const labelClasses = 'block text-sm font-medium text-slate-300 mb-1.5';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-white/10">
        <div className={cn('p-2.5 rounded-xl', config.iconBg)}>
          <Icon className={cn('w-5 h-5', config.iconColor)} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">
            {initialData?.id ? `Edit ${config.label}` : `New ${config.label}`}
          </h3>
          <p className="text-sm text-slate-400">
            {mode.charAt(0).toUpperCase() + mode.slice(1)} transport plan
          </p>
        </div>
      </div>

      {errors.general && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 p-3 rounded-xl bg-red-500/20 border border-red-500/30"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-400">{errors.general}</span>
        </motion.div>
      )}

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Basic Information
        </h4>

        <div>
          <label className={labelClasses}>Name *</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={`Enter ${config.label.toLowerCase()} name`}
            className={cn(inputClasses, errors.name && 'border-red-500/50 focus:ring-red-500/30')}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-400">{errors.name}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClasses}>Origin *</label>
            <input
              type="text"
              value={formData.origin}
              onChange={(e) => handleChange('origin', e.target.value)}
              placeholder="Departure location"
              className={cn(inputClasses, errors.origin && 'border-red-500/50 focus:ring-red-500/30')}
            />
            {errors.origin && (
              <p className="mt-1 text-xs text-red-400">{errors.origin}</p>
            )}
          </div>

          <div>
            <label className={labelClasses}>Destination *</label>
            <input
              type="text"
              value={formData.destination}
              onChange={(e) => handleChange('destination', e.target.value)}
              placeholder="Arrival location"
              className={cn(inputClasses, errors.destination && 'border-red-500/50 focus:ring-red-500/30')}
            />
            {errors.destination && (
              <p className="mt-1 text-xs text-red-400">{errors.destination}</p>
            )}
          </div>
        </div>

        <div>
          <label className={labelClasses}>Departure Time</label>
          <input
            type="datetime-local"
            value={formData.departure_time}
            onChange={(e) => handleChange('departure_time', e.target.value)}
            className={inputClasses}
          />
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          {config.label} Details
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {config.specificFields.map((field) => (
            <div key={field.key}>
              <label className={labelClasses}>{field.label}</label>
              <input
                type={field.type}
                value={formData[field.key] || ''}
                onChange={(e) => handleChange(
                  field.key,
                  field.type === 'number' ? Number(e.target.value) : e.target.value
                )}
                placeholder={field.placeholder}
                className={inputClasses}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClasses}>Notes</label>
        <textarea
          value={formData.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Additional notes or instructions..."
          rows={3}
          className={cn(inputClasses, 'resize-none')}
        />
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className={cn(
            'px-4 py-2 text-sm font-medium text-slate-300 rounded-xl',
            'bg-white/5 border border-white/10',
            'hover:bg-white/10 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className={cn(
            'px-6 py-2 text-sm font-medium text-white rounded-xl',
            config.buttonBg,
            config.buttonHover,
            'transition-all shadow-lg',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            'flex items-center gap-2'
          )}
        >
          {loading && <Loader2 className="w-4 h-4 animate-spin" />}
          {initialData?.id ? 'Update' : 'Create'} {config.label}
        </button>
      </div>
    </form>
  );
}
