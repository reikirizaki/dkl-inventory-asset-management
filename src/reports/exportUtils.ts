import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { CompanySettings } from '../types';

export interface ExportColumn {
  header: string;
  dataKey: string;
}

export interface ExportOptions {
  title: string;
  companySettings: CompanySettings;
  columns: ExportColumn[];
  data: any[];
  filtersText?: string;
  periodText?: string;
  includeLogo?: boolean;
  includeImages?: boolean;
  imageField?: string;
}

// Convert image URL to Base64 safely with timeout, blob fetch & CORS fallback
export async function loadImageAsBase64(url: string, timeoutMs = 6000): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith('data:image')) return url;

  // Method 1: Fetch as blob (most reliable against canvas tainting & cache CORS issues)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const resp = await fetch(url, { signal: controller.signal, mode: 'cors' });
    clearTimeout(timer);
    if (resp.ok) {
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else resolve('');
        };
        reader.onerror = () => resolve('');
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // Proceed to fallback
  }

  // Method 2: HTMLImageElement + Canvas
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, timeoutMs);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(img.naturalWidth || 120, 240);
        canvas.height = Math.min(img.naturalHeight || 120, 240);
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    };

    // Cache buster to bypass cached non-CORS response
    const cacheUrl = url.includes('?') ? `${url}&cors=1` : `${url}?cors=1`;
    img.src = cacheUrl;
  });
}

