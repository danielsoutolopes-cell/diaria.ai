export interface DateStampOptions {
  nomeObra: string;
  dataHoraFormatada?: string;
  autorNome?: string;
  clima?: string | null;
  coordenadas?: { lat: number; lng: number } | null;
  etapa?: string | null;
}

interface SharpPipeline {
  metadata(): Promise<{ width?: number; height?: number }>;
  composite(inputs: Array<{ input: Buffer; top: number; left: number }>): SharpPipeline;
  jpeg(options: { quality: number }): SharpPipeline;
  toBuffer(): Promise<Buffer>;
}

type SharpFn = (input: Buffer) => SharpPipeline;

/**
 * Aplica um carimbo indelével no rodapé da imagem com informações de auditoria
 * (Obra, Data/Hora de Brasília, Clima, Localização e Responsável).
 * Em ambientes Edge/Cloudflare Workers (sem binário nativo sharp), retorna o buffer original.
 */
export async function aplicarDateStamp(
  imageBuffer: Buffer,
  opcoes: DateStampOptions
): Promise<Buffer> {
  let sharpMod: SharpFn | null = null;
  try {
    const imported: unknown = await import('sharp');
    if (typeof imported === 'function') {
      sharpMod = imported as SharpFn;
    } else if (
      imported &&
      typeof imported === 'object' &&
      'default' in imported &&
      typeof (imported as { default: unknown }).default === 'function'
    ) {
      sharpMod = (imported as { default: SharpFn }).default;
    }
  } catch {
    return imageBuffer;
  }

  if (!sharpMod) {
    return imageBuffer;
  }

  const metadata = await sharpMod(imageBuffer).metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 800;

  const dataHora =
    opcoes.dataHoraFormatada ||
    new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());

  const linha1 = `OBRA: ${opcoes.nomeObra.toUpperCase()} ${opcoes.etapa ? `| ETAPA: ${opcoes.etapa.toUpperCase()}` : ''}`;
  const linha2 = `DATA/HORA: ${dataHora} (Horário de Brasília) ${opcoes.clima ? `| CLIMA: ${opcoes.clima}` : ''}`;
  
  let linha3 = `Ponto Patrícia (Diária.AI) • Registro de Campo`;
  if (opcoes.autorNome) {
    linha3 += ` | Por: ${opcoes.autorNome}`;
  }
  if (opcoes.coordenadas) {
    linha3 += ` | GPS: ${opcoes.coordenadas.lat.toFixed(4)}, ${opcoes.coordenadas.lng.toFixed(4)}`;
  }

  // Altura da barra inferior proporcional à imagem (mínimo 90px)
  const barHeight = Math.max(90, Math.round(height * 0.1));
  const fontSize = Math.max(14, Math.round(barHeight * 0.22));

  // Gera o SVG do overlay com fundo semitransparente escuro e texto nítido
  const svgOverlay = Buffer.from(`
    <svg width="${width}" height="${barHeight}">
      <rect width="100%" height="100%" fill="black" fill-opacity="0.75" />
      <rect width="6" height="100%" fill="#10b981" />
      <text x="24" y="${Math.round(barHeight * 0.32)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize + 2}" font-weight="bold" fill="#ffffff">
        ${escapeXml(linha1)}
      </text>
      <text x="24" y="${Math.round(barHeight * 0.62)}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" fill="#e2e8f0">
        ${escapeXml(linha2)}
      </text>
      <text x="24" y="${Math.round(barHeight * 0.88)}" font-family="Arial, Helvetica, sans-serif" font-size="${Math.max(11, fontSize - 3)}" font-weight="500" fill="#94a3b8">
        ${escapeXml(linha3)}
      </text>
    </svg>
  `);

  return await sharpMod(imageBuffer)
    .composite([
      {
        input: svgOverlay,
        top: height - barHeight,
        left: 0,
      },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '\'':
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

