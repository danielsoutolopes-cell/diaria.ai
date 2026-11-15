import { NextRequest, NextResponse } from 'next/server';
import { obterApelidosSistema, salvarApelidosSistema } from '@/services/apelidosStorage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apelidos = await obterApelidosSistema();
    return NextResponse.json({ success: true, apelidos });
  } catch (err) {
    console.error('Erro na rota GET /api/apelidos:', err);
    return NextResponse.json({ success: false, apelidos: { obras: {}, funcionarios: {} } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tipo, id, apelidos } = body;
    // tipo: 'OBRA' | 'FUNCIONARIO'
    // id: string (obraId ou funcionarioId)
    // apelidos: string[]

    if (!tipo || !id || !Array.isArray(apelidos)) {
      return NextResponse.json({ error: 'Parâmetros tipo, id e apelidos[] são obrigatórios' }, { status: 400 });
    }

    const mapaAtual = await obterApelidosSistema();
    const apelidosLimpos = apelidos.map((a: string) => String(a).trim()).filter(Boolean);

    if (tipo === 'OBRA') {
      mapaAtual.obras[id] = apelidosLimpos;
    } else if (tipo === 'FUNCIONARIO') {
      mapaAtual.funcionarios[id] = apelidosLimpos;
    }

    await salvarApelidosSistema(mapaAtual);

    return NextResponse.json({
      success: true,
      message: 'Apelidos salvos com sucesso!',
      apelidos: mapaAtual,
    });
  } catch (err) {
    console.error('Erro na rota POST /api/apelidos:', err);
    return NextResponse.json({ error: 'Falha ao salvar apelidos' }, { status: 500 });
  }
}