export function exportToCsv(options: ExportOptions) {
  const { title, columns, data, includeImages, imageField = 'photoUrl' } = options;

  const effectiveCols = [...columns];
  if (includeImages) {
    effectiveCols.unshift({ header: 'Link Foto', dataKey: imageField });
  }

  const headerRow = effectiveCols.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
  const rows = data.map((item) =>
    effectiveCols
      .map((c) => {
        const val = item[c.dataKey] ?? (c.dataKey === imageField ? (item.photoUrl || '') : '');
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(',')
  );

  const csvContent = '\uFEFF' + [headerRow, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportToExcel(options: ExportOptions): Promise<void> {
  const {
    title,
    companySettings,
    columns,
    data,
    filtersText,
    periodText,
    includeLogo = true,
    includeImages = true,
    imageField = 'photoUrl',
  } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'DKL Inventory & Asset Management';
  workbook.lastModifiedBy = 'PT Darma Karya Lestari';
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet('Laporan Aset', {
    views: [{ showGridLines: true }],
  });

  // 1. Preload Company Logo
  let logoBase64: string | null = null;
  if (includeLogo && companySettings?.logoUrl) {
    logoBase64 = await loadImageAsBase64(companySettings.logoUrl, 6000);
  }

  // 2. Preload asset photos for the rows (up to 100 rows for performance)
  const assetImageMap: Record<number, { base64: string; ext: 'png' | 'jpeg' }> = {};
  if (includeImages) {
    const promises = data.slice(0, 100).map(async (item, idx) => {
      const imgUrl = item[imageField] || item.photoUrl || (item.photos && item.photos[0]);
      if (imgUrl) {
        const b64 = await loadImageAsBase64(imgUrl, 4000);
        if (b64) {
          const isPng = b64.startsWith('data:image/png');
          const cleanB64 = b64.replace(/^data:image\/\w+;base64,/, '');
          assetImageMap[idx] = { base64: cleanB64, ext: isPng ? 'png' : 'jpeg' };
        }
      }
    });
    await Promise.all(promises);
  }

  // Title & Corporate Header Block
  let startCol = 1;
  if (logoBase64) {
    const isPng = logoBase64.startsWith('data:image/png');
    const cleanLogo = logoBase64.replace(/^data:image\/\w+;base64,/, '');
    const logoId = workbook.addImage({
      base64: cleanLogo,
      extension: isPng ? 'png' : 'jpeg',
    });
    worksheet.addImage(logoId, {
      tl: { col: 0.1, row: 0.1 },
      ext: { width: 90, height: 42 },
      editAs: 'oneCell',
    });
    startCol = 3;
  }

  // Header texts
  const compRow = worksheet.getRow(1);
  compRow.getCell(startCol).value = companySettings.companyName || 'PT DARMA KARYA LESTARI';
  compRow.getCell(startCol).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0284C7' } };

  const appRow = worksheet.getRow(2);
  appRow.getCell(startCol).value = 'DKL INVENTORY & ASSET MANAGEMENT';
  appRow.getCell(startCol).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } };

  const titleRow = worksheet.getRow(3);
  titleRow.getCell(startCol).value = title.toUpperCase();
  titleRow.getCell(startCol).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } };

  const metaRow = worksheet.getRow(4);
  const metaParts = [`Tanggal Generate: ${new Date().toLocaleString('id-ID')}`];
  if (periodText) metaParts.push(`Periode: ${periodText}`);
  if (filtersText) metaParts.push(`Filter: ${filtersText}`);
  metaRow.getCell(startCol).value = metaParts.join(' | ');
  metaRow.getCell(startCol).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } };

  worksheet.getRow(1).height = 20;
  worksheet.getRow(2).height = 18;
  worksheet.getRow(3).height = 18;
  worksheet.getRow(4).height = 18;
  worksheet.getRow(5).height = 10; // blank separator

  // Table Columns
  const effectiveCols = [...columns];
  if (includeImages) {
    effectiveCols.unshift({ header: 'Foto Aset', dataKey: '_thumbnail' });
  }

  const tableHeaderRowIndex = 6;
  const headerRow = worksheet.getRow(tableHeaderRowIndex);
  headerRow.height = 26;

  effectiveCols.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0284C7' }, // Sky-600
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0369A1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });

  // Table Data Rows
  data.forEach((item, rowIdx) => {
    const currentExcelRowIndex = tableHeaderRowIndex + 1 + rowIdx;
    const row = worksheet.getRow(currentExcelRowIndex);
    row.height = includeImages ? 52 : 22;

    effectiveCols.forEach((col, colIdx) => {
      const cell = row.getCell(colIdx + 1);

      if (col.dataKey === '_thumbnail') {
        cell.value = '';
        const imgObj = assetImageMap[rowIdx];
        if (imgObj) {
          const imgId = workbook.addImage({
            base64: imgObj.base64,
            extension: imgObj.ext,
          });
          worksheet.addImage(imgId, {
            tl: { col: colIdx + 0.1, row: currentExcelRowIndex - 1 + 0.08 },
            ext: { width: 44, height: 44 },
            editAs: 'oneCell',
          });
        }
      } else {
        const val = item[col.dataKey];
        cell.value = val !== undefined && val !== null ? String(val) : '-';
      }

      cell.font = { name: 'Calibri', size: 9, color: { argb: 'FF1E293B' } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col.dataKey === '_thumbnail' ? 'center' : 'left',
        wrapText: true,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      // Alternating row styling
      if (rowIdx % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF8FAFC' },
        };
      }
    });
  });

  // Auto column widths
  effectiveCols.forEach((col, idx) => {
    if (col.dataKey === '_thumbnail') {
      worksheet.getColumn(idx + 1).width = 12;
    } else {
      let maxLen = col.header.length;
      data.forEach((d) => {
        const str = String(d[col.dataKey] ?? '');
        if (str.length > maxLen) maxLen = str.length;
      });
      worksheet.getColumn(idx + 1).width = Math.min(Math.max(maxLen + 3, 14), 36);
    }
  });

  // Write and trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportToPdf(options: ExportOptions) {
  const {
    title,
    companySettings,
    columns,
    data,
    filtersText,
    periodText,
    includeLogo = true,
    includeImages = true,
    imageField = 'photoUrl',
  } = options;

  const doc = new jsPDF('landscape', 'pt', 'a4');
  const pageWidth = doc.internal.pageSize.width;

  // 1. Preload company logo if requested
  let logoBase64: string | null = null;
  if (includeLogo && companySettings.logoUrl) {
    logoBase64 = await loadImageAsBase64(companySettings.logoUrl, 6000);
  }

  // 2. Preload asset image thumbnails if requested (limit to first 50 rows for memory/performance)
  const imageBase64Map: Record<number, string> = {};
  if (includeImages) {
    const promises = data.slice(0, 50).map(async (item, idx) => {
      const imgUrl = item[imageField] || item.photoUrl || (item.photos && item.photos[0]);
      if (imgUrl) {
        const b64 = await loadImageAsBase64(imgUrl, 4000);
        if (b64) imageBase64Map[idx] = b64;
      }
    });
    await Promise.all(promises);
  }

  // Header Banner - Professional Sky Blue & White branding
  doc.setFillColor(2, 132, 199); // Sky Blue #0284c7
  doc.rect(0, 0, pageWidth, 56, 'F');

  let textLeft = 40;

  // Render company logo in top banner
  if (includeLogo) {
    if (logoBase64) {
      try {
        const format = logoBase64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        // Draw white container for logo
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(40, 8, 42, 40, 4, 4, 'F');
        doc.addImage(logoBase64, format, 42, 10, 38, 36);
        textLeft = 94;
      } catch {
        textLeft = 40;
      }
    } else {
      // Fallback corporate vector badge
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(40, 10, 36, 36, 6, 6, 'F');
      doc.setTextColor(2, 132, 199);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('DKL', 47, 33);
      textLeft = 88;
    }
  }

  // Header Title & Corporate Identity
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(companySettings.companyName || 'PT DARMA KARYA LESTARI', textLeft, 26);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('DKL INVENTORY & ASSET MANAGEMENT', textLeft, 42);

  // Right-aligned Generation Date
  doc.setFontSize(8);
  doc.text(`Dicetak: ${new Date().toLocaleDateString('id-ID')}`, pageWidth - 40, 26, { align: 'right' });
  doc.text('Dokumen Resmi Perusahaan', pageWidth - 40, 40, { align: 'right' });

  // Subheader & Report Meta Box
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 40, 82);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);

  let currentY = 96;
  if (periodText) {
    doc.text(`Periode: ${periodText}`, 40, currentY);
    currentY += 12;
  }
  if (filtersText) {
    doc.text(`Filter yang digunakan: ${filtersText}`, 40, currentY);
    currentY += 12;
  }
  doc.text(`Tanggal Generate: ${new Date().toLocaleString('id-ID')}`, 40, currentY);
  currentY += 14;

  // Build table columns
  const effectiveCols = [...columns];
  if (includeImages) {
    effectiveCols.unshift({ header: 'Foto', dataKey: '_thumbnail' });
  }

  const tableHead = [effectiveCols.map((c) => c.header)];
  const tableBody = data.map((item) => {
    return effectiveCols.map((c) => {
      if (c.dataKey === '_thumbnail') return '';
      return String(item[c.dataKey] ?? '-');
    });
  });

  autoTable(doc, {
    startY: currentY,
    head: tableHead,
    body: tableBody,
    theme: 'striped',
    styles: {
      fontSize: 7.5,
      cellPadding: 4,
      minCellHeight: includeImages ? 30 : 16,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [2, 132, 199],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    bodyStyles: {
      textColor: [30, 41, 59],
    },
    alternateRowStyles: {
      fillColor: [240, 249, 255], // sky-50
    },
    columnStyles: {
      0: includeImages ? { cellWidth: 38 } : {},
    },
    margin: { left: 40, right: 40, bottom: 40 },
    didDrawCell: (cellData) => {
      // Draw thumbnail in the first column if image exists
      if (includeImages && cellData.column.index === 0 && cellData.section === 'body') {
        const rowIdx = cellData.row.index;
        const b64 = imageBase64Map[rowIdx];
        if (b64) {
          try {
            const fmt = b64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
            doc.addImage(
              b64,
              fmt,
              cellData.cell.x + 3,
              cellData.cell.y + 3,
              cellData.cell.width - 6,
              cellData.cell.height - 6
            );
          } catch {
            // ignore draw error
          }
        }
      }
    },
    didDrawPage: (dataInfo) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Halaman ${dataInfo.pageNumber} dari ${pageCount} | ${companySettings.companyName || 'PT DARMA KARYA LESTARI'}`,
        pageWidth / 2,
        doc.internal.pageSize.height - 20,
        { align: 'center' }
      );
    },
  });

  doc.save(`${title.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.pdf`);
}
