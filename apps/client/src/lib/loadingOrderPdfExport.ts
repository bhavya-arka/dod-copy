/**
 * Loading Order PDF Export Engine
 * 
 * Generates professional print-ready PDF documents with 2D visual layout
 * for cargo placement and detailed loading manifests.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AircraftLoadPlan, PalletPlacement, VehiclePlacement } from './pacafTypes';
import { calculateLoadingSequence, LoadingSequenceItem } from './cargoLoadingSequence';

interface LoadingOrderPDFOptions {
  title?: string;
  includeNotes?: boolean;
  missionId?: string;
}

interface ColorScheme {
  fill: string;
  stroke: string;
}

const COLORS = {
  pallet: { fill: '#DBEAFE', stroke: '#2563EB' },
  vehicle: { fill: '#DCFCE7', stroke: '#16A34A' },
  hazmat: { fill: '#FEE2E2', stroke: '#DC2626' },
  empty: { fill: '#F9FAFB', stroke: '#D1D5DB' },
} as const;

const MARGINS = {
  top: 20,
  bottom: 20,
  left: 20,
  right: 20,
};

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0];
}

function formatDimensions(length: number, width: number, height: number): string {
  return `${Math.round(length)}×${Math.round(width)}×${Math.round(height)}"`;
}

function formatDate(): string {
  return new Date().toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
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

function calculateEstimatedLoadingTime(sequence: LoadingSequenceItem[]): string {
  if (sequence.length === 0) return '0 min';
  const totalSeconds = sequence.reduce((acc, item) => acc + item.animationDelay, 0) * 60;
  const minutes = Math.ceil(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}

function drawLegend(doc: jsPDF, x: number, y: number): void {
  const legendItems = [
    { label: 'Pallet', color: COLORS.pallet },
    { label: 'Vehicle', color: COLORS.vehicle },
    { label: 'HAZMAT', color: COLORS.hazmat },
    { label: 'Empty Position', color: COLORS.empty },
  ];

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('LEGEND:', x, y);

  let currentX = x + 18;
  legendItems.forEach((item) => {
    const [r, g, b] = hexToRgb(item.color.fill);
    doc.setFillColor(r, g, b);
    const [sr, sg, sb] = hexToRgb(item.color.stroke);
    doc.setDrawColor(sr, sg, sb);
    doc.setLineWidth(0.5);
    
    if (item.label === 'Empty Position') {
      doc.setLineDashPattern([1, 1], 0);
    } else {
      doc.setLineDashPattern([], 0);
    }
    
    doc.rect(currentX, y - 3, 8, 5, 'FD');
    doc.setLineDashPattern([], 0);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81);
    doc.text(item.label, currentX + 10, y);
    currentX += 35;
  });
}

function drawAircraftLayout(
  doc: jsPDF,
  loadPlan: AircraftLoadPlan,
  sequence: LoadingSequenceItem[],
  x: number,
  y: number,
  scale: number
): number {
  const spec = loadPlan.aircraft_spec;
  const isC17 = loadPlan.aircraft_type === 'C-17';
  
  const cargoLength = spec.cargo_length * scale;
  const cargoWidth = spec.cargo_width * scale;
  const palletLength = 108 * scale;
  const palletWidth = 88 * scale;

  doc.setDrawColor(55, 65, 81);
  doc.setLineWidth(1);
  doc.setFillColor(248, 250, 252);
  
  if (isC17) {
    doc.roundedRect(x, y, cargoLength, cargoWidth, 3, 3, 'FD');
  } else {
    doc.roundedRect(x, y, cargoLength, cargoWidth, 2, 2, 'FD');
  }

  const noseX = x - 15;
  const noseY = y + cargoWidth / 2;
  doc.setFillColor(248, 250, 252);
  doc.triangle(noseX, noseY, x, y + 5, x, y + cargoWidth - 5, 'FD');

  const rampStartX = x + cargoLength;
  doc.triangle(
    rampStartX, y + cargoWidth * 0.2,
    rampStartX, y + cargoWidth * 0.8,
    rampStartX + 20, y + cargoWidth / 2,
    'FD'
  );

  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(55, 65, 81);
  doc.text('FWD', x - 12, y + cargoWidth / 2 + 2);
  doc.text('AFT', x + cargoLength + 5, y + cargoWidth / 2 + 2);

  const sequenceMap = new Map<string, LoadingSequenceItem>();
  sequence.forEach(item => sequenceMap.set(item.id, item));

  // Draw station position labels and empty position backgrounds
  for (let idx = 0; idx < spec.pallet_positions; idx++) {
    const station = spec.stations[idx];
    const rdlDist = station?.rdl_distance || (idx * 120 + 60);
    const posX = x + rdlDist * scale - palletLength / 2;
    const posY = y + (cargoWidth - palletWidth) / 2;
    const isRamp = spec.ramp_positions.includes(idx + 1);

    // Draw position number labels
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(55, 65, 81);
    doc.text(`${idx + 1}${isRamp ? 'R' : ''}`, posX + palletLength / 2, posY - 2, { align: 'center' });
  }

  // Draw actual pallets at their real position_coord locations
  // Sort by position_coord descending to match loading sequence order (forward first)
  const sortedPlacements = [...loadPlan.pallets].sort((a, b) => b.position_coord - a.position_coord);
  
  sortedPlacements.forEach((placement) => {
    const pallet = placement.pallet;
    const seqItem = sequenceMap.get(pallet.id);
    
    // Use actual position_coord for X position (ramp-origin: 0=ramp, increasing toward nose)
    const posX = x + placement.position_coord * scale - palletLength / 2;
    
    // Calculate Y position based on lateral placement (for dual-lane aircraft)
    const lateralOffset = placement.lateral_placement?.y_center_in ?? 0;
    const posY = y + (cargoWidth / 2) + (lateralOffset * scale) - palletWidth / 2;
    
    let colors: ColorScheme;
    if (pallet.hazmat_flag) {
      colors = COLORS.hazmat;
    } else {
      colors = COLORS.pallet;
    }

    const [fr, fg, fb] = hexToRgb(colors.fill);
    const [sr, sg, sb] = hexToRgb(colors.stroke);
    
    doc.setFillColor(fr, fg, fb);
    doc.setDrawColor(sr, sg, sb);
    doc.setLineWidth(0.5);
    doc.setLineDashPattern([], 0);
    doc.roundedRect(posX, posY, palletLength, palletWidth, 1, 1, 'FD');

    if (seqItem) {
      doc.setFillColor(37, 99, 235);
      doc.circle(posX + 4, posY + 4, 3, 'F');
      doc.setFontSize(5);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(String(seqItem.sequenceNumber), posX + 4, posY + 5.5, { align: 'center' });
    }

    doc.setFontSize(4);
    doc.setTextColor(31, 41, 55);
    doc.setFont('helvetica', 'bold');
    const palletId = pallet.id.length > 12 ? pallet.id.substring(0, 12) + '...' : pallet.id;
    doc.text(palletId, posX + palletLength / 2, posY + palletWidth / 2 - 2, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.text(`${Math.round(pallet.gross_weight).toLocaleString()} lb`, posX + palletLength / 2, posY + palletWidth / 2 + 2, { align: 'center' });

    if (pallet.hazmat_flag) {
      doc.setFontSize(6);
      doc.setTextColor(220, 38, 38);
      doc.text('⚠', posX + 2, posY + palletWidth - 2);
    }
  });

  loadPlan.rolling_stock.forEach((vehicle) => {
    const seqItem = sequenceMap.get(String(vehicle.item_id));
    const vLength = vehicle.length * scale;
    const vWidth = vehicle.width * scale;
    const posX = x + vehicle.position.z * scale - vLength / 2;
    const posY = y + (cargoWidth - vWidth) / 2;

    let colors: ColorScheme;
    if (vehicle.item.hazmat_flag) {
      colors = COLORS.hazmat;
    } else {
      colors = COLORS.vehicle;
    }

    const [fr, fg, fb] = hexToRgb(colors.fill);
    const [sr, sg, sb] = hexToRgb(colors.stroke);
    
    doc.setFillColor(fr, fg, fb);
    doc.setDrawColor(sr, sg, sb);
    doc.setLineWidth(0.5);
    doc.roundedRect(posX, posY, vLength, vWidth, 1, 1, 'FD');

    if (seqItem) {
      doc.setFillColor(22, 163, 74);
      doc.circle(posX + 4, posY + 4, 3, 'F');
      doc.setFontSize(5);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.text(String(seqItem.sequenceNumber), posX + 4, posY + 5.5, { align: 'center' });
    }

    doc.setFontSize(4);
    doc.setTextColor(22, 101, 52);
    doc.setFont('helvetica', 'bold');
    doc.text('VEHICLE', posX + vLength / 2, posY + vWidth / 2 - 1, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`${vehicle.weight.toLocaleString()} lb`, posX + vLength / 2, posY + vWidth / 2 + 3, { align: 'center' });
  });

  const cobX = x + loadPlan.center_of_balance * scale;
  const cobColor = loadPlan.cob_in_envelope ? '#16A34A' : '#DC2626';
  const [cr, cg, cb] = hexToRgb(cobColor);
  
  doc.setDrawColor(cr, cg, cb);
  doc.setLineWidth(0.8);
  doc.setLineDashPattern([3, 2], 0);
  doc.line(cobX, y - 5, cobX, y + cargoWidth + 5);
  doc.setLineDashPattern([], 0);

  doc.setFillColor(cr, cg, cb);
  doc.triangle(cobX - 3, y - 8, cobX + 3, y - 8, cobX, y - 3, 'F');

  doc.setFontSize(5);
  doc.setTextColor(cr, cg, cb);
  doc.setFont('helvetica', 'bold');
  doc.text(`CoB ${loadPlan.cob_percent.toFixed(1)}%`, cobX, y - 11, { align: 'center' });

  return y + cargoWidth + 20;
}

function addPageNumber(doc: jsPDF, pageNum: number, totalPages: number): void {
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text(`Page ${pageNum} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
  doc.text('Generated by ARKA Cargo Operations', pageWidth / 2, pageHeight - 5, { align: 'center' });
}

export function generateLoadingOrderPDF(
  loadPlan: AircraftLoadPlan,
  options?: LoadingOrderPDFOptions
): void {
  const sequence = calculateLoadingSequence(loadPlan);
  const title = options?.title || 'CARGO LOADING ORDER';
  const includeNotes = options?.includeNotes !== false;
  const missionId = options?.missionId || loadPlan.aircraft_id;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGINS.left - MARGINS.right;

  let currentY = MARGINS.top;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text(title, pageWidth / 2, currentY, { align: 'center' });
  currentY += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(55, 65, 81);
  doc.text(`${loadPlan.aircraft_type} - ${missionId}`, pageWidth / 2, currentY, { align: 'center' });
  currentY += 12;

  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(MARGINS.left, currentY, pageWidth - MARGINS.right, currentY);
  currentY += 8;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(55, 65, 81);
  
  const infoColWidth = contentWidth / 2;
  const leftX = MARGINS.left;
  const rightX = MARGINS.left + infoColWidth;

  doc.text('Mission ID:', leftX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(missionId, leftX + 25, currentY);

  doc.setFont('helvetica', 'bold');
  doc.text('Aircraft Type:', rightX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(loadPlan.aircraft_type, rightX + 28, currentY);
  currentY += 5;

  doc.setFont('helvetica', 'bold');
  doc.text('Aircraft ID:', leftX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(loadPlan.aircraft_id || 'N/A', leftX + 25, currentY);

  doc.setFont('helvetica', 'bold');
  doc.text('Generated:', rightX, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(formatMilDate(), rightX + 28, currentY);
  currentY += 10;

  doc.setFillColor(243, 244, 246);
  doc.roundedRect(MARGINS.left, currentY, contentWidth, 18, 2, 2, 'F');
  currentY += 5;

  const totalItems = sequence.length;
  const totalWeight = loadPlan.total_weight;
  const loadingTime = calculateEstimatedLoadingTime(sequence);
  const palletCount = loadPlan.pallets.length;
  const vehicleCount = loadPlan.rolling_stock.length;

  doc.setFontSize(9);
  const statsY = currentY + 3;
  const statsColWidth = contentWidth / 4;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(55, 65, 81);
  doc.text('Total Items:', leftX + 5, statsY);
  doc.setFont('helvetica', 'normal');
  doc.text(String(totalItems), leftX + 28, statsY);

  doc.setFont('helvetica', 'bold');
  doc.text('Total Weight:', leftX + statsColWidth + 5, statsY);
  doc.setFont('helvetica', 'normal');
  doc.text(`${totalWeight.toLocaleString()} lbs`, leftX + statsColWidth + 30, statsY);

  doc.setFont('helvetica', 'bold');
  doc.text('Est. Load Time:', leftX + statsColWidth * 2 + 5, statsY);
  doc.setFont('helvetica', 'normal');
  doc.text(loadingTime, leftX + statsColWidth * 2 + 35, statsY);

  doc.setFont('helvetica', 'bold');
  doc.text('CoB Status:', leftX + statsColWidth * 3 + 5, statsY);
  doc.setFont('helvetica', 'normal');
  const cobStatus = loadPlan.cob_in_envelope ? 'IN ENVELOPE' : 'OUT OF ENVELOPE';
  const cobStatusColor = loadPlan.cob_in_envelope ? [22, 163, 74] : [220, 38, 38];
  doc.setTextColor(cobStatusColor[0], cobStatusColor[1], cobStatusColor[2]);
  doc.text(cobStatus, leftX + statsColWidth * 3 + 28, statsY);
  doc.setTextColor(55, 65, 81);

  currentY += 18;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Pallets: ${palletCount}  |  Vehicles: ${vehicleCount}`, leftX + 5, currentY);
  currentY += 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('CARGO BAY LAYOUT', MARGINS.left, currentY);
  currentY += 6;

  const scale = 0.12;
  const layoutWidth = loadPlan.aircraft_spec.cargo_length * scale;
  const layoutX = (pageWidth - layoutWidth) / 2 - 10;
  currentY = drawAircraftLayout(doc, loadPlan, sequence, layoutX, currentY, scale);

  drawLegend(doc, MARGINS.left, currentY);
  currentY += 12;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(17, 24, 39);
  doc.text('LOADING SEQUENCE', MARGINS.left, currentY);
  currentY += 4;

  const tableData = sequence.map((item) => {
    const notes = includeNotes && item.loadingNotes.length > 0
      ? item.loadingNotes.slice(0, 2).join('; ')
      : '';
    
    // Convert scene units back to inches (scale = 0.01)
    const positionInches = Math.round(item.targetPosition.z * 100);
    
    return [
      item.sequenceNumber.toString(),
      item.type === 'pallet' ? 'Pallet' : 'Vehicle',
      item.tcn || item.id.substring(0, 15),
      item.name.length > 25 ? item.name.substring(0, 25) + '...' : item.name,
      item.weight.toLocaleString(),
      formatDimensions(item.dimensions.length, item.dimensions.width, item.dimensions.height),
      `${positionInches}"`,
      item.hazmat ? 'YES' : 'No',
      notes.length > 40 ? notes.substring(0, 40) + '...' : notes,
    ];
  });

  const columns = [
    { header: 'Seq#', dataKey: 'seq' },
    { header: 'Type', dataKey: 'type' },
    { header: 'TCN/ID', dataKey: 'tcn' },
    { header: 'Description', dataKey: 'desc' },
    { header: 'Weight (lbs)', dataKey: 'weight' },
    { header: 'Dimensions', dataKey: 'dims' },
    { header: 'Station', dataKey: 'pos' },
    { header: 'HAZMAT', dataKey: 'hazmat' },
  ];

  if (includeNotes) {
    columns.push({ header: 'Loading Notes', dataKey: 'notes' });
  }

  autoTable(doc, {
    startY: currentY,
    head: [columns.map(c => c.header)],
    body: tableData.map(row => includeNotes ? row : row.slice(0, 8)),
    margin: { left: MARGINS.left, right: MARGINS.right },
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
      overflow: 'linebreak',
      lineColor: [229, 231, 235],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [55, 65, 81],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      textColor: [55, 65, 81],
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { halign: 'center', cellWidth: 14 },
      2: { cellWidth: 22 },
      3: { cellWidth: includeNotes ? 30 : 40 },
      4: { halign: 'right', cellWidth: 18 },
      5: { halign: 'center', cellWidth: 22 },
      6: { halign: 'center', cellWidth: 14 },
      7: { halign: 'center', cellWidth: 12 },
      ...(includeNotes ? { 8: { cellWidth: 35 } } : {}),
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        addPageNumber(doc, i, pageCount);
      }
    },
  });

  const fileName = `Loading_Order_${missionId}_${formatMilDate().replace(/\s/g, '_')}.pdf`;
  doc.save(fileName);
}

export { formatDimensions, formatDate, formatMilDate };
