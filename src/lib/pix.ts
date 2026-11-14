// Gerador padrão de BR Code (PIX Copia e Cola) EMV-QRCPS

function formatField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

function calculateCRC16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export interface PixPayloadOptions {
  chavePix: string;
  nomeRecebedor: string;
  cidadeRecebedor?: string;
  valor: number;
  descricao?: string;
  identificador?: string;
}

export function gerarPayloadPix({
  chavePix,
  nomeRecebedor,
  cidadeRecebedor = 'SAO PAULO',
  valor,
  descricao = '',
  identificador = '***',
}: PixPayloadOptions): string {
  // Limpar e formatar campos
  const cleanChave = chavePix.trim();
  const cleanNome = nomeRecebedor.trim().slice(0, 25).toUpperCase();
  const cleanCidade = cidadeRecebedor.trim().slice(0, 15).toUpperCase();
  const formattedValor = valor > 0 ? valor.toFixed(2) : '0.00';

  // Sub-campos Merchant Account Information (ID 26)
  const gui = formatField('00', 'br.gov.bcb.pix');
  const chave = formatField('01', cleanChave);
  const infoAdicional = descricao ? formatField('02', descricao.slice(0, 50)) : '';
  const merchantAccountInfo = formatField('26', `${gui}${chave}${infoAdicional}`);

  // Payload Base
  let payload = '';
  payload += formatField('00', '01'); // Payload Format Indicator
  payload += formatField('01', '12'); // Point of Initiation Method (12 = dinâmico / reutilizável)
  payload += merchantAccountInfo;
  payload += formatField('52', '0000'); // Merchant Category Code
  payload += formatField('53', '986'); // Transaction Currency (986 = BRL)
  if (valor > 0) {
    payload += formatField('54', formattedValor); // Transaction Amount
  }
  payload += formatField('58', 'BR'); // Country Code
  payload += formatField('59', cleanNome || 'DIARIA AI'); // Merchant Name
  payload += formatField('60', cleanCidade); // Merchant City

  // Additional Data Field Template (ID 62)
  const txid = formatField('05', identificador || '***');
  payload += formatField('62', txid);

  // CRC16 (ID 63)
  payload += '6304';
  const crc = calculateCRC16(payload);
  return `${payload}${crc}`;
}
