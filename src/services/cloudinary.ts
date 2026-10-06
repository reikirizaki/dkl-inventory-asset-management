const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || 'pcoz37fi';
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'dkl_asset_upload';

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  bytes?: number;
  format?: string;
  width?: number;
  height?: number;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export function validateImageFile(file: File): { isValid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
    return {
      isValid: false,
      error: 'Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.',
    };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      isValid: false,
      error: 'Ukuran foto maksimal 5 MB.',
    };
  }

  return { isValid: true };
}

export async function uploadImageToCloudinary(file: File): Promise<{ secure_url: string; public_id: string }> {
  const validation = validateImageFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Cloudinary API upload error:', errText);
      throw new Error('Upload foto gagal. Periksa koneksi internet dan coba lagi.');
    }

    const data: CloudinaryUploadResponse = await response.json();
    return {
      secure_url: data.secure_url,
      public_id: data.public_id,
    };
  } catch (error: any) {
    console.error('Cloudinary upload exception:', error);
    if (error.message && (error.message.includes('Format') || error.message.includes('Ukuran'))) {
      throw error;
    }
    throw new Error('Upload foto gagal. Periksa koneksi internet dan coba lagi.');
  }
}
