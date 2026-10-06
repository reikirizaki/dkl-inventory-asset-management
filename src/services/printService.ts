/**
 * DKL INVENTORY & ASSET MANAGEMENT - GLOBAL PRINT SERVICE
 * Dedicated Print Window Engine for reliable Chrome Print Preview execution.
 * Synchronously opens a dedicated print window, injects styles & report HTML,
 * and triggers window.print() directly on top-level window.
 */

export interface PrintOptions {
  title?: string;
  landscape?: boolean;
  onBeforePrint?: () => void;
  onAfterPrint?: () => void;
  onError?: (error: Error) => void;
  timeoutMs?: number;
}

type PrintListener = (isPreparing: boolean) => void;
const listeners: Set<PrintListener> = new Set();

export function subscribePrintState(listener: PrintListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyPrintState(isPreparing: boolean) {
  listeners.forEach((fn) => {
    try {
      fn(isPreparing);
    } catch {}
  });
}

/**
 * Creates a dedicated print window synchronously.
 * Should be called immediately in the user click event call stack to avoid popup blockers.
 */
export function createPrintWindow(title = 'Cetak Dokumen - PT DARMA KARYA LESTARI'): Window | null {
  try {
    const win = window.open('', '_blank');
    if (!win) {
      showPopupBlockedMessage();
      return null;
    }
    return win;
  } catch (e) {
    showPopupBlockedMessage();
    return null;
  }
}

/**
 * Shows popup blocked alert and toast notification
 */
export function showPopupBlockedMessage() {
  const msg = 'Popup diblokir browser. Izinkan popup untuk mencetak.';
  console.warn(msg);
  alert(msg);

  const toastId = 'print-popup-blocked-toast';
  const existing = document.getElementById(toastId);
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className =
    'fixed bottom-6 right-6 z-[99999] bg-amber-600 text-white px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 text-xs font-bold';
  toast.innerHTML = `
    <span>⚠️ ${msg}</span>
    <button type="button" class="ml-2 text-white hover:text-amber-200 text-sm font-black" onclick="this.parentElement.remove()">✕</button>
  `;
  document.body.appendChild(toast);
  setTimeout(() => {
    try {
      toast.remove();
    } catch {}
  }, 8000);
}

/**
 * Collects all stylesheets and embedded style tags from the current document.
 */
function collectDocumentStylesheets(): string {
  try {
    return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('\n');
  } catch {
    return '';
  }
}

/**
 * Converts any <canvas> inside an HTMLElement into <img> with data URLs
 * and returns the rendered HTML string ready for printing.
 */
export function extractHtmlWithCanvas(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.classList.remove('hidden');
  clone.removeAttribute('id');
  clone.style.display = 'block';
  clone.style.visibility = 'visible';

  // Replace canvas in clone with <img> matching original canvas pixels
  const origCanvases = element.querySelectorAll('canvas');
  const cloneCanvases = clone.querySelectorAll('canvas');
  origCanvases.forEach((origCanvas, i) => {
    try {
      const dataUrl = origCanvas.toDataURL('image/png');
      const img = document.createElement('img');
      img.src = dataUrl;
      img.className = origCanvas.className;
      img.style.cssText = origCanvas.style.cssText;
      cloneCanvases[i]?.parentNode?.replaceChild(img, cloneCanvases[i]);
    } catch {}
  });

  return clone.outerHTML;
}

/**
 * Dedicated window printing core.
 * Synchronously writes full report document into a print window and invokes print.
 */
export function printViaDedicatedWindow(
  htmlContent: string,
  options: PrintOptions = {},
  existingWindow?: Window | null
): boolean {
  notifyPrintState(true);
  options.onBeforePrint?.();

  const printTitle = options.title || 'Cetak Dokumen - PT DARMA KARYA LESTARI';
  const landscape = options.landscape ?? true;

  // 1. Obtain dedicated print window synchronously
  let printWindow = existingWindow;
  if (!printWindow || printWindow.closed) {
    printWindow = createPrintWindow(printTitle);
  }

  if (!printWindow) {
    notifyPrintState(false);
    return false;
  }

  try {
    const styleSheets = collectDocumentStylesheets();

    const orientationStyle = landscape
      ? '@page { size: landscape; margin: 8mm; }'
      : '@page { size: portrait; margin: 8mm; }';

    const fullDocumentHtml = `
      <!DOCTYPE html>
      <html lang="id">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${printTitle}</title>
          ${styleSheets}
          <style>
            ${orientationStyle}
            *, *::before, *::after {
              box-sizing: border-box;
            }
            html, body {
              margin: 0 !important;
              padding: 10px !important;
              background: #ffffff !important;
              color: #0f172a !important;
              font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            img {
              max-width: 100%;
              print-color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            .break-inside-avoid {
              break-inside: avoid;
              page-break-inside: avoid;
            }
            /* Hidden utilities stripped */
            .hidden {
              display: block !important;
            }
            @media screen {
              body {
                background: #f8fafc !important;
              }
              .print-container {
                max-width: 1100px;
                margin: 20px auto;
                background: white;
                padding: 24px;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
              }
            }
            @media print {
              body {
                padding: 0 !important;
              }
              .print-container {
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            ${htmlContent}
          </div>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(fullDocumentHtml);
    printWindow.document.close();

    // Trigger Chrome Print Preview once layout has painted
    setTimeout(() => {
      try {
        if (!printWindow.closed) {
          printWindow.focus();
          printWindow.print();
        }
      } catch (err) {
        console.warn('printWindow.print() exception:', err);
      } finally {
        notifyPrintState(false);
        options.onAfterPrint?.();
      }
    }, 200);

    return true;
  } catch (error: any) {
    console.error('Error during dedicated window print:', error);
    notifyPrintState(false);
    options.onError?.(error);
    showPopupBlockedMessage();
    return false;
  }
}

/**
 * Universal print handler that prints HTMLElement or HTML string via dedicated window.
 */
export async function printElement(
  elementOrHtml: HTMLElement | string,
  options: PrintOptions = {},
  existingWindow?: Window | null
): Promise<boolean> {
  let contentHtml = '';
  if (typeof elementOrHtml === 'string') {
    contentHtml = elementOrHtml;
  } else {
    contentHtml = extractHtmlWithCanvas(elementOrHtml);
  }

  return printViaDedicatedWindow(contentHtml, options, existingWindow);
}

/**
 * Specialized helper: print official company reports.
 */
export async function printReport(
  reportHtml: string,
  title = 'Cetak Laporan Resmi',
  existingWindow?: Window | null
): Promise<boolean> {
  const containerHtml = `
    <div class="printable-report-wrapper" style="width: 100%; background: white;">
      ${reportHtml}
    </div>
  `;
  return printViaDedicatedWindow(containerHtml, { title, landscape: true }, existingWindow);
}

/**
 * Specialized helper: print barcode/QR sticker labels.
 */
export async function printLabels(
  labelsHtml: string,
  title = 'Cetak Label Barcode & QR',
  existingWindow?: Window | null
): Promise<boolean> {
  const containerHtml = `
    <div class="print-labels-container" style="display: flex; flex-wrap: wrap; gap: 14px; justify-content: flex-start; padding: 10px; background: white;">
      ${labelsHtml}
    </div>
  `;
  return printViaDedicatedWindow(containerHtml, { title, landscape: false }, existingWindow);
}

/**
 * Backward compatibility helper.
 */
export function getPrintRoot(): HTMLElement {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  return root;
}
