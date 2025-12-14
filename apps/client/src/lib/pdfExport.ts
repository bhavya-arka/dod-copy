/**
 * PACAF Airlift Demo - PDF Export Utility
 * 
 * Generates professional print-ready PDF documents for ICODES load plans.
 * Optimized for printing with clear diagrams and comprehensive manifests.
 */

import {
  AllocationResult,
  AircraftLoadPlan,
  InsightsSummary,
  PALLET_463L,
  PalletPlacement
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
    minute: '2-digit',
    hour12: false
  });
}

function formatMilDate(): string {
  const now = new Date();
  const day = now.getDate().toString().padStart(2, '0');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[now.getMonth()];
  const year = now.getFullYear().toString().slice(-2);
  const hours = now.getHours().toString().padStart(2, '0');
  const mins = now.getMinutes().toString().padStart(2, '0');
  return `${day}${month}${year} ${hours}${mins}Z`;
}

function generatePrintICODESSvg(loadPlan: AircraftLoadPlan): string {
  const spec = loadPlan.aircraft_spec;
  const scale = 0.72;
  const width = spec.cargo_width * scale;
  const length = spec.cargo_length * scale;
  const palletWidth = 88 * scale;
  const palletLength = 108 * scale;
  const isC17 = loadPlan.aircraft_type === 'C-17';
  const svgWidth = length + 160;
  const svgHeight = width + 120;

  let positionLabels = '';
  let palletsSvg = '';
  
  for (let idx = 0; idx < spec.pallet_positions; idx++) {
    const station = spec.stations[idx];
    const rdlDist = station?.rdl_distance || (idx * 120 + 60);
    const posX = 50 + rdlDist * scale - palletLength / 2;
    const posY = 40 + (width - palletWidth) / 2;
    const isRamp = spec.ramp_positions.includes(idx + 1);
    const placement = loadPlan.pallets.find(p => p.position_index === idx);

    positionLabels += `
      <text x="${posX + palletLength / 2}" y="${posY - 8}" 
        text-anchor="middle" fill="#374151" font-size="9" font-weight="600">
        ${idx + 1}${isRamp ? 'R' : ''}
      </text>
    `;

    if (placement) {
      const fillColor = placement.pallet.hazmat_flag ? '#FEE2E2' : '#DBEAFE';
      const strokeColor = placement.pallet.hazmat_flag ? '#DC2626' : '#2563EB';
      
      palletsSvg += `
        <rect x="${posX}" y="${posY}" width="${palletLength}" height="${palletWidth}"
          fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" rx="3"/>
        <text x="${posX + palletLength / 2}" y="${posY + palletWidth / 2 - 6}" 
          text-anchor="middle" fill="#1F2937" font-size="8" font-weight="bold">
          ${placement.pallet.id.substring(0, 10)}
        </text>
        <text x="${posX + palletLength / 2}" y="${posY + palletWidth / 2 + 6}" 
          text-anchor="middle" fill="#374151" font-size="7">
          ${Math.round(placement.pallet.gross_weight).toLocaleString()} lb
        </text>
        <text x="${posX + palletLength / 2}" y="${posY + palletWidth / 2 + 16}" 
          text-anchor="middle" fill="#6B7280" font-size="6">
          H: ${placement.pallet.height}"
        </text>
      `;
      
      if (placement.pallet.hazmat_flag) {
        palletsSvg += `
          <text x="${posX + 4}" y="${posY + 12}" fill="#DC2626" font-size="10" font-weight="bold">⚠</text>
        `;
      }
    } else {
      palletsSvg += `
        <rect x="${posX}" y="${posY}" width="${palletLength}" height="${palletWidth}"
          fill="#F9FAFB" stroke="#D1D5DB" stroke-width="1" stroke-dasharray="4 2" rx="3"/>
        <text x="${posX + palletLength / 2}" y="${posY + palletWidth / 2 + 3}" 
          text-anchor="middle" fill="#9CA3AF" font-size="8">EMPTY</text>
      `;
    }
  }

  let vehiclesSvg = '';
  loadPlan.rolling_stock.forEach((vehicle) => {
    const vLength = vehicle.length * scale;
    const vWidth = vehicle.width * scale;
    const posX = 50 + vehicle.position.z * scale - vLength / 2;
    const posY = 40 + (width - vWidth) / 2;

    vehiclesSvg += `
      <rect x="${posX}" y="${posY}" width="${vLength}" height="${vWidth}" 
        fill="#DCFCE7" stroke="#16A34A" stroke-width="2" rx="3"/>
      <text x="${posX + vLength / 2}" y="${posY + vWidth / 2 - 4}" 
        text-anchor="middle" fill="#166534" font-size="7" font-weight="bold">VEHICLE</text>
      <text x="${posX + vLength / 2}" y="${posY + vWidth / 2 + 6}" 
        text-anchor="middle" fill="#166534" font-size="6">
        ${vehicle.weight.toLocaleString()} lb
      </text>
    `;
  });

  const cobX = 50 + loadPlan.center_of_balance * scale;
  const cobColor = loadPlan.cob_in_envelope ? '#16A34A' : '#DC2626';
  const cobSvg = `
    <line x1="${cobX}" y1="30" x2="${cobX}" y2="${50 + width}" 
      stroke="${cobColor}" stroke-width="2" stroke-dasharray="6 3"/>
    <polygon points="${cobX},30 ${cobX - 8},18 ${cobX + 8},18" fill="${cobColor}"/>
    <text x="${cobX}" y="12" text-anchor="middle" fill="${cobColor}" font-size="8" font-weight="bold">
      CoB ${loadPlan.cob_percent.toFixed(1)}%
    </text>
  `;

  const fwdEnvX = 50 + (spec.cargo_length * ((spec as any).cob_envelope_fwd || 20) / 100) * scale;
  const aftEnvX = 50 + (spec.cargo_length * ((spec as any).cob_envelope_aft || 35) / 100) * scale;
  const envelopeSvg = `
    <line x1="${fwdEnvX}" y1="35" x2="${fwdEnvX}" y2="${45 + width}" 
      stroke="#9CA3AF" stroke-width="1" stroke-dasharray="3 3"/>
    <line x1="${aftEnvX}" y1="35" x2="${aftEnvX}" y2="${45 + width}" 
      stroke="#9CA3AF" stroke-width="1" stroke-dasharray="3 3"/>
    <text x="${fwdEnvX}" y="${55 + width}" text-anchor="middle" fill="#9CA3AF" font-size="7">FWD</text>
    <text x="${aftEnvX}" y="${55 + width}" text-anchor="middle" fill="#9CA3AF" font-size="7">AFT</text>
  `;

  return `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg" style="background: white;">
      <rect x="50" y="40" width="${length}" height="${width}" 
        fill="#F8FAFC" stroke="#374151" stroke-width="2" rx="${isC17 ? 8 : 4}"/>
      
      <path d="${isC17 
        ? `M 50 ${40 + width/2} Q 25 ${40 + width/2} 30 ${40 + width/4} L 30 ${40 + width*3/4} Q 25 ${40 + width/2} 50 ${40 + width/2}`
        : `M 50 ${40 + width/2} Q 35 ${40 + width/2} 38 ${40 + width/3} L 38 ${40 + width*2/3} Q 35 ${40 + width/2} 50 ${40 + width/2}`
      }" fill="#F8FAFC" stroke="#374151" stroke-width="2"/>
      
      <path d="${isC17
        ? `M ${50 + length} ${40 + width/2} L ${50 + length + 35} ${40 + width/3} L ${50 + length + 35} ${40 + width*2/3} Z`
        : `M ${50 + length} ${40 + width/2} L ${50 + length + 25} ${40 + width/3} L ${50 + length + 25} ${40 + width*2/3} Z`
      }" fill="#F8FAFC" stroke="#374151" stroke-width="2"/>
      
      <text x="15" y="${40 + width/2}" fill="#374151" font-size="11" font-weight="bold" 
        transform="rotate(-90, 15, ${40 + width/2})" text-anchor="middle">FWD</text>
      <text x="${65 + length}" y="${40 + width/2}" fill="#374151" font-size="11" font-weight="bold" 
        transform="rotate(90, ${65 + length}, ${40 + width/2})" text-anchor="middle">AFT/RAMP</text>
      
      ${envelopeSvg}
      ${positionLabels}
      ${palletsSvg}
      ${vehiclesSvg}
      ${cobSvg}
      
      <line x1="50" y1="${50 + width + 20}" x2="${50 + length}" y2="${50 + width + 20}" 
        stroke="#9CA3AF" stroke-width="1"/>
      <line x1="50" y1="${50 + width + 15}" x2="50" y2="${50 + width + 25}" stroke="#9CA3AF" stroke-width="1"/>
      <line x1="${50 + length}" y1="${50 + width + 15}" x2="${50 + length}" y2="${50 + width + 25}" stroke="#9CA3AF" stroke-width="1"/>
      <text x="${50 + length/2}" y="${50 + width + 35}" text-anchor="middle" fill="#6B7280" font-size="9">
        ${spec.cargo_length}" (${(spec.cargo_length / 12).toFixed(0)} ft)
      </text>
    </svg>
  `;
}

