import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '68ca46aaddc4d7b495e4be5e4a181d6e';
const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || '31c344ccaca4f80f548a89c01db80821';
const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || '3c9c1f0ecec21b7fd7f2a8f3671757240ce18d09687809bdcb09d435e30b36fc';
const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`;
const publicUrl = process.env.CLOUDFLARE_R2_PUBLIC_URL || 'https://pub-bac6573cbcd34a0faeac347eabe96392.r2.dev';
const bucketName = process.env.R2_BUCKET_NAME || 'diaria-ai';

// Cliente S3 conectado ao Cloudflare R2
export const r2Client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export interface UploadResult {
  success: boolean;
  key: string;
  url: string;
  error?: string;
}

/**
 * Faz upload de um buffer (áudio de WhatsApp, foto de comprovante ou PDF de borderô) para o Cloudflare R2
 */
export async function uploadToR2(
  fileBuffer: Buffer | Uint8Array,
  fileName: string,
  contentType: string = 'application/octet-stream'
): Promise<UploadResult> {
  const key = `uploads/${Date.now()}-${fileName.replace(/\s+/g, '_')}`;

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await r2Client.send(command);

    const fileUrl = `${publicUrl.replace(/\/$/, '')}/${key}`;
    return {
      success: true,
      key,
      url: fileUrl,
    };
  } catch (error: any) {
    console.error('Erro no upload para Cloudflare R2:', error);
    return {
      success: false,
      key,
      url: '',
      error: error?.message || 'Falha no upload para o Cloudflare R2',
    };
  }
}

