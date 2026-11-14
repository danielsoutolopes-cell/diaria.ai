import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { uploadToR2 } from '@/services/r2Storage';
import { aplicarDateStamp } from '@/services/imageStamp';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const nomeObra = (formData.get('nomeObra') as string) || 'Obra Geral';
    const obraId = (formData.get('obraId') as string) || null;
    const etapaObra = (formData.get('etapaObra') as string) || 'REGISTRO GERAL';
    const descricao = (formData.get('descricao') as string) || null;
    const autorNome = (formData.get('autorNome') as string) || 'Encarregado';
    const autorTelefone = (formData.get('autorTelefone') as string) || null;
    const latStr = formData.get('latitude') as string | null;
    const lngStr = formData.get('longitude') as string | null;
    const climaInformado = (formData.get('clima') as string) || null;

    if (!file) {
      return NextResponse.json(
        { error: 'Nenhum arquivo de imagem enviado' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const originalBuffer = Buffer.from(arrayBuffer);

    // 1. Calcula hash SHA-256 para comprovação jurídica de autenticidade
    const sha256Hash = crypto.createHash('sha256').update(originalBuffer).digest('hex');

    // 2. Coordenadas se informadas
    const coordenadas =
      latStr && lngStr
        ? { lat: parseFloat(latStr), lng: parseFloat(lngStr) }
        : null;

    // 3. Aplica o Date Stamp indelével via Sharp
    const bufferEstampado = await aplicarDateStamp(originalBuffer, {
      nomeObra,
      autorNome,
      clima: climaInformado,
      coordenadas,
      etapa: etapaObra,
    });

    const timestamp = Date.now();
    const randomSuffix = crypto.randomUUID().slice(0, 8);
    const keyOriginal = `obras/originais/${timestamp}-${randomSuffix}.jpg`;
    const keyEstampada = `obras/estampadas/${timestamp}-${randomSuffix}-stamped.jpg`;

    // 4. Salva original e estampada no Cloudflare R2
    const urlOriginal = await uploadToR2(originalBuffer, keyOriginal, 'image/jpeg');
    const urlEstampada = await uploadToR2(bufferEstampado, keyEstampada, 'image/jpeg');

    // 5. Registra na tabela obras_fotos no Supabase
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .limit(1)
      .single();

    const tenantId = tenantData?.id || '00000000-0000-0000-0000-000000000001';

    const { data: fotoInserida, error: dbError } = await supabaseAdmin
      .from('obras_fotos')
      .insert({
        tenant_id: tenantId,
        obra_id: obraId,
        autor_telefone: autorTelefone,
        autor_nome: autorNome,
        url_original: urlOriginal,
        url_estampada: urlEstampada,
        descricao,
        etapa_obra: etapaObra,
        latitude: coordenadas?.lat || null,
        longitude: coordenadas?.lng || null,
        clima_resumo: climaInformado,
        sha256_hash: sha256Hash,
        data_foto: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      console.error('Erro ao salvar no Supabase obras_fotos:', dbError);
    }

    return NextResponse.json({
      success: true,
      urlEstampada,
      urlOriginal,
      sha256: sha256Hash,
      foto: fotoInserida,
    });
  } catch (error) {
    console.error('Erro ao processar foto com date stamp:', error);
    return NextResponse.json(
      { error: 'Falha interna ao processar foto com date stamp' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const obraId = searchParams.get('obraId');

    let query = supabaseAdmin
      .from('obras_fotos')
      .select('*')
      .order('created_at', { ascending: false });

    if (obraId) {
      query = query.eq('obra_id', obraId);
    }

    const { data, error } = await query.limit(50);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ fotos: data || [] });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Erro ao listar fotos de obras' }, { status: 500 });
  }
}