function generateDetailedManifestHTML(loadPlan: AircraftLoadPlan): string {
  if (loadPlan.pallets.length === 0 && loadPlan.rolling_stock.length === 0) {
    return '<p style="color: #6B7280; font-style: italic;">No cargo loaded</p>';
  }

  let html = '';
  
  if (loadPlan.pallets.length > 0) {
    const palletRows = loadPlan.pallets.map((p, idx) => {
      const items = p.pallet.items.slice(0, 3).map(i => i.description).join(', ');
      const moreCount = p.pallet.items.length > 3 ? ` (+${p.pallet.items.length - 3})` : '';
      return `
        <tr>
          <td style="padding: 6px 10px; border: 1px solid #E5E7EB;">${idx + 1}</td>
          <td style="padding: 6px 10px; border: 1px solid #E5E7EB; font-weight: 600;">${p.pallet.id}</td>
          <td style="padding: 6px 10px; border: 1px solid #E5E7EB; text-align: center;">${p.position_index + 1}${p.is_ramp ? ' (R)' : ''}</td>
          <td style="padding: 6px 10px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${p.pallet.gross_weight.toLocaleString()}</td>
          <td style="padding: 6px 10px; border: 1px solid #E5E7EB; text-align: center;">${p.pallet.height}"</td>
          <td style="padding: 6px 10px; border: 1px solid #E5E7EB; text-align: center; font-weight: ${p.pallet.hazmat_flag ? 'bold' : 'normal'}; color: ${p.pallet.hazmat_flag ? '#DC2626' : '#374151'};">
            ${p.pallet.hazmat_flag ? 'YES' : 'No'}
          </td>
          <td style="padding: 6px 10px; border: 1px solid #E5E7EB; font-size: 11px; color: #6B7280;">${items}${moreCount}</td>
        </tr>
      `;
    }).join('');

    html += `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px; font-size: 12px; color: #374151; border-bottom: 2px solid #2563EB; padding-bottom: 4px;">
          PALLET MANIFEST (${loadPlan.pallets.length} pallets)
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #F3F4F6;">
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: left; width: 40px;">#</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: left;">TCN/Pallet ID</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: center; width: 60px;">Pos</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: right; width: 80px;">Weight (lb)</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: center; width: 50px;">Height</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: center; width: 60px;">HAZMAT</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: left;">Contents</th>
            </tr>
          </thead>
          <tbody>${palletRows}</tbody>
        </table>
      </div>
    `;
  }

  if (loadPlan.rolling_stock.length > 0) {
    const vehicleRows = loadPlan.rolling_stock.map((v, idx) => `
      <tr>
        <td style="padding: 6px 10px; border: 1px solid #E5E7EB;">${idx + 1}</td>
        <td style="padding: 6px 10px; border: 1px solid #E5E7EB; font-weight: 600;">${v.item?.description || 'Vehicle'}</td>
        <td style="padding: 6px 10px; border: 1px solid #E5E7EB;">${v.length}" × ${v.width}" × ${v.height}"</td>
        <td style="padding: 6px 10px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${v.weight.toLocaleString()}</td>
        <td style="padding: 6px 10px; border: 1px solid #E5E7EB; text-align: center;">${v.deck || 'MAIN'}</td>
      </tr>
    `).join('');

    html += `
      <div style="margin-bottom: 20px;">
        <h4 style="margin: 0 0 8px; font-size: 12px; color: #374151; border-bottom: 2px solid #16A34A; padding-bottom: 4px;">
          ROLLING STOCK (${loadPlan.rolling_stock.length} vehicles)
        </h4>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #F3F4F6;">
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: left; width: 40px;">#</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: left;">Description</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: left;">Dimensions (L×W×H)</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: right; width: 80px;">Weight (lb)</th>
              <th style="padding: 8px 10px; border: 1px solid #D1D5DB; text-align: center; width: 60px;">Deck</th>
            </tr>
          </thead>
          <tbody>${vehicleRows}</tbody>
        </table>
      </div>
    `;
  }

  return html;
}

