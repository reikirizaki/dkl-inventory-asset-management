import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

export type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13';

/**
 * Calculates the standard EAN-13 modulo 10 checksum digit for the first 12 digits.
 * Formula: sum of odd positions * 1 + sum of even positions * 3
 * checksum = (10 - (sum % 10)) % 10
 */
export function calculateEan13Checksum(input12: string): number {
  const digits = input12.replace(/\D/g, '').slice(0, 12).padStart(12, '0');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Validates if a string is a mathematically valid 13-digit EAN-13 barcode.
 */
export function isValidEan13(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 13) return false;
  const expectedCheck = calculateEan13Checksum(digits.slice(0, 12));
  return parseInt(digits[12], 10) === expectedCheck;
}

/**
 * Normalizes any text or asset code to a 100% valid 13-digit EAN-13 barcode.
 * Never throws, ensuring JsBarcode can always render without crashing.
 * Prefixes with 899 (GS1 Indonesia) when padding is needed.
 */
export function normalizeToEan13(raw: string): string {
  if (!raw) return '8990000000019';
  const digitsOnly = raw.replace(/\D/g, '');

  if (digitsOnly.length === 13) {
    const base12 = digitsOnly.slice(0, 12);
    const correctCheck = calculateEan13Checksum(base12);
    return `${base12}${correctCheck}`;
  }

  if (digitsOnly.length === 12) {
    const check = calculateEan13Checksum(digitsOnly);
    return `${digitsOnly}${check}`;
  }

  if (digitsOnly.length > 0 && digitsOnly.length < 12) {
    const padded = digitsOnly.padStart(9, '0').slice(-9);
    const base12 = `899${padded}`;
    const check = calculateEan13Checksum(base12);
    return `${base12}${check}`;
  }

  // If string has no digits (e.g. "DKL-SGR-AST"): deterministic numeric hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  const hashStr = String(hash).padStart(9, '0').slice(-9);
  const base12 = `899${hashStr}`;
  const check = calculateEan13Checksum(base12);
  return `${base12}${check}`;
}

export function renderBarcodeToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options?: {
    format?: BarcodeFormat;
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
  }
) {
  try {
    const format = options?.format || 'CODE128';
    let textToEncode = text;

    if (format === 'EAN13') {
      textToEncode = normalizeToEan13(text);
    }

    JsBarcode(canvas, textToEncode, {
      format,
      width: options?.width || 2,
      height: options?.height || 50,
      displayValue: options?.displayValue !== false,
      fontSize: options?.fontSize || 14,
      margin: 8,
      background: '#ffffff',
      lineColor: '#0f172a',
    });
  } catch (error) {
    console.error('Failed to render barcode:', error);
  }
}

export function generateBarcodeDataUrl(
  text: string,
  options?: {
    format?: BarcodeFormat;
    width?: number;
    height?: number;
    displayValue?: boolean;
    fontSize?: number;
  }
): string {
  try {
    const canvas = document.createElement('canvas');
    renderBarcodeToCanvas(canvas, text, options);
    return canvas.toDataURL('image/png');
  } catch (error) {
    console.error('Failed to generate barcode data URL:', error);
    return '';
  }
}

export async function generateQrDataUrl(text: string, size = 180): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Failed to generate QR code:', err);
    return '';
  }
}

export function generateAssetCode(branch: 'SINGARAJA' | 'TEJAKULA', categoryCode: string, sequenceNumber: number): string {
  const branchCode = branch === 'SINGARAJA' ? 'SGR' : 'TJK';
  const cat = (categoryCode || 'AST').toUpperCase().slice(0, 3).padEnd(3, 'X');
  const seq = String(sequenceNumber).padStart(4, '0');
  return `DKL-${branchCode}-${cat}-${seq}`;
}

