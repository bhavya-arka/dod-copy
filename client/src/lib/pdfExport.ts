/**
 * PACAF Airlift Demo - PDF Export Utility
 * 
 * Generates PDF documents for load plans using browser print functionality.
 * Creates a print-optimized view that can be saved as PDF.
 */

import {
  AllocationResult,
  AircraftLoadPlan,
  InsightsSummary,
  PALLET_463L
} from './pacafTypes';
import { SplitFlight, validateFlightLoad, calculateFlightWeight, calculateCenterOfBalance } from './flightSplitTypes';
import { ScheduledFlight, FlightRoute } from './routeTypes';
import { formatMilitaryTime } from './routeCalculations';

export interface SessionExportData {
  sessionName: string;
  exportDate: Date;
  allocationResult?: AllocationResult;
  splitFlights?: SplitFlight[];
  scheduledFlights?: ScheduledFlight[];
  routes?: FlightRoute[];
}

interface ExportOptions {
  includeInsights: boolean;
  includeDetailedManifest: boolean;
  title?: string;
}

function formatDate(): string {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function generateICODESsvg(loadPlan: AircraftLoadPlan): string {
  const spec = loadPlan.aircraft_spec;
  const scale = 0.4;
  const width = spec.cargo_width * scale;
  const length = spec.cargo_length * scale;
  const palletWidth = 88 * scale;
  const palletLength = 108 * scale;
  const isC17 = loadPlan.aircraft_type === 'C-17';

  let palletsSvg = '';
  for (let idx = 0; idx < spec.pallet_positions; idx++) {
    const station = spec.stations[idx];
    const posX = 50 + (station?.rdl_distance || 0) * scale - palletLength / 2;
    const posY = 30 + (width - palletWidth) / 2;
    const isRamp = spec.ramp_positions.includes(idx + 1);
    const placement = loadPlan.pallets.find(p => p.position_index === idx);

    const fillColor = placement 
      ? (placement.pallet.hazmat_flag ? '#7f1d1d' : '#1e40af')
      : '#0f172a';
    const strokeColor = isRamp ? '#f59e0b' : '#3b82f6';
    const strokeStyle = placement ? '' : 'stroke-dasharray: 4 2';

    palletsSvg += `
      <rect x="${posX}" y="${posY}" width="${palletLength}" height="${palletWidth}"
        fill="${fillColor}" stroke="${strokeColor}" stroke-width="1.5" ${strokeStyle} rx="2"/>
      <text x="${posX + palletLength / 2}" y="${posY - 5}" text-anchor="middle" fill="#64748b" font-size="8">${idx + 1}</text>
    `;

    if (placement) {
      palletsSvg += `
        <text x="${posX + palletLength / 2}" y="${posY + palletWidth / 2 - 5}" text-anchor="middle" fill="white" font-size="8" font-weight="bold">${placement.pallet.id}</text>
        <text x="${posX + palletLength / 2}" y="${posY + palletWidth / 2 + 7}" text-anchor="middle" fill="#94a3b8" font-size="7">${Math.round(placement.pallet.gross_weight).toLocaleString()}</text>
      `;
      if (placement.pallet.hazmat_flag) {
        palletsSvg += `<text x="${posX + 5}" y="${posY + 12}" fill="#fbbf24" font-size="8" font-weight="bold">!</text>`;
      }
    }
  }

  let vehiclesSvg = '';
  loadPlan.rolling_stock.forEach((vehicle, idx) => {
    const vLength = vehicle.length * scale;
    const vWidth = vehicle.width * scale;
    const posX = 50 + vehicle.position.z * scale - vLength / 2;
    const posY = 30 + (width - vWidth) / 2;

    vehiclesSvg += `
      <rect x="${posX}" y="${posY}" width="${vLength}" height="${vWidth}" fill="#365314" stroke="#84cc16" stroke-width="1.5" rx="3"/>
      <text x="${posX + vLength / 2}" y="${posY + vWidth / 2 + 3}" text-anchor="middle" fill="white" font-size="7">${String(vehicle.item_id).substring(0, 8)}</text>
    `;
  });

  const cobX = 50 + loadPlan.center_of_balance * scale;
  const cobColor = loadPlan.cob_in_envelope ? '#22c55e' : '#ef4444';
  const cobSvg = `
    <line x1="${cobX}" y1="25" x2="${cobX}" y2="${35 + width}" stroke="${cobColor}" stroke-width="2" stroke-dasharray="4 2"/>
    <polygon points="${cobX},25 ${cobX - 6},15 ${cobX + 6},15" fill="${cobColor}"/>
  `;

  return `
    <svg width="${length + 100}" height="${width + 60}" xmlns="http://www.w3.org/2000/svg">
      <rect x="50" y="30" width="${length}" height="${width}" fill="#1e293b" stroke="#475569" stroke-width="2" rx="${isC17 ? 10 : 5}"/>
      ${palletsSvg}
      ${vehiclesSvg}
      ${cobSvg}
      <text x="50" y="20" fill="#64748b" font-size="10">NOSE</text>
      <text x="${50 + length - 30}" y="20" fill="#64748b" font-size="10">RAMP</text>
    </svg>
  `;
}

function generateLoadPlanHTML(loadPlan: AircraftLoadPlan): string {
  const icodessvg = generateICODESsvg(loadPlan);
  
  const palletsRows = loadPlan.pallets.map(p => `
    <tr>
      <td style="padding: 4px 8px; border-bottom: 1px solid #374151;">${p.pallet.id}</td>
      <td style="padding: 4px 8px; border-bottom: 1px solid #374151;">${p.position_index + 1}${p.is_ramp ? ' (RAMP)' : ''}</td>
      <td style="padding: 4px 8px; border-bottom: 1px solid #374151; text-align: right;">${p.pallet.gross_weight.toLocaleString()} lbs</td>
      <td style="padding: 4px 8px; border-bottom: 1px solid #374151; text-align: center; color: ${p.pallet.hazmat_flag ? '#fbbf24' : '#6b7280'}; font-weight: ${p.pallet.hazmat_flag ? 'bold' : 'normal'};">${p.pallet.hazmat_flag ? '[!] HAZMAT' : 'No'}</td>
    </tr>
  `).join('');

  const vehicleRows = loadPlan.rolling_stock.map(v => `
    <tr>
      <td style="padding: 4px 8px; border-bottom: 1px solid #374151;">${v.item.description}</td>
      <td style="padding: 4px 8px; border-bottom: 1px solid #374151;">${v.length}" × ${v.width}" × ${v.height}"</td>
      <td style="padding: 4px 8px; border-bottom: 1px solid #374151; text-align: right;">${v.weight.toLocaleString()} lbs</td>
    </tr>
  `).join('');

  return `
    <div style="page-break-inside: avoid; margin-bottom: 30px; background: #1e293b; border-radius: 8px; padding: 20px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
        <div>
          <h2 style="margin: 0; color: white; font-size: 20px;">${loadPlan.aircraft_id}</h2>
          <p style="margin: 5px 0 0; color: #94a3b8;">${loadPlan.aircraft_spec.name} - ${loadPlan.phase} Phase</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; color: white; font-size: 18px; font-family: monospace;">${loadPlan.total_weight.toLocaleString()} lbs</p>
          <p style="margin: 5px 0 0; color: #94a3b8;">${loadPlan.payload_used_percent.toFixed(1)}% capacity</p>
        </div>
      </div>

      <div style="background: #0f172a; border-radius: 8px; padding: 10px; overflow-x: auto;">
        ${icodessvg}
      </div>

      <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 15px;">
        <div style="background: #0f172a; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Pallets</p>
          <p style="margin: 5px 0 0; color: white; font-weight: bold;">${loadPlan.pallets.length}/${loadPlan.aircraft_spec.pallet_positions}</p>
        </div>
        <div style="background: #0f172a; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Rolling Stock</p>
          <p style="margin: 5px 0 0; color: white; font-weight: bold;">${loadPlan.rolling_stock.length}</p>
        </div>
        <div style="background: #0f172a; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">PAX</p>
          <p style="margin: 5px 0 0; color: white; font-weight: bold;">${loadPlan.pax_count}</p>
        </div>
        <div style="background: #0f172a; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Center of Balance</p>
          <p style="margin: 5px 0 0; color: ${loadPlan.cob_in_envelope ? '#22c55e' : '#ef4444'}; font-weight: bold;">${loadPlan.cob_percent.toFixed(1)}%</p>
        </div>
        <div style="background: #0f172a; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Positions</p>
          <p style="margin: 5px 0 0; color: white; font-weight: bold;">${loadPlan.positions_used}/${loadPlan.positions_available}</p>
        </div>
      </div>

      ${loadPlan.pallets.length > 0 ? `
        <h3 style="color: white; margin: 20px 0 10px; font-size: 14px;">Pallet Manifest</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #0f172a;">
              <th style="padding: 8px; text-align: left; color: #94a3b8;">Pallet ID</th>
              <th style="padding: 8px; text-align: left; color: #94a3b8;">Position</th>
              <th style="padding: 8px; text-align: right; color: #94a3b8;">Weight</th>
              <th style="padding: 8px; text-align: center; color: #94a3b8;">HAZMAT</th>
            </tr>
          </thead>
          <tbody style="color: white;">
            ${palletsRows}
          </tbody>
        </table>
      ` : ''}

      ${loadPlan.rolling_stock.length > 0 ? `
        <h3 style="color: white; margin: 20px 0 10px; font-size: 14px;">Rolling Stock</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #0f172a;">
              <th style="padding: 8px; text-align: left; color: #94a3b8;">Description</th>
              <th style="padding: 8px; text-align: left; color: #94a3b8;">Dimensions</th>
              <th style="padding: 8px; text-align: right; color: #94a3b8;">Weight</th>
            </tr>
          </thead>
          <tbody style="color: white;">
            ${vehicleRows}
          </tbody>
        </table>
      ` : ''}
    </div>
  `;
}

export function exportLoadPlansToPDF(
  allocationResult: AllocationResult,
  insights: InsightsSummary,
  options: ExportOptions = { includeInsights: true, includeDetailedManifest: true }
): void {
  const title = options.title || 'PACAF Load Plan Report';
  
  const summaryHTML = `
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px;">
      <div style="background: #1e40af; padding: 20px; border-radius: 8px; text-align: center;">
        <p style="margin: 0; color: #93c5fd; font-size: 12px;">Total Aircraft</p>
        <p style="margin: 10px 0 0; color: white; font-size: 32px; font-weight: bold;">${allocationResult.total_aircraft}</p>
        <p style="margin: 5px 0 0; color: #93c5fd; font-size: 11px;">ADVON: ${allocationResult.advon_aircraft} | MAIN: ${allocationResult.main_aircraft}</p>
      </div>
      <div style="background: #1e293b; padding: 20px; border-radius: 8px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">Total Weight</p>
        <p style="margin: 10px 0 0; color: white; font-size: 24px; font-weight: bold;">${allocationResult.total_weight.toLocaleString()}</p>
        <p style="margin: 5px 0 0; color: #94a3b8; font-size: 11px;">lbs</p>
      </div>
      <div style="background: #1e293b; padding: 20px; border-radius: 8px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">Total Pallets</p>
        <p style="margin: 10px 0 0; color: white; font-size: 24px; font-weight: bold;">${allocationResult.total_pallets}</p>
        <p style="margin: 5px 0 0; color: #94a3b8; font-size: 11px;">463L Pallets</p>
      </div>
      <div style="background: #1e293b; padding: 20px; border-radius: 8px; text-align: center;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">Rolling Stock</p>
        <p style="margin: 10px 0 0; color: white; font-size: 24px; font-weight: bold;">${allocationResult.total_rolling_stock}</p>
        <p style="margin: 5px 0 0; color: #94a3b8; font-size: 11px;">Vehicles</p>
      </div>
    </div>
  `;

  let insightsHTML = '';
  if (options.includeInsights && insights.insights.length > 0) {
    const insightItems = insights.insights.slice(0, 5).map(insight => {
      const bgColor = insight.severity === 'critical' ? '#7f1d1d' 
        : insight.severity === 'warning' ? '#78350f' : '#1e293b';
      const borderColor = insight.severity === 'critical' ? '#dc2626'
        : insight.severity === 'warning' ? '#f59e0b' : '#3b82f6';
      
      return `
        <div style="background: ${bgColor}; border: 1px solid ${borderColor}; padding: 12px; border-radius: 6px; margin-bottom: 8px;">
          <p style="margin: 0; color: white; font-weight: bold; font-size: 13px;">${insight.title}</p>
          <p style="margin: 5px 0 0; color: #d1d5db; font-size: 12px;">${insight.description}</p>
          ${insight.recommendation ? `<p style="margin: 8px 0 0; color: #94a3b8; font-size: 11px; font-style: italic;">[Tip] ${insight.recommendation}</p>` : ''}
        </div>
      `;
    }).join('');

    insightsHTML = `
      <div style="margin-bottom: 30px; background: #0f172a; padding: 20px; border-radius: 8px;">
        <h2 style="color: white; margin: 0 0 15px; font-size: 16px;">AI Insights & Recommendations</h2>
        ${insightItems}
      </div>
    `;
  }

  const loadPlansHTML = allocationResult.load_plans.map(generateLoadPlanHTML).join('');

  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f172a;
          color: white;
          margin: 0;
          padding: 40px;
        }
        @media print {
          body { background: white; color: black; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { size: landscape; margin: 0.5in; }
      </style>
    </head>
    <body>
      <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #334155;">
        <div>
          <h1 style="margin: 0; font-size: 28px; color: white;">${title}</h1>
          <p style="margin: 5px 0 0; color: #94a3b8;">Generated: ${formatDate()}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; color: #94a3b8; font-size: 14px;">Aircraft Type: ${allocationResult.aircraft_type}</p>
          <p style="margin: 5px 0 0; color: #64748b; font-size: 12px;">PACAF Airlift Demo</p>
        </div>
      </header>

      ${summaryHTML}
      ${insightsHTML}
      
      <h2 style="color: white; margin: 30px 0 20px; font-size: 18px;">Load Plans (${allocationResult.load_plans.length} Aircraft)</h2>
      ${loadPlansHTML}

      <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #334155; text-align: center; color: #64748b; font-size: 11px;">
        <p>PACAF Airlift Demo - Load Plan Report</p>
        <p>Generated ${formatDate()} | UNCLASSIFIED - FOR TRAINING USE ONLY</p>
      </footer>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }
}

export function exportSessionSummaryToPDF(data: SessionExportData): void {
  const title = data.sessionName || 'ARKA Cargo Operations Session';
  const exportDateStr = data.exportDate.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  
  let statsHTML = '';
  if (data.allocationResult) {
    statsHTML += `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px;">
        <div style="background: #1e40af; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #93c5fd; font-size: 11px;">Total Aircraft</p>
          <p style="margin: 8px 0 0; color: white; font-size: 24px; font-weight: bold;">${data.allocationResult.total_aircraft}</p>
        </div>
        <div style="background: #1e293b; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Total Weight</p>
          <p style="margin: 8px 0 0; color: white; font-size: 20px; font-weight: bold;">${data.allocationResult.total_weight.toLocaleString()} lb</p>
        </div>
        <div style="background: #1e293b; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Total Pallets</p>
          <p style="margin: 8px 0 0; color: white; font-size: 20px; font-weight: bold;">${data.allocationResult.total_pallets}</p>
        </div>
        <div style="background: #1e293b; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Rolling Stock</p>
          <p style="margin: 8px 0 0; color: white; font-size: 20px; font-weight: bold;">${data.allocationResult.total_rolling_stock}</p>
        </div>
      </div>
    `;
  }
  
  let splitFlightsHTML = '';
  if (data.splitFlights && data.splitFlights.length > 0) {
    const rows = data.splitFlights.map(split => {
      const recalcWeight = calculateFlightWeight(split);
      const recalcCoB = calculateCenterOfBalance(split);
      const recalcSplit = { ...split, total_weight_lb: recalcWeight, center_of_balance_percent: recalcCoB };
      const validation = validateFlightLoad(recalcSplit);
      const statusColor = validation.valid ? '#22c55e' : '#ef4444';
      return `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #374151;">${split.callsign}</td>
          <td style="padding: 8px; border-bottom: 1px solid #374151;">${split.aircraft_type}</td>
          <td style="padding: 8px; border-bottom: 1px solid #374151;">${split.origin.icao} → ${split.destination.icao}</td>
          <td style="padding: 8px; border-bottom: 1px solid #374151;">${formatMilitaryTime(split.scheduled_departure)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: center;">${split.pallets.length}</td>
          <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: right;">${recalcWeight.toLocaleString()} lb</td>
          <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: center;">${recalcCoB.toFixed(1)}%</td>
          <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: center; color: ${statusColor};">${validation.valid ? 'OK' : 'ISSUES'}</td>
        </tr>
      `;
    }).join('');
    
    splitFlightsHTML = `
      <div style="margin-top: 30px;">
        <h2 style="color: white; font-size: 16px; margin-bottom: 15px;">Split Flights (${data.splitFlights.length})</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #22c55e;">
              <th style="padding: 10px; text-align: left; color: white;">Callsign</th>
              <th style="padding: 10px; text-align: left; color: white;">Type</th>
              <th style="padding: 10px; text-align: left; color: white;">Route</th>
              <th style="padding: 10px; text-align: left; color: white;">Departure</th>
              <th style="padding: 10px; text-align: center; color: white;">Pallets</th>
              <th style="padding: 10px; text-align: right; color: white;">Weight</th>
              <th style="padding: 10px; text-align: center; color: white;">CoB</th>
              <th style="padding: 10px; text-align: center; color: white;">Status</th>
            </tr>
          </thead>
          <tbody style="color: white;">
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }
  
  let scheduledFlightsHTML = '';
  if (data.scheduledFlights && data.scheduledFlights.length > 0) {
    const rows = data.scheduledFlights.map(flight => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #374151;">${flight.callsign}</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151;">${flight.aircraft_type}</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151;">${flight.origin.icao}</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151;">${flight.destination.icao}</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151;">${formatMilitaryTime(flight.scheduled_departure)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151;">${formatMilitaryTime(flight.scheduled_arrival)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: center;">${flight.status}</td>
      </tr>
    `).join('');
    
    scheduledFlightsHTML = `
      <div style="margin-top: 30px;">
        <h2 style="color: white; font-size: 16px; margin-bottom: 15px;">Flight Schedule (${data.scheduledFlights.length})</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #a855f7;">
              <th style="padding: 10px; text-align: left; color: white;">Callsign</th>
              <th style="padding: 10px; text-align: left; color: white;">Type</th>
              <th style="padding: 10px; text-align: left; color: white;">Origin</th>
              <th style="padding: 10px; text-align: left; color: white;">Dest</th>
              <th style="padding: 10px; text-align: left; color: white;">Departure</th>
              <th style="padding: 10px; text-align: left; color: white;">Arrival</th>
              <th style="padding: 10px; text-align: center; color: white;">Status</th>
            </tr>
          </thead>
          <tbody style="color: white;">
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }
  
  let routesHTML = '';
  if (data.routes && data.routes.length > 0) {
    const rows = data.routes.map(route => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #374151;">${route.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: center;">${route.legs.length}</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: right;">${route.total_distance_nm.toLocaleString()} nm</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: right;">${(route.total_fuel_lb / 1000).toFixed(1)}k lb</td>
        <td style="padding: 8px; border-bottom: 1px solid #374151; text-align: right;">${route.total_time_hr.toFixed(1)}h</td>
      </tr>
    `).join('');
    
    routesHTML = `
      <div style="margin-top: 30px;">
        <h2 style="color: white; font-size: 16px; margin-bottom: 15px;">Routes (${data.routes.length})</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #f97316;">
              <th style="padding: 10px; text-align: left; color: white;">Route Name</th>
              <th style="padding: 10px; text-align: center; color: white;">Legs</th>
              <th style="padding: 10px; text-align: right; color: white;">Distance</th>
              <th style="padding: 10px; text-align: right; color: white;">Fuel</th>
              <th style="padding: 10px; text-align: right; color: white;">Time</th>
            </tr>
          </thead>
          <tbody style="color: white;">
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }
  
  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f172a;
          color: white;
          margin: 0;
          padding: 40px;
        }
        @media print {
          body { background: white; color: black; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { size: landscape; margin: 0.5in; }
      </style>
    </head>
    <body>
      <header style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #334155;">
        <div>
          <h1 style="margin: 0; font-size: 28px; color: white;">ARKA CARGO OPERATIONS</h1>
          <p style="margin: 5px 0 0; color: #94a3b8;">${title}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; color: #94a3b8; font-size: 12px;">Generated: ${exportDateStr}</p>
        </div>
      </header>

      ${statsHTML}
      ${splitFlightsHTML}
      ${scheduledFlightsHTML}
      ${routesHTML}

      <footer style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #334155; text-align: center; color: #64748b; font-size: 11px;">
        <p>ARKA CARGO OPERATIONS - Session Report</p>
        <p>Generated ${exportDateStr} | UNCLASSIFIED</p>
      </footer>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }
}

export function exportSplitFlightToPDF(splitFlight: SplitFlight, routeInfo?: { distance_nm: number; fuel_lb: number; time_hr: number }, insights?: Array<{ type: string; message: string }>): void {
  const recalculatedWeight = calculateFlightWeight(splitFlight);
  const recalculatedCoB = calculateCenterOfBalance(splitFlight);
  const flightWithRecalc = {
    ...splitFlight,
    total_weight_lb: recalculatedWeight,
    center_of_balance_percent: recalculatedCoB
  };
  const validation = validateFlightLoad(flightWithRecalc);
  
  const hasHazmat = splitFlight.pallets.some(p => p.pallet.hazmat_flag);
  const maxPayload = splitFlight.aircraft_type === 'C-17' ? 170900 : 42000;
  const utilization = (recalculatedWeight / maxPayload) * 100;
  
  const palletRows = splitFlight.pallets.map((p, idx) => `
    <tr>
      <td style="padding: 6px 8px; border-bottom: 1px solid #374151;">${idx + 1}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #374151;">${p.pallet.id}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #374151; text-align: right;">${p.pallet.gross_weight.toLocaleString()} lb</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #374151; text-align: center;">${p.pallet.items.length}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #374151;">${p.is_ramp ? 'Ramp' : 'Cargo'}</td>
      <td style="padding: 6px 8px; border-bottom: 1px solid #374151; text-align: center; color: ${p.pallet.hazmat_flag ? '#fbbf24' : '#6b7280'};">${p.pallet.hazmat_flag ? 'HAZMAT' : '-'}</td>
    </tr>
  `).join('');
  
  const detailedCargoRows = splitFlight.pallets.flatMap(p => 
    p.pallet.items.map(item => `
      <tr>
        <td style="padding: 4px 8px; border-bottom: 1px solid #374151; font-size: 11px;">${p.pallet.id}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #374151; font-size: 11px;">${item.description}</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #374151; text-align: right; font-size: 11px;">${(item.weight_each_lb * item.quantity).toLocaleString()} lb</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #374151; text-align: center; font-size: 11px;">${item.length_in}"x${item.width_in}"x${item.height_in}"</td>
        <td style="padding: 4px 8px; border-bottom: 1px solid #374151; text-align: center; font-size: 11px; color: ${item.hazmat_flag ? '#fbbf24' : '#6b7280'};">${item.hazmat_flag ? 'HAZMAT' : '-'}</td>
      </tr>
    `)
  ).join('');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Split Flight: ${splitFlight.callsign}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: white; margin: 0; padding: 40px; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        @page { size: portrait; margin: 0.5in; }
      </style>
    </head>
    <body>
      <header style="margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #334155;">
        <h1 style="margin: 0; font-size: 24px;">Split Flight: ${splitFlight.callsign}</h1>
        <p style="margin: 5px 0 0; color: #94a3b8;">${splitFlight.origin.icao} → ${splitFlight.destination.icao}</p>
      </header>
      
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
        <div style="background: #1e293b; padding: 12px; border-radius: 6px;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Aircraft</p>
          <p style="margin: 5px 0 0; color: white; font-weight: bold;">${splitFlight.aircraft_type}</p>
        </div>
        <div style="background: #1e293b; padding: 12px; border-radius: 6px;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Departure</p>
          <p style="margin: 5px 0 0; color: white; font-weight: bold;">${formatMilitaryTime(splitFlight.scheduled_departure)}</p>
        </div>
        <div style="background: #1e293b; padding: 12px; border-radius: 6px;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Status</p>
          <p style="margin: 5px 0 0; color: ${validation.valid ? '#22c55e' : '#ef4444'}; font-weight: bold;">${validation.valid ? 'Valid' : 'Issues'}</p>
        </div>
      </div>
      
      ${hasHazmat ? `
        <div style="background: #7f1d1d; border: 2px solid #fbbf24; padding: 12px; border-radius: 6px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 18px; font-weight: bold; color: #fbbf24;">[!]</span>
          <div>
            <p style="margin: 0; color: #fbbf24; font-weight: bold;">HAZARDOUS MATERIALS ONBOARD</p>
            <p style="margin: 3px 0 0; color: #fca5a5; font-size: 12px;">This flight contains hazardous materials. Follow applicable handling procedures.</p>
          </div>
        </div>
      ` : ''}
      
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px;">
        <div style="background: #0f172a; padding: 12px; border-radius: 6px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Total Weight</p>
          <p style="margin: 5px 0 0; color: white; font-weight: bold;">${recalculatedWeight.toLocaleString()} lb</p>
        </div>
        <div style="background: #0f172a; padding: 12px; border-radius: 6px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Center of Balance</p>
          <p style="margin: 5px 0 0; color: ${validation.valid ? 'white' : '#ef4444'}; font-weight: bold;">${recalculatedCoB.toFixed(1)}%</p>
        </div>
        <div style="background: #0f172a; padding: 12px; border-radius: 6px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Pallets</p>
          <p style="margin: 5px 0 0; color: white; font-weight: bold;">${splitFlight.pallets.length}</p>
        </div>
        <div style="background: #0f172a; padding: 12px; border-radius: 6px; text-align: center;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px;">Utilization</p>
          <p style="margin: 5px 0 0; color: ${utilization > 95 ? '#ef4444' : utilization > 80 ? '#f59e0b' : '#22c55e'}; font-weight: bold;">${utilization.toFixed(1)}%</p>
        </div>
      </div>
      
      ${routeInfo ? `
        <h2 style="color: white; font-size: 16px; margin-bottom: 10px;">Route Information</h2>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
          <div style="background: #1e293b; padding: 12px; border-radius: 6px; text-align: center;">
            <p style="margin: 0; color: #94a3b8; font-size: 11px;">Distance</p>
            <p style="margin: 5px 0 0; color: white; font-weight: bold;">${routeInfo.distance_nm.toLocaleString()} nm</p>
          </div>
          <div style="background: #1e293b; padding: 12px; border-radius: 6px; text-align: center;">
            <p style="margin: 0; color: #94a3b8; font-size: 11px;">Fuel Required</p>
            <p style="margin: 5px 0 0; color: white; font-weight: bold;">${routeInfo.fuel_lb.toLocaleString()} lb</p>
          </div>
          <div style="background: #1e293b; padding: 12px; border-radius: 6px; text-align: center;">
            <p style="margin: 0; color: #94a3b8; font-size: 11px;">Time En Route</p>
            <p style="margin: 5px 0 0; color: white; font-weight: bold;">${routeInfo.time_hr.toFixed(1)} hr</p>
          </div>
        </div>
      ` : ''}
      
      ${!validation.valid ? `
        <div style="background: #7f1d1d; border: 1px solid #dc2626; padding: 12px; border-radius: 6px; margin-bottom: 20px;">
          <p style="margin: 0; color: white; font-weight: bold;">Validation Issues:</p>
          ${validation.issues.map(i => `<p style="margin: 5px 0 0; color: #fca5a5;">• ${i}</p>`).join('')}
        </div>
      ` : ''}
      
      ${splitFlight.pallets.length > 0 ? `
        <h2 style="color: white; font-size: 16px; margin-bottom: 10px;">Pallet Summary</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background: #22c55e;">
              <th style="padding: 8px; text-align: left; color: white;">Pos</th>
              <th style="padding: 8px; text-align: left; color: white;">Pallet ID</th>
              <th style="padding: 8px; text-align: right; color: white;">Weight</th>
              <th style="padding: 8px; text-align: center; color: white;">Items</th>
              <th style="padding: 8px; text-align: left; color: white;">Location</th>
              <th style="padding: 8px; text-align: center; color: white;">Hazmat</th>
            </tr>
          </thead>
          <tbody style="color: white;">
            ${palletRows}
          </tbody>
        </table>
        
        <h2 style="color: white; font-size: 16px; margin-bottom: 10px;">Detailed Cargo Manifest</h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px;">
          <thead>
            <tr style="background: #3b82f6;">
              <th style="padding: 6px 8px; text-align: left; color: white;">Pallet</th>
              <th style="padding: 6px 8px; text-align: left; color: white;">Description</th>
              <th style="padding: 6px 8px; text-align: right; color: white;">Weight</th>
              <th style="padding: 6px 8px; text-align: center; color: white;">Dimensions</th>
              <th style="padding: 6px 8px; text-align: center; color: white;">Hazmat</th>
            </tr>
          </thead>
          <tbody style="color: white;">
            ${detailedCargoRows}
          </tbody>
        </table>
      ` : ''}
      
      ${insights && insights.length > 0 ? `
        <h2 style="color: white; font-size: 16px; margin-bottom: 10px;">AI Insights</h2>
        <div style="background: #1e293b; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
          ${insights.map(insight => `
            <div style="margin-bottom: 10px; padding: 10px; background: ${insight.type === 'warning' ? '#7f1d1d' : insight.type === 'success' ? '#14532d' : '#1e3a8a'}; border-radius: 4px;">
              <p style="margin: 0; color: white; font-size: 12px;">${insight.message}</p>
            </div>
          `).join('')}
        </div>
      ` : ''}
      
      <footer style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #334155; text-align: center; color: #64748b; font-size: 10px;">
        <p>ARKA CARGO OPERATIONS | ${new Date().toLocaleDateString()} | UNCLASSIFIED</p>
      </footer>
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }
}

export function exportSingleLoadPlanToPDF(loadPlan: AircraftLoadPlan): void {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${loadPlan.aircraft_id} - Load Plan</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f172a;
          color: white;
          margin: 0;
          padding: 40px;
        }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { size: landscape; margin: 0.5in; }
      </style>
    </head>
    <body>
      <header style="margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 24px;">${loadPlan.aircraft_id} - Load Plan</h1>
        <p style="margin: 5px 0 0; color: #94a3b8;">Generated: ${formatDate()}</p>
      </header>
      ${generateLoadPlanHTML(loadPlan)}
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }
}