function generateLoadPlanPageHTML(loadPlan: AircraftLoadPlan, pageNum: number, totalPages: number): string {
  const icodessvg = generatePrintICODESSvg(loadPlan);
  const manifestHTML = generateDetailedManifestHTML(loadPlan);
  const spec = loadPlan.aircraft_spec;

  return `
    <div style="page-break-after: always; padding: 20px; font-family: 'Arial', sans-serif;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1F2937; padding-bottom: 12px; margin-bottom: 15px;">
        <div>
          <h1 style="margin: 0; font-size: 22px; color: #1F2937;">${loadPlan.aircraft_id}</h1>
          <p style="margin: 4px 0 0; color: #6B7280; font-size: 13px;">${spec.name} | ${loadPlan.phase} Phase | Mission ID: ${(loadPlan as any).mission_id || 'N/A'}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; font-size: 11px; color: #6B7280;">Page ${pageNum} of ${totalPages}</p>
          <p style="margin: 4px 0 0; font-size: 11px; color: #6B7280;">Generated: ${formatMilDate()}</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; margin-bottom: 15px;">
        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #1E40AF; font-size: 10px; text-transform: uppercase;">Total Weight</p>
          <p style="margin: 4px 0 0; color: #1E3A8A; font-size: 16px; font-weight: bold; font-family: monospace;">${loadPlan.total_weight.toLocaleString()}</p>
          <p style="margin: 2px 0 0; color: #3B82F6; font-size: 9px;">lb (${loadPlan.payload_used_percent.toFixed(1)}%)</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #374151; font-size: 10px; text-transform: uppercase;">Positions</p>
          <p style="margin: 4px 0 0; color: #1F2937; font-size: 16px; font-weight: bold;">${loadPlan.positions_used}/${loadPlan.positions_available}</p>
          <p style="margin: 2px 0 0; color: #6B7280; font-size: 9px;">used</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #374151; font-size: 10px; text-transform: uppercase;">Pallets</p>
          <p style="margin: 4px 0 0; color: #1F2937; font-size: 16px; font-weight: bold;">${loadPlan.pallets.length}</p>
          <p style="margin: 2px 0 0; color: #6B7280; font-size: 9px;">463L</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #374151; font-size: 10px; text-transform: uppercase;">Rolling Stock</p>
          <p style="margin: 4px 0 0; color: #1F2937; font-size: 16px; font-weight: bold;">${loadPlan.rolling_stock.length}</p>
          <p style="margin: 2px 0 0; color: #6B7280; font-size: 9px;">vehicles</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: #374151; font-size: 10px; text-transform: uppercase;">PAX</p>
          <p style="margin: 4px 0 0; color: #1F2937; font-size: 16px; font-weight: bold;">${loadPlan.pax_count}</p>
          <p style="margin: 2px 0 0; color: #6B7280; font-size: 9px;">of ${spec.seat_capacity}</p>
        </div>
        <div style="background: ${loadPlan.cob_in_envelope ? '#DCFCE7' : '#FEE2E2'}; border: 1px solid ${loadPlan.cob_in_envelope ? '#86EFAC' : '#FECACA'}; padding: 10px; border-radius: 4px; text-align: center;">
          <p style="margin: 0; color: ${loadPlan.cob_in_envelope ? '#166534' : '#991B1B'}; font-size: 10px; text-transform: uppercase;">Center of Balance</p>
          <p style="margin: 4px 0 0; color: ${loadPlan.cob_in_envelope ? '#15803D' : '#DC2626'}; font-size: 16px; font-weight: bold;">${loadPlan.cob_percent.toFixed(1)}%</p>
          <p style="margin: 2px 0 0; color: ${loadPlan.cob_in_envelope ? '#22C55E' : '#EF4444'}; font-size: 9px;">${loadPlan.cob_in_envelope ? 'IN ENVELOPE' : 'OUT OF ENVELOPE'}</p>
        </div>
      </div>

      <div style="background: #FAFAFA; border: 1px solid #E5E7EB; border-radius: 6px; padding: 15px; margin-bottom: 15px;">
        <h3 style="margin: 0 0 10px; font-size: 12px; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">
          ICODES Load Diagram - ${spec.name}
        </h3>
        <div style="overflow-x: auto; text-align: center;">
          ${icodessvg}
        </div>
        <div style="display: flex; justify-content: center; gap: 20px; margin-top: 10px; font-size: 10px;">
          <span style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 14px; height: 14px; background: #DBEAFE; border: 2px solid #2563EB; border-radius: 2px;"></span>
            Loaded Pallet
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 14px; height: 14px; background: #FEE2E2; border: 2px solid #DC2626; border-radius: 2px;"></span>
            HAZMAT
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 14px; height: 14px; background: #DCFCE7; border: 2px solid #16A34A; border-radius: 2px;"></span>
            Rolling Stock
          </span>
          <span style="display: flex; align-items: center; gap: 4px;">
            <span style="width: 14px; height: 14px; background: #F9FAFB; border: 1px dashed #D1D5DB; border-radius: 2px;"></span>
            Empty Position
          </span>
        </div>
      </div>

      ${manifestHTML}

      <div style="position: fixed; bottom: 20px; left: 20px; right: 20px; border-top: 1px solid #E5E7EB; padding-top: 10px; font-size: 9px; color: #9CA3AF; display: flex; justify-content: space-between;">
        <span>ARKA Cargo Operations - PACAF Airlift Planning System</span>
        <span>UNCLASSIFIED - FOR TRAINING USE ONLY</span>
      </div>
    </div>
  `;
}

