import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import zlib from 'zlib';
import { supabaseAdmin } from '@/lib/supabase';
import { getActiveTenantFromRequest } from '@/lib/tenant';
import { uploadToR2 } from '@/services/r2Storage';

export const dynamic = 'force-dynamic';

export interface ProjetoPdfRecord {
  id: string;
  tenantSlug: string;
  obraNome: string;
  titulo: string;
  categoria: string;
  revisao: string;
  arquivoNome: string;
  r2Url: string;
  compactadoGzip: boolean;
  tamanhoOriginalBytes: number;
  tamanhoCompactadoBytes: number;
  criadoPor: string;
  criadoEm: string;
}

async function lerProjetosTenant(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  projetos: ProjetoPdfRecord[];
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  const configs = ((data?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;
  const projetos = Array.isArray(configs.cofre_projetos_pdf)
    ? (configs.cofre_projetos_pdf as ProjetoPdfRecord[])
    : [];

  return {
    paramId: (data?.id as string | undefined) || null,
    configs,
    projetos,
  };
}

async function salvarProjetosTenant(
  tenantId: string,
  paramId: string | null,
  configs: Record<string, unknown>,
  projetos: ProjetoPdfRecord[]
) {
  const novasConfigs: Record<string, unknown> = {
    ...configs,
    cofre_projetos_pdf: projetos,
  };
  if (paramId) {
    await supabaseAdmin
      .from('parametros_sistema')
      .update({ configuracoes: novasConfigs })
      .eq('id', paramId);
  } else {
    await supabaseAdmin.from('parametros_sistema').insert({
      tenant_id: tenantId,
      configuracoes: novasConfigs,
    });
  }
}

async function baixarPdfDescompactado(
  proj: ProjetoPdfRecord
): Promise<Buffer> {
  if (proj.r2Url.startsWith('data:')) {
    const b64 = proj.r2Url.split(',')[1] || '';
    const buf = Buffer.from(b64, 'base64');
    return proj.compactadoGzip ? zlib.gunzipSync(buf) : buf;
  }
  const res = await fetch(proj.r2Url);
  if (!res.ok) {
    throw new Error('Não foi possível baixar o arquivo do armazenamento.');
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return proj.compactadoGzip ? zlib.gunzipSync(buf) : buf;
}

export async function GET(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const downloadId = searchParams.get('download');

    const [{ projetos }, resObras] = await Promise.all([
      lerProjetosTenant(activeTenant.id),
      supabaseAdmin
        .from('obras_config')
        .select('id, nome')
        .eq('tenant_id', activeTenant.id)
        .eq('ativo', true)
        .order('nome', { ascending: true }),
    ]);

    if (downloadId) {
      const proj = projetos.find((p) => p.id === downloadId);
      if (!proj) {
        return NextResponse.json(
          { error: 'Projeto não encontrado.' },
          { status: 404 }
        );
      }
      const pdfBuf = await baixarPdfDescompactado(proj);
      return new NextResponse(new Uint8Array(pdfBuf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${proj.arquivoNome}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const obras = (resObras.data || []).map((o) => String(o.nome));
    return NextResponse.json({
      success: true,
      tenant: activeTenant,
      obras,
      projetos,
    });
  } catch (err) {
    console.error('[api/projetos GET]', err);
    return NextResponse.json(
      { error: 'Erro ao carregar Cofre de Projetos.' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const contentType = req.headers.get('content-type') || '';

    // Ação JSON: enviar PDF via WhatsApp (Baileys /send-document)
    if (contentType.includes('application/json')) {
      const body = (await req.json()) as {
        action?: string;
        id?: string;
        destino?: string;
      };
      if (body.action === 'enviar-whatsapp' && body.id) {
        const { projetos } = await lerProjetosTenant(activeTenant.id);
        const proj = projetos.find((p) => p.id === body.id);
        if (!proj) {
          return NextResponse.json(
            { error: 'Projeto não encontrado.' },
            { status: 404 }
          );
        }

        const pdfBuf = await baixarPdfDescompactado(proj);
        const base64 = pdfBuf.toString('base64');
        const telLimpo = String(body.destino || '').replace(/\D/g, '');
        const phone =
          telLimpo.length >= 10
            ? telLimpo.startsWith('55')
              ? telLimpo
              : `55${telLimpo}`
            : '';

        let enviadoWhatsapp = false;
        if (phone) {
          const baileysUrl = (
            process.env.BAILEYS_SERVER_URL || 'http://127.0.0.1:3001'
          ).replace(/\/$/, '');
          try {
            const r = await fetch(`${baileysUrl}/send-document`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone,
                fileName: proj.arquivoNome,
                mimetype: 'application/pdf',
                base64,
                caption: `📐 *Projeto (${proj.categoria} • ${proj.revisao})*\n🏗️ Obra: ${proj.obraNome}\n📄 ${proj.titulo}`,
              }),
            });
            enviadoWhatsapp = r.ok;
          } catch {
            enviadoWhatsapp = false;
          }
        }

        return NextResponse.json({
          success: true,
          enviadoWhatsapp,
          fileName: proj.arquivoNome,
          message: enviadoWhatsapp
            ? `Planta "${proj.titulo}" enviada no WhatsApp (${body.destino})!`
            : 'WhatsApp offline ou número não informado — link/PDF pronto para envio manual.',
        });
      }
      return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
    }

    // Upload multipart/form-data de planta em PDF (armazenada compactada com gzip no R2)
    const formData = await req.formData();
    const file = formData.get('arquivo');
    const obraNome = String(formData.get('obraNome') || '').trim();
    const titulo = String(formData.get('titulo') || '').trim();
    const categoria = String(formData.get('categoria') || 'Arquitetura').trim();
    const revisao = String(formData.get('revisao') || 'Rev. 01').trim();

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json(
        { error: 'Selecione um arquivo PDF válido.' },
        { status: 400 }
      );
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json(
        { error: 'O Cofre de Projetos aceita apenas plantas em formato PDF.' },
        { status: 400 }
      );
    }
    if (!obraNome || !titulo) {
      return NextResponse.json(
        { error: 'Informe a Obra e o Título da planta.' },
        { status: 400 }
      );
    }

    const originalBuf = Buffer.from(await file.arrayBuffer());
    const gzipBuf = zlib.gzipSync(originalBuf, { level: 9 });
    const id = crypto.randomUUID();
    const slugObra = obraNome
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 35);
    const arquivoNome = file.name.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const r2Key = `projetos/${activeTenant.slug}/${slugObra}/${id}_${arquivoNome}.gz`;

    let r2Url = '';
    try {
      const up = await uploadToR2(gzipBuf, r2Key, 'application/gzip');
      r2Url = up.url;
    } catch {
      r2Url = `data:application/gzip;base64,${gzipBuf.toString('base64')}`;
    }

    const rawUser = req.cookies.get('diaria_user')?.value;
    const criadoPor = rawUser ? decodeURIComponent(rawUser) : 'Administrador';

    const novo: ProjetoPdfRecord = {
      id,
      tenantSlug: activeTenant.slug,
      obraNome,
      titulo,
      categoria,
      revisao,
      arquivoNome,
      r2Url,
      compactadoGzip: true,
      tamanhoOriginalBytes: originalBuf.length,
      tamanhoCompactadoBytes: gzipBuf.length,
      criadoPor,
      criadoEm: new Date().toISOString(),
    };

    const { paramId, configs, projetos } = await lerProjetosTenant(
      activeTenant.id
    );
    const atualizados = [novo, ...projetos];
    await salvarProjetosTenant(activeTenant.id, paramId, configs, atualizados);

    return NextResponse.json({
      success: true,
      projeto: novo,
      projetos: atualizados,
    });
  } catch (err) {
    console.error('[api/projetos POST]', err);
    return NextResponse.json(
      { error: 'Erro ao salvar planta no Cofre de Projetos.' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const activeTenant = getActiveTenantFromRequest(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'ID obrigatório.' }, { status: 400 });
    }
    const { paramId, configs, projetos } = await lerProjetosTenant(
      activeTenant.id
    );
    const atualizados = projetos.filter((p) => p.id !== id);
    await salvarProjetosTenant(activeTenant.id, paramId, configs, atualizados);
    return NextResponse.json({ success: true, projetos: atualizados });
  } catch {
    return NextResponse.json(
      { error: 'Erro ao remover projeto.' },
      { status: 500 }
    );
  }
}
