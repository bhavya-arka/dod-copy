/**
 * Warehouse Analytics PDF Export Engine
 * 
 * Generates professional PDF reports for warehouse analytics data
 * including metrics, aging breakdown, and site-level details.
 */

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  ARKA_COLORS,
  PDF_MARGINS,
  addPdfHeader,
  addAllPageFooters,
  addMetricBox,
  addSectionHeader,
  createPdfDocument,
  generatePdfFilename,
  formatMilitaryDate,
} from './warehousePdfUtils';

interface AgingBreakdown {
  lessThan1Year: number;
  oneToThreeYears: number;
  threeToFiveYears: number;
  moreThanFiveYears: number;
}

interface SiteAnalytics {
  siteId: number;
  siteCode: string;
  siteName: string;
  totalItems: number;
  totalQuantity: number;
  totalValue: number;
  capacityUtilization: number;
  agingBreakdown: AgingBreakdown;
  readinessScore: number;
}

interface OverallAnalytics {
  totalItems: number;
  totalValue: number;
  agingBreakdown: AgingBreakdown;
  readinessScore: number;
}

interface AnalyticsData {
  overall: OverallAnalytics;
  sites: SiteAnalytics[];
}

function getReadinessColor(score: number): [number, number, number] {
  if (score >= 80) return ARKA_COLORS.successRgb;
  if (score >= 60) return ARKA_COLORS.warningRgb;
  return ARKA_COLORS.dangerRgb;
}

function getCapacityColor(utilization: number): [number, number, number] {
  if (utilization > 80) return ARKA_COLORS.dangerRgb;
  if (utilization > 60) return ARKA_COLORS.warningRgb;
  return ARKA_COLORS.successRgb;
}

