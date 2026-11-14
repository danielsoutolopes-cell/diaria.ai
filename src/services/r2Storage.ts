import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const accountId =
  process.env.R2_ACCOUNT_ID ||
  process.env.CLOUDFLARE_ACCOUNT_ID ||
  '68ca46aaddc4d7b495e4be5e4a181d6e';

const accessKeyId =
  process.env.R2_ACCESS_KEY_ID ||
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ||
  '31c344ccaca4f80f548a89c01db80821';

const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY ||
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ||
  '3c9c1f0ecec21b7fd7f2a8f3671757240ce18d09687809bdcb09d435e30b36fc';

const bucketName = process.env.R2_BUCKET_NAME || 'diaria-ai';

const publicUrl = (
  process.env.R2_PUBLIC_URL ||
  process.env.CLOUDFLARE_R2_PUBLIC_URL ||
  'https://pub-bac6573cbcd34a0faeac347eabe96392.r2.dev'
).replace(/\/$/, '');

// Cliente S3 conectado ao Cloudflare R2
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export interface R2UploadResult {
  success: boolean;
  key: string;
  url: string;
  error?: string;
}

/**
 * Upload de buffer (fotos de recibos, comprovantes de vales, áudios ou PDFs de borderô) para o Cloudflare R2
 */
export async function uploadToR2(
  fileBuffer: Buffer | Uint8Array,
  fileName: string = 'recibo.jpg',
  contentType: string = 'image/jpeg'
): Promise<R2UploadResult> {
  const uniqueId = crypto.randomUUID();
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const key = `comprovantes/${Date.now()}-${uniqueId}-${sanitizedName}`;

  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await r2Client.send(command);

    const fileUrl = `${publicUrl}/${key}`;
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

/**
 * Extrai a chave (Key) do objeto R2 a partir da sua URL pública
 */
export function extrairKeyDeUrl(fileUrl: string): string | null {
  if (!fileUrl) return null;
  try {
    const parsed = new URL(fileUrl);
    // Remove a barra inicial do pathname
    const key = parsed.pathname.replace(/^\/+/, '');
    return key || null;
  } catch {
    // Se não for URL completa, testa se já é a key
    if (fileUrl.includes('comprovantes/') || fileUrl.includes('uploads/')) {
      return fileUrl;
    }
    return null;
  }
}

/**
 * Exclusão física de arquivo no Cloudflare R2 utilizando DeleteObjectCommand
 */
export async function deleteFromR2(fileKey: string): Promise<{ success: boolean; error?: string }> {
  if (!fileKey) return { success: false, error: 'Chave não informada.' };

  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });

    await r2Client.send(command);
    return { success: true };
  } catch (error: any) {
    console.error(`Erro ao excluir chave ${fileKey} no Cloudflare R2:`, error);
    return { success: false, error: error?.message || 'Falha ao deletar arquivo do R2' };
  }
}

/**
 * Exclusão física de arquivo no Cloudflare R2 a partir da URL pública
 */
export async function deleteFromR2ByUrl(fileUrl: string): Promise<{ success: boolean; error?: string }> {
  const key = extrairKeyDeUrl(fileUrl);
  if (!key) {
    return { success: false, error: 'Chave R2 não pôde ser extraída da URL informada.' };
  }
  return await deleteFromR2(key);
}

