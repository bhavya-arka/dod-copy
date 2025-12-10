/**
 * PACAF Airlift Demo - Flight Splitter Component
 * Full-page mission flowchart canvas - Miro/Lucidflow style sandbox
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AllocationResult, AircraftLoadPlan, AIRCRAFT_SPECS } from '../lib/pacafTypes';
import { MilitaryBase } from '../lib/routeTypes';
import { MILITARY_BASES } from '../lib/bases';
import { 
  SplitFlight, 
  calculateFlightWeight
} from '../lib/flightSplitTypes';
import LoadPlan3DViewer from './LoadPlan3DViewer';
import MissionFlowchartCanvas from './MissionFlowchartCanvas';

interface FlightSplitterProps {
  allocationResult: AllocationResult;
  onClose: () => void;
  onSave: (splitFlights: SplitFlight[]) => void;
  embedded?: boolean;
  existingSplitFlights?: SplitFlight[];
}

export default function FlightSplitter({ 
  allocationResult, 
  onClose, 
  onSave, 
  embedded = false, 
  existingSplitFlights 
}: FlightSplitterProps) {
  const [splitFlights, setSplitFlights] = useState<SplitFlight[]>(() => 
    existingSplitFlights && existingSplitFlights.length > 0 
      ? existingSplitFlights 
      : initializeSplitFlights(allocationResult)
  );
  const [show3DViewer, setShow3DViewer] = useState<string | null>(null);

  const handleSave = useCallback(() => {
    onSave(splitFlights);
    onClose();
  }, [splitFlights, onSave, onClose]);

  const handleFlightsChange = useCallback((updatedFlights: SplitFlight[]) => {
    setSplitFlights(updatedFlights);
  }, []);

  const handleView3D = useCallback((flightId: string) => {
    setShow3DViewer(flightId);
  }, []);

  return (
    <div className={embedded ? "w-full h-full" : "fixed inset-0 z-50"}>
      {/* Full-page flowchart canvas */}
      <MissionFlowchartCanvas
        splitFlights={splitFlights}
        allocationResult={allocationResult}
        onFlightsChange={handleFlightsChange}
        onBack={onClose}
        onSave={handleSave}
        onView3D={handleView3D}
      />

      {/* 3D Viewer Modal */}
      <AnimatePresence>
        {show3DViewer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center"
            onClick={() => setShow3DViewer(null)}
          >
            <div 
              className="bg-white rounded-2xl w-[80vw] h-[80vh] overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-neutral-200 flex justify-between items-center">
                <h2 className="font-bold text-lg">
                  3D Load Visualization - {splitFlights.find(f => f.id === show3DViewer)?.callsign}
                </h2>
                <button
                  onClick={() => setShow3DViewer(null)}
                  className="text-neutral-400 hover:text-neutral-900 text-xl px-2"
                >
                  Close
                </button>
              </div>
              <div className="h-[calc(100%-60px)]">
                {(() => {
                  const flight = splitFlights.find(f => f.id === show3DViewer);
                  if (!flight) return null;
                  const spec = AIRCRAFT_SPECS[flight.aircraft_type];
                  const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
                  const maxPositions = flight.aircraft_type === 'C-17' ? 18 : 6;
                  const seatCapacity = spec.seat_capacity;
                  const paxWeight = flight.pax_count * 225;
                  const seatUtilization = seatCapacity > 0 ? (flight.pax_count / seatCapacity) * 100 : 0;
                  const mockPlan: AircraftLoadPlan = {
                    aircraft_id: flight.aircraft_id,
                    aircraft_type: flight.aircraft_type,
                    aircraft_spec: spec,
                    sequence: 1,
                    phase: 'MAIN',
                    pallets: flight.pallets,
                    rolling_stock: flight.rolling_stock,
                    pax_count: flight.pax_count,
                    total_weight: flight.total_weight_lb,
                    payload_used_percent: (flight.total_weight_lb / maxPayload) * 100,
                    pax_weight: paxWeight,
                    center_of_balance: flight.center_of_balance_percent,
                    cob_percent: flight.center_of_balance_percent,
                    cob_in_envelope: flight.center_of_balance_percent >= 20 && flight.center_of_balance_percent <= 35,
                    utilization_percent: (flight.total_weight_lb / maxPayload) * 100,
                    positions_used: flight.pallets.length,
                    positions_available: maxPositions - flight.pallets.length,
                    seat_capacity: seatCapacity,
                    seats_used: flight.pax_count,
                    seat_utilization_percent: seatUtilization
                  };
                  return <LoadPlan3DViewer loadPlan={mockPlan} />;
                })()}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function initializeSplitFlights(result: AllocationResult): SplitFlight[] {
  const defaultOrigin = MILITARY_BASES.find(b => b.base_id === 'TRAVIS') || MILITARY_BASES[0];
  const defaultDest = MILITARY_BASES.find(b => b.base_id === 'HICKAM') || MILITARY_BASES[1];
  const now = new Date();
  
  return result.load_plans.map((plan, idx) => ({
    id: `ORIG-${idx + 1}`,
    parent_flight_id: plan.aircraft_id,
    callsign: `REACH${(idx + 1).toString().padStart(2, '0')}`,
    aircraft_type: plan.aircraft_type,
    aircraft_id: plan.aircraft_id,
    origin: defaultOrigin,
    destination: defaultDest,
    scheduled_departure: new Date(now.getTime() + (24 + idx * 4) * 60 * 60 * 1000),
    scheduled_arrival: new Date(now.getTime() + (24 + idx * 4 + 8) * 60 * 60 * 1000),
    estimated_delay_minutes: 0,
    pallets: plan.pallets,
    rolling_stock: plan.rolling_stock,
    pax_count: plan.pax_count,
    total_weight_lb: plan.total_weight,
    center_of_balance_percent: plan.cob_percent,
    weather_warnings: [],
    is_modified: false
  }));
}