export function exportLoadPlansToPDF(
  allocationResult: AllocationResult,
  insights: InsightsSummary,
  options: ExportOptions = { includeInsights: true, includeDetailedManifest: true }
): void {
  const title = options.title || 'ICODES Load Plan Report';
  const totalPages = allocationResult.load_plans.length + 1;

  const summaryHTML = `
    <div style="page-break-after: always; padding: 20px; font-family: 'Arial', sans-serif;">
      <div style="text-align: center; border-bottom: 3px solid #1F2937; padding-bottom: 20px; margin-bottom: 20px;">
        <h1 style="margin: 0; font-size: 28px; color: #1F2937;">${title}</h1>
        <p style="margin: 8px 0 0; color: #6B7280; font-size: 14px;">
          Aircraft Type: ${allocationResult.aircraft_type} | Generated: ${formatMilDate()}
        </p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px;">
        <div style="background: #1E40AF; color: white; padding: 20px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 12px; opacity: 0.9;">Total Aircraft</p>
          <p style="margin: 8px 0 0; font-size: 36px; font-weight: bold;">${allocationResult.total_aircraft}</p>
          <p style="margin: 4px 0 0; font-size: 11px; opacity: 0.8;">ADVON: ${allocationResult.advon_aircraft} | MAIN: ${allocationResult.main_aircraft}</p>
        </div>
        <div style="background: #F3F4F6; border: 2px solid #D1D5DB; padding: 20px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #6B7280;">Total Weight</p>
          <p style="margin: 8px 0 0; font-size: 28px; font-weight: bold; color: #1F2937; font-family: monospace;">${allocationResult.total_weight.toLocaleString()}</p>
          <p style="margin: 4px 0 0; font-size: 11px; color: #6B7280;">pounds</p>
        </div>
        <div style="background: #F3F4F6; border: 2px solid #D1D5DB; padding: 20px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #6B7280;">Total Pallets</p>
          <p style="margin: 8px 0 0; font-size: 28px; font-weight: bold; color: #1F2937;">${allocationResult.total_pallets}</p>
          <p style="margin: 4px 0 0; font-size: 11px; color: #6B7280;">463L pallets</p>
        </div>
        <div style="background: #F3F4F6; border: 2px solid #D1D5DB; padding: 20px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #6B7280;">Rolling Stock</p>
          <p style="margin: 8px 0 0; font-size: 28px; font-weight: bold; color: #1F2937;">${allocationResult.total_rolling_stock}</p>
          <p style="margin: 4px 0 0; font-size: 11px; color: #6B7280;">vehicles</p>
        </div>
      </div>

      ${options.includeInsights && insights.insights.length > 0 ? `
        <div style="margin-bottom: 25px;">
          <h2 style="font-size: 16px; color: #1F2937; border-bottom: 2px solid #F59E0B; padding-bottom: 8px; margin-bottom: 12px;">
            AI Insights & Recommendations
          </h2>
          ${insights.insights.slice(0, 5).map(insight => `
            <div style="background: ${insight.severity === 'critical' ? '#FEF2F2' : insight.severity === 'warning' ? '#FFFBEB' : '#F0F9FF'}; 
              border-left: 4px solid ${insight.severity === 'critical' ? '#DC2626' : insight.severity === 'warning' ? '#F59E0B' : '#3B82F6'}; 
              padding: 12px 15px; margin-bottom: 8px; border-radius: 0 4px 4px 0;">
              <p style="margin: 0; font-weight: 600; font-size: 13px; color: #1F2937;">${insight.title}</p>
              <p style="margin: 6px 0 0; font-size: 12px; color: #4B5563;">${insight.description}</p>
              ${insight.recommendation ? `<p style="margin: 6px 0 0; font-size: 11px; color: #6B7280; font-style: italic;">Recommendation: ${insight.recommendation}</p>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div>
        <h2 style="font-size: 16px; color: #1F2937; border-bottom: 2px solid #2563EB; padding-bottom: 8px; margin-bottom: 12px;">
          Aircraft Load Summary
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background: #1E40AF; color: white;">
              <th style="padding: 10px; text-align: left;">Aircraft ID</th>
              <th style="padding: 10px; text-align: left;">Type</th>
              <th style="padding: 10px; text-align: center;">Phase</th>
              <th style="padding: 10px; text-align: right;">Weight (lb)</th>
              <th style="padding: 10px; text-align: center;">Capacity</th>
              <th style="padding: 10px; text-align: center;">Pallets</th>
              <th style="padding: 10px; text-align: center;">Vehicles</th>
              <th style="padding: 10px; text-align: center;">PAX</th>
              <th style="padding: 10px; text-align: center;">CoB</th>
            </tr>
          </thead>
          <tbody>
            ${allocationResult.load_plans.map((lp, idx) => `
              <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'};">
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; font-weight: 600;">${lp.aircraft_id}</td>
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${lp.aircraft_spec.name}</td>
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: center;">${lp.phase}</td>
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${lp.total_weight.toLocaleString()}</td>
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: center;">${lp.payload_used_percent.toFixed(1)}%</td>
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: center;">${lp.pallets.length}</td>
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: center;">${lp.rolling_stock.length}</td>
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: center;">${lp.pax_count}</td>
                <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: center; color: ${lp.cob_in_envelope ? '#16A34A' : '#DC2626'}; font-weight: 600;">
                  ${lp.cob_percent.toFixed(1)}%
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="position: fixed; bottom: 20px; left: 20px; right: 20px; border-top: 1px solid #E5E7EB; padding-top: 10px; font-size: 9px; color: #9CA3AF; display: flex; justify-content: space-between;">
        <span>ARKA Cargo Operations - PACAF Airlift Planning System</span>
        <span>Page 1 of ${totalPages} | UNCLASSIFIED - FOR TRAINING USE ONLY</span>
      </div>
    </div>
  `;

  const loadPlanPages = allocationResult.load_plans.map((lp, idx) => 
    generateLoadPlanPageHTML(lp, idx + 2, totalPages)
  ).join('');

  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>${title}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Arial', 'Helvetica', sans-serif; background: white; color: #1F2937; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: letter landscape; margin: 0.4in; }
        }
      </style>
    </head>
    <body>
      ${summaryHTML}
      ${loadPlanPages}
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 300);
    };
  }
}

