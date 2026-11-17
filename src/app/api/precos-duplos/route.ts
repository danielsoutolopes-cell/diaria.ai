import { NextRequest, NextResponse } from 'next/server';
import {
  obterTabelaPrecosDuplos,
  salvarTabelaPrecosDuplos,
  TABELA_OFICIAL_PADRAO,
} from '@/services/tabelaPrecosStorage';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const precos = await obterTabelaPrecosDuplos();
    return NextResponse.json({
      precos: precos || {},
      padrao: TABELA_OFICIAL_PADRAO,
    });
  } catch (err) {
    console.error('Erro ao ler tabela de preços:', err);
    return NextResponse.json({ precos: {}, padrao: TABELA_OFICIAL_PADRAO }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { precos } = body;

    if (!precos || typeof precos !== 'object') {
      return NextResponse.json({ error: 'Preços inválidos' }, { status: 400 });
    }

    const sucesso = await salvarTabelaPrecosDuplos(precos);
    return NextResponse.json({ success: sucesso });
  } catch (err) {
    console.error('Erro ao salvar preços duplos:', err);
    return NextResponse.json({ error: 'Falha interna' }, { status: 500 });
  }
}
