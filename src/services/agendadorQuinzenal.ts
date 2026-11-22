export interface PartesDataBrasilia {
  ano: number;
  mes: number; // 1..12
  dia: number; // 1..31
  hora: number; // 0..23
  minuto: number; // 0..59
  diaSemana: number; // 0=Dom .. 5=Sex .. 6=Sab
  isoDate: string; // YYYY-MM-DD
}

/**
 * Extrai componentes de data/hora no fuso America/Sao_Paulo sem depender do fuso local do servidor.
 */
export function extrairPartesBrasilia(ref: Date = new Date()): PartesDataBrasilia {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });

  const parts = fmt.formatToParts(ref);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value || '0';

  const ano = Number(get('year'));
  const mes = Number(get('month'));
  const dia = Number(get('day'));
  const horaRaw = Number(get('hour'));
  const hora = horaRaw === 24 ? 0 : horaRaw;
  const minuto = Number(get('minute'));

  const wdMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const diaSemana = wdMap[get('weekday')] ?? 0;

  return {
    ano,
    mes,
    dia,
    hora,
    minuto,
    diaSemana,
    isoDate: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
  };
}

/**
 * Retorna os dias do mês correspondentes à 2ª sexta-feira e à última sexta-feira do mês.
 */
export function obterSextasQuinzenaisDoMes(
  ano: number,
  mes1a12: number
): { segundaSexta: number; ultimaSexta: number } {
  const totalDias = new Date(Date.UTC(ano, mes1a12, 0)).getUTCDate();
  const sextas: number[] = [];

  for (let d = 1; d <= totalDias; d++) {
    const dow = new Date(Date.UTC(ano, mes1a12 - 1, d)).getUTCDay();
    if (dow === 5) {
      sextas.push(d);
    }
  }

  return {
    segundaSexta: sextas[1] ?? sextas[0] ?? 14,
    ultimaSexta: sextas[sextas.length - 1] ?? totalDias,
  };
}

/**
 * Verifica se o instante informado corresponde exatamente a uma janela de disparo quinzenal:
 * 2ª sexta-feira ou última sexta-feira do mês, às 18:00 (janela 18:00–18:59 America/Sao_Paulo).
 */
export function isJanelaDisparoQuinzenal(ref: Date = new Date()): {
  deveDisparar: boolean;
  motivo: string;
  partes: PartesDataBrasilia;
  sextasDoMes: { segundaSexta: number; ultimaSexta: number };
} {
  const partes = extrairPartesBrasilia(ref);
  const sextasDoMes = obterSextasQuinzenaisDoMes(partes.ano, partes.mes);

  const isDiaAlvo =
    partes.diaSemana === 5 &&
    (partes.dia === sextasDoMes.segundaSexta ||
      partes.dia === sextasDoMes.ultimaSexta);
  const isHoraAlvo = partes.hora === 18;

  if (isDiaAlvo && isHoraAlvo) {
    const qual =
      partes.dia === sextasDoMes.segundaSexta
        ? '2ª sexta-feira do mês'
        : 'última sexta-feira do mês';
    return {
      deveDisparar: true,
      motivo: `Janela oficial atingida: ${qual} (${partes.isoDate}) às 18:00 (America/Sao_Paulo).`,
      partes,
      sextasDoMes,
    };
  }

  return {
    deveDisparar: false,
    motivo: `Fora da janela quinzenal (2ª sexta: dia ${sextasDoMes.segundaSexta}, última sexta: dia ${sextasDoMes.ultimaSexta}, às 18:00 BRT).`,
    partes,
    sextasDoMes,
  };
}

/**
 * Calcula a próxima data de disparo quinzenal (YYYY-MM-DD 18:00 America/Sao_Paulo).
 */
export function proximaDataDisparoQuinzenal(ref: Date = new Date()): string {
  const partes = extrairPartesBrasilia(ref);
  let ano = partes.ano;
  let mes = partes.mes;

  for (let i = 0; i < 3; i++) {
    const { segundaSexta, ultimaSexta } = obterSextasQuinzenaisDoMes(ano, mes);
    const candidatas = [segundaSexta, ultimaSexta];
    for (const dia of candidatas) {
      const mesmoMes = ano === partes.ano && mes === partes.mes;
      if (
        !mesmoMes ||
        dia > partes.dia ||
        (dia === partes.dia && partes.hora < 18)
      ) {
        return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}/${ano} às 18:00 (BRT)`;
      }
    }
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return '2ª e última sexta-feira às 18:00 (BRT)';
}