export function exportSingleLoadPlanToPDF(loadPlan: AircraftLoadPlan): void {
  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>ICODES - ${loadPlan.aircraft_id}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Arial', 'Helvetica', sans-serif; background: white; color: #1F2937; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: letter landscape; margin: 0.4in; }
        }
      </style>
    </head>
    <body>
      ${generateLoadPlanPageHTML(loadPlan, 1, 1)}
    </body>
    </html>
  `;

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 300);
    };
  }
}

export function exportSessionSummaryToPDF(data: SessionExportData): void {
  const title = data.sessionName || 'ARKA Cargo Operations Session';
  const exportDateStr = formatMilDate();
  
  let statsHTML = '';
  if (data.allocationResult) {
    statsHTML = `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px;">
        <div style="background: #1E40AF; color: white; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 11px; opacity: 0.9;">Total Aircraft</p>
          <p style="margin: 6px 0 0; font-size: 24px; font-weight: bold;">${data.allocationResult.total_aircraft}</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #6B7280;">Total Weight</p>
          <p style="margin: 6px 0 0; font-size: 20px; font-weight: bold; font-family: monospace;">${data.allocationResult.total_weight.toLocaleString()} lb</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #6B7280;">Total Pallets</p>
          <p style="margin: 6px 0 0; font-size: 20px; font-weight: bold;">${data.allocationResult.total_pallets}</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #6B7280;">Rolling Stock</p>
          <p style="margin: 6px 0 0; font-size: 20px; font-weight: bold;">${data.allocationResult.total_rolling_stock}</p>
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
      return `
        <tr>
          <td style="padding: 8px; border: 1px solid #E5E7EB;">${split.callsign}</td>
          <td style="padding: 8px; border: 1px solid #E5E7EB;">${split.aircraft_type}</td>
          <td style="padding: 8px; border: 1px solid #E5E7EB;">${split.origin.icao} → ${split.destination.icao}</td>
          <td style="padding: 8px; border: 1px solid #E5E7EB;">${formatMilitaryTime(split.scheduled_departure)}</td>
          <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: center;">${split.pallets.length}</td>
          <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${recalcWeight.toLocaleString()} lb</td>
          <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: center;">${recalcCoB.toFixed(1)}%</td>
          <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: center; color: ${validation.valid ? '#16A34A' : '#DC2626'}; font-weight: 600;">
            ${validation.valid ? 'OK' : 'ISSUES'}
          </td>
        </tr>
      `;
    }).join('');
    
    splitFlightsHTML = `
      <div style="margin-top: 25px;">
        <h2 style="font-size: 14px; color: #1F2937; border-bottom: 2px solid #22C55E; padding-bottom: 6px; margin-bottom: 10px;">
          Split Flights (${data.splitFlights.length})
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #22C55E; color: white;">
              <th style="padding: 8px; text-align: left;">Callsign</th>
              <th style="padding: 8px; text-align: left;">Type</th>
              <th style="padding: 8px; text-align: left;">Route</th>
              <th style="padding: 8px; text-align: left;">Departure</th>
              <th style="padding: 8px; text-align: center;">Pallets</th>
              <th style="padding: 8px; text-align: right;">Weight</th>
              <th style="padding: 8px; text-align: center;">CoB</th>
              <th style="padding: 8px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
  
  let scheduledFlightsHTML = '';
  if (data.scheduledFlights && data.scheduledFlights.length > 0) {
    const rows = data.scheduledFlights.map(flight => `
      <tr>
        <td style="padding: 8px; border: 1px solid #E5E7EB;">${flight.callsign}</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB;">${flight.aircraft_type}</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB;">${flight.origin.icao}</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB;">${flight.destination.icao}</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB;">${formatMilitaryTime(flight.scheduled_departure)}</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB;">${formatMilitaryTime(flight.scheduled_arrival)}</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: center;">${flight.status}</td>
      </tr>
    `).join('');
    
    scheduledFlightsHTML = `
      <div style="margin-top: 25px;">
        <h2 style="font-size: 14px; color: #1F2937; border-bottom: 2px solid #A855F7; padding-bottom: 6px; margin-bottom: 10px;">
          Flight Schedule (${data.scheduledFlights.length})
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #A855F7; color: white;">
              <th style="padding: 8px; text-align: left;">Callsign</th>
              <th style="padding: 8px; text-align: left;">Type</th>
              <th style="padding: 8px; text-align: left;">Origin</th>
              <th style="padding: 8px; text-align: left;">Destination</th>
              <th style="padding: 8px; text-align: left;">Departure</th>
              <th style="padding: 8px; text-align: left;">Arrival</th>
              <th style="padding: 8px; text-align: center;">Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }
  
  let routesHTML = '';
  if (data.routes && data.routes.length > 0) {
    const rows = data.routes.map(route => `
      <tr>
        <td style="padding: 8px; border: 1px solid #E5E7EB;">${route.name}</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: center;">${route.legs.length}</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${route.total_distance_nm.toLocaleString()} nm</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${(route.total_fuel_lb / 1000).toFixed(1)}k lb</td>
        <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: right;">${route.total_time_hr.toFixed(1)}h</td>
      </tr>
    `).join('');
    
    routesHTML = `
      <div style="margin-top: 25px;">
        <h2 style="font-size: 14px; color: #1F2937; border-bottom: 2px solid #F97316; padding-bottom: 6px; margin-bottom: 10px;">
          Routes (${data.routes.length})
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #F97316; color: white;">
              <th style="padding: 8px; text-align: left;">Route Name</th>
              <th style="padding: 8px; text-align: center;">Legs</th>
              <th style="padding: 8px; text-align: right;">Distance</th>
              <th style="padding: 8px; text-align: right;">Fuel</th>
              <th style="padding: 8px; text-align: right;">Time</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
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
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Arial', 'Helvetica', sans-serif; background: white; color: #1F2937; padding: 30px; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: letter portrait; margin: 0.5in; }
        }
      </style>
    </head>
    <body>
      <div style="text-align: center; border-bottom: 3px solid #1F2937; padding-bottom: 15px; margin-bottom: 20px;">
        <h1 style="font-size: 24px; color: #1F2937;">${title}</h1>
        <p style="margin: 8px 0 0; color: #6B7280; font-size: 12px;">Session Export | ${exportDateStr}</p>
      </div>

      ${statsHTML}
      ${splitFlightsHTML}
      ${scheduledFlightsHTML}
      ${routesHTML}

      <div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 10px; color: #9CA3AF;">
        <p>ARKA Cargo Operations - PACAF Airlift Planning System</p>
        <p>UNCLASSIFIED - FOR TRAINING USE ONLY</p>
      </div>
    </body>
    </html>
  `;
  
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 300);
    };
  }
}