export function generateWarehouseAnalyticsPDF(analytics: AnalyticsData): void {
  const doc = createPdfDocument('landscape');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGINS.left - PDF_MARGINS.right;

  let currentY = addPdfHeader(
    doc,
    'Warehouse Analytics Report',
    `Generated ${formatMilitaryDate()} | ${analytics.sites.length} Sites`
  );

  currentY += 2;
  const metricsHeight = 25;
  const metricsWidth = contentWidth / 4 - 3;

  addMetricBox(
    doc,
    PDF_MARGINS.left,
    currentY,
    metricsWidth,
    metricsHeight,
    'Total Items',
    analytics.overall.totalItems.toLocaleString(),
    ARKA_COLORS.primaryRgb
  );

  addMetricBox(
    doc,
    PDF_MARGINS.left + metricsWidth + 4,
    currentY,
    metricsWidth,
    metricsHeight,
    'Total Value',
    `$${analytics.overall.totalValue.toLocaleString()}`,
    ARKA_COLORS.successRgb
  );

  addMetricBox(
    doc,
    PDF_MARGINS.left + (metricsWidth + 4) * 2,
    currentY,
    metricsWidth,
    metricsHeight,
    'Readiness Score',
    `${analytics.overall.readinessScore}%`,
    getReadinessColor(analytics.overall.readinessScore)
  );

  addMetricBox(
    doc,
    PDF_MARGINS.left + (metricsWidth + 4) * 3,
    currentY,
    metricsWidth,
    metricsHeight,
    'Total Sites',
    analytics.sites.length.toString(),
    ARKA_COLORS.primaryRgb
  );

  currentY += metricsHeight + 10;

  currentY = addSectionHeader(doc, currentY, 'Aging Breakdown');
  currentY += 2;

  const agingData = [
    ['< 1 Year', analytics.overall.agingBreakdown.lessThan1Year.toLocaleString(), 'GREEN - Current inventory'],
    ['1-3 Years', analytics.overall.agingBreakdown.oneToThreeYears.toLocaleString(), 'YELLOW - Monitor closely'],
    ['3-5 Years', analytics.overall.agingBreakdown.threeToFiveYears.toLocaleString(), 'ORANGE - Consider cycling'],
    ['> 5 Years', analytics.overall.agingBreakdown.moreThanFiveYears.toLocaleString(), 'RED - Priority action needed'],
  ];

  const agingColors: [number, number, number][] = [
    ARKA_COLORS.successRgb,
    ARKA_COLORS.warningRgb,
    [249, 115, 22], // Orange
    ARKA_COLORS.dangerRgb,
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Age Category', 'Item Count', 'Status']],
    body: agingData,
    margin: { left: PDF_MARGINS.left, right: pageWidth - PDF_MARGINS.left - contentWidth / 2 },
    tableWidth: contentWidth / 2 - 10,
    styles: {
      fontSize: 9,
      cellPadding: 3,
      lineColor: ARKA_COLORS.borderRgb,
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: ARKA_COLORS.textRgb,
      textColor: ARKA_COLORS.whiteRgb,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      textColor: ARKA_COLORS.textRgb,
    },
    columnStyles: {
      0: { cellWidth: 35, halign: 'left' },
      1: { cellWidth: 30, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 55, halign: 'left', fontSize: 8 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 1) {
        const colorIndex = data.row.index;
        if (colorIndex < agingColors.length) {
          data.cell.styles.textColor = agingColors[colorIndex];
        }
      }
    },
  });

  const agingTableEndY = (doc as any).lastAutoTable?.finalY || currentY + 40;

  doc.setFillColor(...ARKA_COLORS.backgroundRgb);
  const legendX = PDF_MARGINS.left + contentWidth / 2 + 10;
  const legendWidth = contentWidth / 2 - 10;
  doc.roundedRect(legendX, currentY, legendWidth, agingTableEndY - currentY, 3, 3, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ARKA_COLORS.textRgb);
  doc.text('READINESS SCORING GUIDE', legendX + 5, currentY + 8);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const guideItems = [
    { range: '80-100%', label: 'MISSION READY - Optimal inventory state', color: ARKA_COLORS.successRgb },
    { range: '60-79%', label: 'CAUTION - Some items need attention', color: ARKA_COLORS.warningRgb },
    { range: '0-59%', label: 'CRITICAL - Immediate action required', color: ARKA_COLORS.dangerRgb },
  ];

  let guideY = currentY + 16;
  guideItems.forEach((item) => {
    doc.setFillColor(...item.color);
    doc.rect(legendX + 5, guideY - 3, 8, 5, 'F');
    doc.setTextColor(...ARKA_COLORS.textRgb);
    doc.text(`${item.range}: ${item.label}`, legendX + 16, guideY);
    guideY += 8;
  });

  currentY = Math.max(agingTableEndY, guideY) + 10;

  currentY = addSectionHeader(doc, currentY, 'Site Details');
  currentY += 2;

  const siteData = analytics.sites.map((site) => [
    site.siteCode,
    site.siteName,
    site.totalItems.toLocaleString(),
    site.totalQuantity.toLocaleString(),
    `$${site.totalValue.toLocaleString()}`,
    `${site.capacityUtilization}%`,
    `${site.readinessScore}%`,
    site.agingBreakdown.lessThan1Year.toLocaleString(),
    site.agingBreakdown.oneToThreeYears.toLocaleString(),
    site.agingBreakdown.threeToFiveYears.toLocaleString(),
    site.agingBreakdown.moreThanFiveYears.toLocaleString(),
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Code', 'Site Name', 'Items', 'Qty', 'Value', 'Capacity', 'Readiness', '<1Y', '1-3Y', '3-5Y', '>5Y']],
    body: siteData,
    margin: { left: PDF_MARGINS.left, right: PDF_MARGINS.right },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: ARKA_COLORS.borderRgb,
      lineWidth: 0.1,
      overflow: 'ellipsize',
    },
    headStyles: {
      fillColor: ARKA_COLORS.primaryRgb,
      textColor: ARKA_COLORS.whiteRgb,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      textColor: ARKA_COLORS.textRgb,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 18, halign: 'center' },
      1: { cellWidth: 40 },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 16, halign: 'center' },
      8: { cellWidth: 16, halign: 'center' },
      9: { cellWidth: 16, halign: 'center' },
      10: { cellWidth: 16, halign: 'center' },
    },
    didParseCell: (data) => {
      if (data.section === 'body') {
        if (data.column.index === 5) {
          const val = parseInt(data.cell.raw?.toString().replace('%', '') || '0');
          data.cell.styles.textColor = getCapacityColor(val);
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 6) {
          const val = parseInt(data.cell.raw?.toString().replace('%', '') || '0');
          data.cell.styles.textColor = getReadinessColor(val);
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 10) {
          const val = parseInt(data.cell.raw?.toString().replace(',', '') || '0');
          if (val > 0) {
            data.cell.styles.textColor = ARKA_COLORS.dangerRgb;
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
  });

  addAllPageFooters(doc);

  const fileName = generatePdfFilename('Warehouse_Analytics');
  doc.save(fileName);
}
