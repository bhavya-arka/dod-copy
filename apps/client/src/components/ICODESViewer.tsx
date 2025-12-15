/**
 * PACAF Airlift Demo - ICODES-Style Visualization
 * Spec Reference: Section 10
 * 
 * Renders top-down diagrams of aircraft with pallet positions,
 * weight indicators, hazmat icons, and Center of Balance visualization.
 * Updated with minimalist glass UI design and hover tooltips.
 * Enhanced: Cleaner labels, fullscreen mode, dimension indicators.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, X, ZoomIn, Table, LayoutGrid } from 'lucide-react';
import {
  AircraftLoadPlan,
  AircraftType,
  AIRCRAFT_SPECS,
  PalletPlacement,
  VehiclePlacement,
  PALLET_463L,
  PAX_WEIGHT_LB
} from '../lib/pacafTypes';
import EditableSpreadsheet, { SpreadsheetColumn, SpreadsheetRow } from './EditableSpreadsheet';

interface TooltipData {
  x: number;
  y: number;
  type: 'pallet' | 'vehicle' | 'position';
  title: string;
  details: { label: string; value: string }[];
}

interface ICODESViewerProps {
  loadPlan: AircraftLoadPlan;
  showCoB?: boolean;
  showWeights?: boolean;
  compact?: boolean;
}

function ICODESDiagram({
  loadPlan,
  showCoB,
  showWeights,
  compact,
  scale,
  isFullscreen = false,
  onTooltipChange
}: ICODESViewerProps & { 
  scale: number; 
  isFullscreen?: boolean;
  onTooltipChange: (tooltip: TooltipData | null) => void;
}) {
  const spec = loadPlan.aircraft_spec;
  const isC17 = loadPlan.aircraft_type === 'C-17';
  
  const width = spec.cargo_width * scale;
  const length = spec.cargo_length * scale;
  
  const palletWidth = 88 * scale;
  const palletLength = 108 * scale;

  const handlePalletHover = (
    e: React.MouseEvent<SVGGElement>,
    placement: PalletPlacement,
    positionIndex: number
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const items = placement.pallet.items;
    const itemDescriptions = items.slice(0, 3).map(i => i.description).join(', ');
    const moreItems = items.length > 3 ? ` +${items.length - 3} more` : '';
    const lateralInfo = placement.lateral_placement;
    const lateralPosition = lateralInfo && lateralInfo.y_center_in !== 0
      ? `Y: ${lateralInfo.y_center_in.toFixed(0)}"`
      : 'Centerline';
    
    onTooltipChange({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      type: 'pallet',
      title: `Position ${positionIndex + 1}`,
      details: [
        { label: 'TCN', value: placement.pallet.id },
        { label: 'Location', value: placement.is_ramp ? 'Ramp' : 'Main Deck' },
        { label: 'Lateral', value: lateralPosition },
        { label: 'Gross Weight', value: `${placement.pallet.gross_weight.toLocaleString()} lbs` },
        { label: 'Height', value: `${placement.pallet.height}"${placement.pallet.height > 96 ? ' (Overheight)' : ''}` },
        { label: 'Items', value: `${items.length} item(s)` },
        { label: 'Contents', value: itemDescriptions + moreItems || 'Empty' },
        ...(placement.pallet.hazmat_flag ? [{ label: 'HAZMAT', value: 'Yes - Special handling required' }] : [])
      ]
    });
  };

  const handleVehicleHover = (
    e: React.MouseEvent<SVGGElement>,
    vehicle: VehiclePlacement
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const lateralInfo = vehicle.lateral_placement;
    const lateralPosition = lateralInfo 
      ? `${lateralInfo.side.toUpperCase()} (Y: ${lateralInfo.y_center_in.toFixed(0)}")`
      : 'Center';
    
    onTooltipChange({
      x: rect.left + rect.width / 2,
      y: rect.top - 10,
      type: 'vehicle',
      title: `Rolling Stock`,
      details: [
        { label: 'ID', value: String(vehicle.item_id) },
        { label: 'Dimensions', value: `${vehicle.length}" L × ${vehicle.width}" W × ${vehicle.height}" H` },
        { label: 'Weight', value: `${vehicle.weight.toLocaleString()} lbs` },
        { label: 'Longitudinal', value: `X: ${vehicle.position.z.toFixed(0)}"` },
        { label: 'Lateral', value: lateralPosition },
        { label: 'Deck', value: vehicle.deck || 'MAIN' }
      ]
    });
  };

  const svgWidth = length + 120;
  const svgHeight = width + 100;

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      className="mx-auto"
      onMouseLeave={() => onTooltipChange(null)}
    >
      <rect
        x={50}
        y={50}
        width={length}
        height={width}
        fill="#f8fafc"
        stroke="#e2e8f0"
        strokeWidth={2}
        rx={isC17 ? 10 : 5}
      />
      
      <path
        d={isC17 
          ? `M 50 ${50 + width/2} 
             Q 20 ${50 + width/2} 30 ${50 + width/4}
             L 30 ${50 + width*3/4}
             Q 20 ${50 + width/2} 50 ${50 + width/2}
             M ${50 + length} ${50 + width/2}
             L ${50 + length + 30} ${50 + width/3}
             L ${50 + length + 30} ${50 + width*2/3}
             Z`
          : `M 50 ${50 + width/2} 
             Q 30 ${50 + width/2} 35 ${50 + width/3}
             L 35 ${50 + width*2/3}
             Q 30 ${50 + width/2} 50 ${50 + width/2}
             M ${50 + length} ${50 + width/2}
             L ${50 + length + 20} ${50 + width/3}
             L ${50 + length + 20} ${50 + width*2/3}
             Z`
        }
        fill="#f8fafc"
        stroke="#e2e8f0"
        strokeWidth={2}
      />

      <text x={25} y={50 + width/2} fill="#64748b" fontSize={12} fontWeight="600" textAnchor="middle" transform={`rotate(-90, 25, ${50 + width/2})`}>
        FWD
      </text>
      <text x={55 + length + 25} y={50 + width/2} fill="#64748b" fontSize={12} fontWeight="600" textAnchor="middle" transform={`rotate(90, ${55 + length + 25}, ${50 + width/2})`}>
        AFT
      </text>

      <line x1={50} y1={50 + width + 15} x2={50 + length} y2={50 + width + 15} stroke="#94a3b8" strokeWidth={1} />
      <line x1={50} y1={50 + width + 10} x2={50} y2={50 + width + 20} stroke="#94a3b8" strokeWidth={1} />
      <line x1={50 + length} y1={50 + width + 10} x2={50 + length} y2={50 + width + 20} stroke="#94a3b8" strokeWidth={1} />
      <text x={50 + length/2} y={50 + width + 30} fill="#64748b" fontSize={10} textAnchor="middle" fontWeight="500">
        {spec.cargo_length}" ({(spec.cargo_length / 12).toFixed(0)} ft)
      </text>

      <line x1={50 + length + 35} y1={50} x2={50 + length + 35} y2={50 + width} stroke="#94a3b8" strokeWidth={1} />
      <line x1={50 + length + 30} y1={50} x2={50 + length + 40} y2={50} stroke="#94a3b8" strokeWidth={1} />
      <line x1={50 + length + 30} y1={50 + width} x2={50 + length + 40} y2={50 + width} stroke="#94a3b8" strokeWidth={1} />
      <text x={50 + length + 50} y={50 + width/2} fill="#64748b" fontSize={10} textAnchor="start" fontWeight="500" dominantBaseline="middle">
        {spec.cargo_width}"
      </text>

      {!compact && (
        <>
          {[0, 0.25, 0.5, 0.75, 1].map((fraction, i) => (
            <g key={i}>
              <line 
                x1={50 + length * fraction} 
                y1={46} 
                x2={50 + length * fraction} 
                y2={50} 
                stroke="#cbd5e1" 
                strokeWidth={1} 
              />
              <text 
                x={50 + length * fraction} 
                y={42} 
                fill="#94a3b8" 
                fontSize={8} 
                textAnchor="middle"
              >
                {Math.round(spec.cargo_length * fraction)}"
              </text>
            </g>
          ))}
        </>
      )}
      
      {loadPlan.pallets.map((placement, idx) => {
        const xCoord = placement.x_start_in ?? placement.position_coord - PALLET_463L.length / 2;
        const posX = 50 + xCoord * scale;
        const palletLateralY = placement.lateral_placement?.y_center_in ?? 0;
        const posY = 50 + (width / 2) - (palletWidth / 2) + (palletLateralY * scale);
        
        return (
          <g 
            key={placement.pallet.id}
            className="cursor-pointer"
            onMouseEnter={(e) => handlePalletHover(e, placement, idx)}
            onMouseLeave={() => onTooltipChange(null)}
          >
            <rect
              x={posX}
              y={posY}
              width={palletLength}
              height={palletWidth}
              fill={placement.pallet.hazmat_flag ? '#fef2f2' : '#eff6ff'}
              stroke={placement.pallet.hazmat_flag ? '#fca5a5' : '#3b82f6'}
              strokeWidth={1.5}
              rx={4}
              className="transition-all duration-150 hover:stroke-2"
            />
            
            <text
              x={posX + palletLength/2}
              y={posY + palletWidth/2 + (showWeights ? -4 : 4)}
              textAnchor="middle"
              fill="#1e293b"
              fontSize={compact ? 10 : 14}
              fontWeight="bold"
            >
              {idx + 1}
            </text>
            
            {showWeights && (
              <text
                x={posX + palletLength/2}
                y={posY + palletWidth/2 + 10}
                textAnchor="middle"
                fill="#64748b"
                fontSize={compact ? 7 : 9}
              >
                {(placement.pallet.gross_weight / 1000).toFixed(1)}k
              </text>
            )}
            
            {placement.pallet.hazmat_flag && (
              <text
                x={posX + 5}
                y={posY + 12}
                fill="#dc2626"
                fontSize={12}
              >
                ⚠
              </text>
            )}
            
            {placement.pallet.height > 96 && (
              <circle
                cx={posX + palletLength - 8}
                cy={posY + 8}
                r={4}
                fill="#f59e0b"
              />
            )}
          </g>
        );
      })}
      
      {loadPlan.rolling_stock.map((vehicle, idx) => {
        const vLength = vehicle.length * scale;
        const vWidth = vehicle.width * scale;
        const posX = 50 + vehicle.position.z * scale - vLength/2;
        const yCenter = vehicle.lateral_placement?.y_center_in ?? vehicle.position.x ?? 0;
        const posY = 50 + (width / 2) - (vWidth / 2) + (yCenter * scale);
        const lateralSide = vehicle.lateral_placement?.side;
        const sideIndicator = lateralSide === 'left' ? 'L' : lateralSide === 'right' ? 'R' : '';
        
        return (
          <g 
            key={`rs-${idx}`}
            className="cursor-pointer"
            onMouseEnter={(e) => handleVehicleHover(e, vehicle)}
            onMouseLeave={() => onTooltipChange(null)}
          >
            <rect
              x={posX}
              y={posY}
              width={vLength}
              height={vWidth}
              fill="#f0fdf4"
              stroke="#22c55e"
              strokeWidth={1.5}
              rx={4}
              className="transition-all duration-150 hover:stroke-2"
            />
            <text
              x={posX + vLength/2}
              y={posY + vWidth/2 + 4}
              textAnchor="middle"
              fill="#166534"
              fontSize={compact ? 8 : 10}
              fontWeight="600"
            >
              RS
            </text>
            {sideIndicator && (
              <text
                x={posX + 6}
                y={posY + 10}
                fill="#166534"
                fontSize={8}
                fontWeight="600"
              >
                {sideIndicator}
              </text>
            )}
          </g>
        );
      })}
      
      {showCoB && (
        <>
          <line
            x1={50 + loadPlan.center_of_balance * scale}
            y1={45}
            x2={50 + loadPlan.center_of_balance * scale}
            y2={55 + width}
            stroke={loadPlan.cob_in_envelope ? '#22c55e' : '#ef4444'}
            strokeWidth={2}
            strokeDasharray="4 2"
          />
          
          <polygon
            points={`
              ${50 + loadPlan.center_of_balance * scale},${45}
              ${50 + loadPlan.center_of_balance * scale - 6},${35}
              ${50 + loadPlan.center_of_balance * scale + 6},${35}
            `}
            fill={loadPlan.cob_in_envelope ? '#22c55e' : '#ef4444'}
          />
          
          <text 
            x={50 + loadPlan.center_of_balance * scale}
            y={28}
            textAnchor="middle"
            fill={loadPlan.cob_in_envelope ? '#22c55e' : '#ef4444'}
            fontSize={9}
            fontWeight="600"
          >
            CoB
          </text>
        </>
      )}
    </svg>
  );
}

export default function ICODESViewer({
  loadPlan,
  showCoB = true,
  showWeights = true,
  compact = false
}: ICODESViewerProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [viewMode, setViewMode] = useState<'diagram' | 'spreadsheet'>('diagram');
  const spec = loadPlan.aircraft_spec;
  
  const scale = compact ? 0.3 : 0.5;
  const fullscreenScale = 0.8;
  
  const usedPositions = loadPlan.pallets.length;
  const totalPositions = spec.pallet_positions;

  // Define spreadsheet columns for cargo data
  const spreadsheetColumns: SpreadsheetColumn[] = useMemo(() => [
    { key: 'position', label: 'Pos', width: 50, type: 'number', editable: false },
    { key: 'type', label: 'Type', width: 80, editable: false },
    { key: 'tcnId', label: 'TCN/ID', width: 120, editable: false },
    { key: 'items', label: 'Contents', width: 200, editable: false },
    { key: 'weight', label: 'Weight (lbs)', width: 100, type: 'number', format: (v: number) => v?.toLocaleString() || '-' },
    { key: 'height', label: 'Height (in)', width: 80, type: 'number' },
    { key: 'location', label: 'Location', width: 100, editable: false },
    { key: 'hazmat', label: 'HAZMAT', width: 70, type: 'checkbox', format: (v: boolean) => v ? 'Yes' : 'No' },
  ], []);

  // Convert load plan data to spreadsheet rows
  const spreadsheetData: SpreadsheetRow[] = useMemo(() => {
    const palletRows: SpreadsheetRow[] = loadPlan.pallets.map((placement, idx) => ({
      id: `pallet-${placement.pallet.id}`,
      position: idx + 1,
      type: 'Pallet',
      tcnId: placement.pallet.id,
      items: placement.pallet.items.slice(0, 3).map(i => i.description).join(', ') + 
        (placement.pallet.items.length > 3 ? ` +${placement.pallet.items.length - 3} more` : ''),
      weight: placement.pallet.gross_weight,
      height: placement.pallet.height,
      location: placement.is_ramp ? 'Ramp' : 'Main Deck',
      hazmat: placement.pallet.hazmat_flag,
    }));

    const vehicleRows: SpreadsheetRow[] = loadPlan.rolling_stock.map((vehicle, idx) => ({
      id: `vehicle-${vehicle.item_id}`,
      position: loadPlan.pallets.length + idx + 1,
      type: 'Rolling Stock',
      tcnId: String(vehicle.item_id),
      items: `${vehicle.length}" × ${vehicle.width}" × ${vehicle.height}"`,
      weight: vehicle.weight,
      height: vehicle.height,
      location: vehicle.deck || 'Main Deck',
      hazmat: false,
    }));

    return [...palletRows, ...vehicleRows];
  }, [loadPlan]);
  
  return (
    <>
      <div className="glass-card p-4 relative">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-neutral-900 font-bold text-lg">{loadPlan.aircraft_id}</h3>
            <p className="text-neutral-500 text-sm">{spec.name}</p>
          </div>
          <div className="flex items-center gap-4">
            {/* View toggle */}
            <div className="flex items-center bg-neutral-100 rounded-lg p-0.5 border border-neutral-200">
              <button
                onClick={() => setViewMode('diagram')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === 'diagram'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
                title="Diagram View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Diagram
              </button>
              <button
                onClick={() => setViewMode('spreadsheet')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                  viewMode === 'spreadsheet'
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700'
                }`}
                title="Spreadsheet View"
              >
                <Table className="w-3.5 h-3.5" />
                Spreadsheet
              </button>
            </div>
            <div className="text-right">
              <p className="text-neutral-900 font-mono font-medium">
                {loadPlan.total_weight.toLocaleString()} lbs
              </p>
              <p className="text-neutral-500 text-sm">
                {loadPlan.payload_used_percent.toFixed(1)}% capacity
              </p>
            </div>
            {viewMode === 'diagram' && (
              <button
                onClick={() => setIsFullscreen(true)}
                className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                title="Expand to fullscreen"
              >
                <Maximize2 className="w-5 h-5 text-neutral-600" />
              </button>
            )}
          </div>
        </div>
        
        {viewMode === 'diagram' ? (
          <div className="relative overflow-x-auto bg-neutral-50 rounded-xl p-4 border border-neutral-200/50">
            <ICODESDiagram 
              loadPlan={loadPlan}
              showCoB={showCoB}
              showWeights={showWeights}
              compact={compact}
              scale={scale}
              onTooltipChange={setTooltip}
            />

            <AnimatePresence>
              {tooltip && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="fixed z-50 pointer-events-none"
                  style={{
                    left: tooltip.x,
                    top: tooltip.y,
                    transform: 'translate(-50%, -100%)'
                  }}
                >
                  <div className="bg-white rounded-xl shadow-glass-lg border border-neutral-200 p-3 min-w-48 max-w-72">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-neutral-900 font-bold text-sm">{tooltip.title}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        tooltip.type === 'pallet' ? 'bg-blue-100 text-blue-700' :
                        tooltip.type === 'vehicle' ? 'bg-green-100 text-green-700' : 'bg-neutral-100 text-neutral-600'
                      }`}>
                        {tooltip.type === 'pallet' ? 'Pallet' : tooltip.type === 'vehicle' ? 'Vehicle' : 'Empty'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {tooltip.details.map((detail, idx) => (
                        <div key={idx} className="flex justify-between text-xs gap-2">
                          <span className="text-neutral-500">{detail.label}:</span>
                          <span className={`text-neutral-900 font-medium text-right max-w-40 truncate ${
                            detail.label === 'HAZMAT' ? 'text-red-600' : ''
                          }`}>
                            {detail.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-neutral-200">
            <EditableSpreadsheet
              columns={spreadsheetColumns}
              data={spreadsheetData}
              title={`${loadPlan.aircraft_id} Cargo Manifest`}
              editable={false}
              showToolbar={true}
              showRowNumbers={true}
              stickyHeader={true}
              maxHeight="400px"
              emptyMessage="No cargo loaded on this aircraft"
            />
          </div>
        )}
        
        <div className="mt-4 grid grid-cols-5 gap-2 text-sm">
          <div className="bg-neutral-50 rounded-xl p-3 text-center border border-neutral-200/50">
            <p className="text-neutral-500 text-xs">Pallets</p>
            <p className="text-neutral-900 font-bold">{loadPlan.pallets.length}/{spec.pallet_positions}</p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-3 text-center border border-neutral-200/50">
            <p className="text-neutral-500 text-xs">Vehicles</p>
            <p className="text-neutral-900 font-bold">{loadPlan.rolling_stock.length}</p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-3 text-center border border-neutral-200/50">
            <p className="text-neutral-500 text-xs">PAX</p>
            <p className="text-neutral-900 font-bold">{loadPlan.pax_count}/{loadPlan.seat_capacity || spec.seat_capacity}</p>
            <p className="text-neutral-400 text-xs">{((loadPlan.pax_weight || loadPlan.pax_count * PAX_WEIGHT_LB) / 1000).toFixed(1)}k lbs</p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-3 text-center border border-neutral-200/50">
            <p className="text-neutral-500 text-xs">Seat Util</p>
            <p className={`font-bold ${(loadPlan.seat_utilization_percent || 0) > 80 ? 'text-amber-600' : 'text-neutral-900'}`}>
              {(loadPlan.seat_utilization_percent || 0).toFixed(1)}%
            </p>
          </div>
          <div className="bg-neutral-50 rounded-xl p-3 text-center border border-neutral-200/50">
            <p className="text-neutral-500 text-xs">CoB</p>
            <p className={`font-bold ${loadPlan.cob_in_envelope ? 'text-green-600' : 'text-red-600'}`}>
              {loadPlan.cob_percent.toFixed(1)}%
            </p>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-8"
            onClick={() => setIsFullscreen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl max-w-[95vw] max-h-[95vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 bg-white border-b border-neutral-200 px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-6">
                  <div>
                    <h2 className="text-xl font-bold text-neutral-900">{loadPlan.aircraft_id}</h2>
                    <p className="text-neutral-500">{spec.name}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="px-3 py-1.5 bg-neutral-100 rounded-lg">
                      <span className="text-neutral-600">Cargo: </span>
                      <span className="text-neutral-900 font-medium">{spec.cargo_length}" × {spec.cargo_width}"</span>
                    </div>
                    <div className="px-3 py-1.5 bg-neutral-100 rounded-lg">
                      <span className="text-neutral-600">Weight: </span>
                      <span className="text-neutral-900 font-medium">{loadPlan.total_weight.toLocaleString()} lbs</span>
                      <span className="text-neutral-500 ml-1">({loadPlan.payload_used_percent.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setIsFullscreen(false)}
                  className="p-2 hover:bg-neutral-100 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-neutral-600" />
                </button>
              </div>
              
              <div className="p-8 overflow-auto">
                <ICODESDiagram 
                  loadPlan={loadPlan}
                  showCoB={showCoB}
                  showWeights={showWeights}
                  compact={false}
                  scale={fullscreenScale}
                  isFullscreen={true}
                  onTooltipChange={setTooltip}
                />
              </div>

              <div className="sticky bottom-0 bg-white border-t border-neutral-200 px-6 py-4">
                <div className="flex items-center justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-blue-100 border border-blue-500"></div>
                    <span className="text-neutral-600">Pallet</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-red-50 border border-red-400"></div>
                    <span className="text-neutral-600">HAZMAT</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded bg-green-100 border border-green-500"></div>
                    <span className="text-neutral-600">Rolling Stock</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                    <span className="text-neutral-600">Overheight (&gt;96")</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-0.5 bg-green-500" style={{ borderStyle: 'dashed', borderWidth: 1 }}></div>
                    <span className="text-neutral-600">Center of Balance</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function ICODESMiniViewer({ loadPlan }: { loadPlan: AircraftLoadPlan }) {
  return <ICODESViewer loadPlan={loadPlan} compact showCoB={false} showWeights={false} />;
}