export function exportSplitFlightToPDF(flight: SplitFlight): void {
  const recalcWeight = calculateFlightWeight(flight);
  const recalcCoB = calculateCenterOfBalance(flight);
  const recalcFlight = { ...flight, total_weight_lb: recalcWeight, center_of_balance_percent: recalcCoB };
  const validation = validateFlightLoad(recalcFlight);

  const palletRows = flight.pallets.map((p, idx) => `
    <tr style="background: ${idx % 2 === 0 ? '#FFFFFF' : '#F9FAFB'};">
      <td style="padding: 8px; border: 1px solid #E5E7EB;">${idx + 1}</td>
      <td style="padding: 8px; border: 1px solid #E5E7EB; font-weight: 600;">${p.pallet.id}</td>
      <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: right; font-family: monospace;">${p.pallet.gross_weight.toLocaleString()}</td>
      <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: center;">${p.pallet.height}"</td>
      <td style="padding: 8px; border: 1px solid #E5E7EB; text-align: center; color: ${p.pallet.hazmat_flag ? '#DC2626' : '#374151'}; font-weight: ${p.pallet.hazmat_flag ? 'bold' : 'normal'};">
        ${p.pallet.hazmat_flag ? 'YES' : 'No'}
      </td>
      <td style="padding: 8px; border: 1px solid #E5E7EB; font-size: 11px; color: #6B7280;">
        ${p.pallet.items.slice(0, 2).map(i => i.description).join(', ')}${p.pallet.items.length > 2 ? ` (+${p.pallet.items.length - 2})` : ''}
      </td>
    </tr>
  `).join('');

  const fullHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Flight ${flight.callsign}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Arial', 'Helvetica', sans-serif; background: white; color: #1F2937; padding: 30px; }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: letter portrait; margin: 0.5in; }
        }
      </style>
    </head>
    <body>
      <div style="text-align: center; border-bottom: 3px solid #1F2937; padding-bottom: 15px; margin-bottom: 20px;">
        <h1 style="font-size: 24px; color: #1F2937;">Flight ${flight.callsign}</h1>
        <p style="margin: 8px 0 0; color: #6B7280; font-size: 12px;">
          ${flight.aircraft_type} | ${flight.origin.icao} → ${flight.destination.icao} | ${formatMilDate()}
        </p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 20px;">
        <div style="background: #1E40AF; color: white; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 11px; opacity: 0.9;">Total Weight</p>
          <p style="margin: 6px 0 0; font-size: 20px; font-weight: bold; font-family: monospace;">${recalcWeight.toLocaleString()}</p>
          <p style="margin: 4px 0 0; font-size: 10px; opacity: 0.8;">lb</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #6B7280;">Pallets</p>
          <p style="margin: 6px 0 0; font-size: 20px; font-weight: bold;">${flight.pallets.length}</p>
        </div>
        <div style="background: ${validation.valid ? '#DCFCE7' : '#FEE2E2'}; border: 1px solid ${validation.valid ? '#86EFAC' : '#FECACA'}; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: ${validation.valid ? '#166534' : '#991B1B'};">Center of Balance</p>
          <p style="margin: 6px 0 0; font-size: 20px; font-weight: bold; color: ${validation.valid ? '#15803D' : '#DC2626'};">${recalcCoB.toFixed(1)}%</p>
        </div>
        <div style="background: #F3F4F6; border: 1px solid #D1D5DB; padding: 15px; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: #6B7280;">Departure</p>
          <p style="margin: 6px 0 0; font-size: 16px; font-weight: bold;">${formatMilitaryTime(flight.scheduled_departure)}</p>
        </div>
      </div>

      <div style="margin-top: 20px;">
        <h2 style="font-size: 14px; color: #1F2937; border-bottom: 2px solid #2563EB; padding-bottom: 6px; margin-bottom: 10px;">
          Cargo Manifest (${flight.pallets.length} pallets)
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
          <thead>
            <tr style="background: #2563EB; color: white;">
              <th style="padding: 8px; text-align: left; width: 40px;">#</th>
              <th style="padding: 8px; text-align: left;">Pallet ID</th>
              <th style="padding: 8px; text-align: right; width: 80px;">Weight (lb)</th>
              <th style="padding: 8px; text-align: center; width: 60px;">Height</th>
              <th style="padding: 8px; text-align: center; width: 60px;">HAZMAT</th>
              <th style="padding: 8px; text-align: left;">Contents</th>
            </tr>
          </thead>
          <tbody>${palletRows}</tbody>
        </table>
      </div>

      ${!validation.valid ? `
        <div style="margin-top: 20px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 15px;">
          <h3 style="margin: 0 0 10px; font-size: 13px; color: #991B1B;">Validation Issues</h3>
          <ul style="margin: 0; padding-left: 20px; color: #DC2626; font-size: 12px;">
            ${validation.issues.map(e => `<li>${e}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      <div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 10px; color: #9CA3AF;">
        <p>ARKA Cargo Operations - PACAF Airlift Planning System</p>
        <p>UNCLASSIFIED - FOR TRAINING USE ONLY</p>
      </div>
    </body>
    </html>
  `;
  
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(fullHTML);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => printWindow.print(), 300);
    };
  }
}
