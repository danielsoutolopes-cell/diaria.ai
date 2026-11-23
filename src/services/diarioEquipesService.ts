import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase';
import {
  normalizarTextoBusca,
  parsearApelidosLista,
  type EmpreiteiroDiarioRecord,
  type FuncionarioEmpreiteiroRecord,
} from '@/lib/diarioObraRelatorio';

interface EmpreiteiroDbRow {
  id: string;
  tenant_id: string;
  nome: string;
  apelidos: string[] | null;
  documento: string | null;
  telefone: string | null;
  chave_pix?: string | null;
  etapa_padrao: string | null;
  ativo: boolean;
  created_at?: string;
}

interface FuncionarioEmpDbRow {
  id: string;
  tenant_id: string;
  empreiteiro_id: string | null;
  nome_oficial: string;
  apelidos: string[] | null;
  documento: string | null;
  funcao: string | null;
  ativo: boolean;
  created_at?: string;
}

interface EquipesFallbackPayload {
  empreiteiros: EmpreiteiroDiarioRecord[];
  funcionarios: FuncionarioEmpreiteiroRecord[];
}

function isTabelaAusenteError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    msg.includes('empreiteiros_diario') ||
    msg.includes('funcionarios_empreiteiro') ||
    msg.includes('does not exist') ||
    msg.includes('schema cache')
  );
}

async function lerFallbackTenant(tenantId: string): Promise<{
  paramId: string | null;
  configs: Record<string, unknown>;
  payload: EquipesFallbackPayload;
}> {
  const { data } = await supabaseAdmin
    .from('parametros_sistema')
    .select('id, configuracoes')
    .eq('tenant_id', tenantId)
    .limit(1)
    .maybeSingle();

  const configs = ((data?.configuracoes as Record<string, unknown> | null) ||
    {}) as Record<string, unknown>;
  const raw = (configs.diario_equipes_v20 || {}) as Partial<EquipesFallbackPayload>;

  return {
    paramId: (data?.id as string | undefined) || null,
    configs,
    payload: {
      empreiteiros: Array.isArray(raw.empreiteiros) ? raw.empreiteiros : [],
      funcionarios: Array.isArray(raw.funcionarios) ? raw.funcionarios : [],
    },
  };
}

async function salvarFallbackTenant(
  tenantId: string,
  paramId: string | null,
  configs: Record<string, unknown>,
  payload: EquipesFallbackPayload
): Promise<void> {
  const novasConfigs = { ...configs, diario_equipes_v20: payload };
  if (paramId) {
    await supabaseAdmin
      .from('parametros_sistema')
      .update({ configuracoes: novasConfigs })
      .eq('id', paramId)
      .eq('tenant_id', tenantId);
  } else {
    await supabaseAdmin.from('parametros_sistema').insert({
      tenant_id: tenantId,
      configuracoes: novasConfigs,
    });
  }
}

function mapEmpreiteiroRow(row: EmpreiteiroDbRow): EmpreiteiroDiarioRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    nome: row.nome,
    apelidos: Array.isArray(row.apelidos) ? row.apelidos : [],
    documento: row.documento || null,
    telefone: row.telefone || null,
    chavePix: row.chave_pix || null,
    etapaPadrao: row.etapa_padrao || null,
    ativo: row.ativo !== false,
    createdAt: row.created_at,
  };
}

function enriquecerFuncionariosComEmpreiteiro(
  funcionarios: FuncionarioEmpreiteiroRecord[],
  empreiteiros: EmpreiteiroDiarioRecord[]
): FuncionarioEmpreiteiroRecord[] {
  const mapaEmp = new Map<string, string>();
  for (const e of empreiteiros) {
    mapaEmp.set(e.id, e.nome);
  }
  return funcionarios.map((f) => ({
    ...f,
    empreiteiroNome: f.empreiteiroId ? mapaEmp.get(f.empreiteiroId) || null : null,
  }));
}

export async function listarEquipesDiarioTenant(tenantId: string): Promise<{
  empreiteiros: EmpreiteiroDiarioRecord[];
  funcionarios: FuncionarioEmpreiteiroRecord[];
  usandoFallback: boolean;
}> {
  const [resEmp, resFunc] = await Promise.all([
    supabaseAdmin
      .from('empreiteiros_diario')
      .select(
        'id, tenant_id, nome, apelidos, documento, telefone, chave_pix, etapa_padrao, ativo, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .order('nome', { ascending: true }),
    supabaseAdmin
      .from('funcionarios_empreiteiro')
      .select(
        'id, tenant_id, empreiteiro_id, nome_oficial, apelidos, documento, funcao, ativo, created_at'
      )
      .eq('tenant_id', tenantId)
      .eq('ativo', true)
      .order('nome_oficial', { ascending: true }),
  ]);

  if (isTabelaAusenteError(resEmp.error) || isTabelaAusenteError(resFunc.error)) {
    const { payload } = await lerFallbackTenant(tenantId);
    const empreiteirosAtivos = payload.empreiteiros
      .filter((e) => e.tenantId === tenantId && e.ativo !== false)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const funcionariosAtivos = payload.funcionarios
      .filter((f) => f.tenantId === tenantId && f.ativo !== false)
      .sort((a, b) => a.nomeOficial.localeCompare(b.nomeOficial, 'pt-BR'));

    return {
      empreiteiros: empreiteirosAtivos,
      funcionarios: enriquecerFuncionariosComEmpreiteiro(
        funcionariosAtivos,
        empreiteirosAtivos
      ),
      usandoFallback: true,
    };
  }

  const empreiteiros = (
    (resEmp.data as unknown as EmpreiteiroDbRow[] | null) || []
  ).map(mapEmpreiteiroRow);

  const funcionariosBase: FuncionarioEmpreiteiroRecord[] = (
    (resFunc.data as unknown as FuncionarioEmpDbRow[] | null) || []
  ).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    empreiteiroId: row.empreiteiro_id || null,
    nomeOficial: row.nome_oficial,
    apelidos: Array.isArray(row.apelidos) ? row.apelidos : [],
    documento: row.documento || null,
    funcao: row.funcao || null,
    ativo: row.ativo !== false,
    createdAt: row.created_at,
  }));

  return {
    empreiteiros,
    funcionarios: enriquecerFuncionariosComEmpreiteiro(
      funcionariosBase,
      empreiteiros
    ),
    usandoFallback: false,
  };
}

export interface CriarEmpreiteiroInput {
  nome: string;
  apelidos?: string | string[];
  documento?: string | null;
  telefone?: string | null;
  chavePix?: string | null;
  etapaPadrao?: string | null;
}

export async function criarEmpreiteiroDiario(
  tenantId: string,
  input: CriarEmpreiteiroInput
): Promise<EmpreiteiroDiarioRecord> {
  const nomeLimpo = input.nome.trim();
  const apelidos = parsearApelidosLista(input.apelidos);
  const documento = input.documento?.trim() || null;
  const telefone = input.telefone?.trim() || null;
  const chavePix = input.chavePix?.trim() || null;
  const etapaPadrao = input.etapaPadrao?.trim() || null;

  const { data, error } = await supabaseAdmin
    .from('empreiteiros_diario')
    .insert({
      tenant_id: tenantId,
      nome: nomeLimpo,
      apelidos,
      documento,
      telefone,
      chave_pix: chavePix,
      etapa_padrao: etapaPadrao,
      ativo: true,
    })
    .select(
      'id, tenant_id, nome, apelidos, documento, telefone, chave_pix, etapa_padrao, ativo, created_at'
    )
    .single();

  if (!error && data) {
    return mapEmpreiteiroRow(data as unknown as EmpreiteiroDbRow);
  }

  if (isTabelaAusenteError(error)) {
    const { paramId, configs, payload } = await lerFallbackTenant(tenantId);
    const existente = payload.empreiteiros.find(
      (e) =>
        e.tenantId === tenantId &&
        e.ativo !== false &&
        normalizarTextoBusca(e.nome) === normalizarTextoBusca(nomeLimpo)
    );
    if (existente) {
      existente.apelidos = parsearApelidosLista([
        ...existente.apelidos,
        ...apelidos,
      ]);
      if (documento) existente.documento = documento;
      if (telefone) existente.telefone = telefone;
      if (chavePix) existente.chavePix = chavePix;
      if (etapaPadrao) existente.etapaPadrao = etapaPadrao;
      await salvarFallbackTenant(tenantId, paramId, configs, payload);
      return existente;
    }

    const novo: EmpreiteiroDiarioRecord = {
      id: crypto.randomUUID(),
      tenantId,
      nome: nomeLimpo,
      apelidos,
      documento,
      telefone,
      chavePix,
      etapaPadrao,
      ativo: true,
      createdAt: new Date().toISOString(),
    };
    payload.empreiteiros.push(novo);
    await salvarFallbackTenant(tenantId, paramId, configs, payload);
    return novo;
  }

  // Conflito de nome já existente: retorna o existente atualizado
  if (error?.code === '23505') {
    const lista = await listarEquipesDiarioTenant(tenantId);
    const encontrado = lista.empreiteiros.find(
      (e) => normalizarTextoBusca(e.nome) === normalizarTextoBusca(nomeLimpo)
    );
    if (encontrado) return encontrado;
  }

  throw new Error(error?.message || 'Erro ao cadastrar empreiteiro.');
}

export async function atualizarEmpreiteiroDiario(
  tenantId: string,
  id: string,
  input: Partial<CriarEmpreiteiroInput>
): Promise<EmpreiteiroDiarioRecord | null> {
  const updates: Record<string, string | string[] | null> = {
    updated_at: new Date().toISOString(),
  };
  if (input.nome !== undefined) updates.nome = input.nome.trim();
  if (input.apelidos !== undefined) {
    updates.apelidos = parsearApelidosLista(input.apelidos);
  }
  if (input.documento !== undefined) {
    updates.documento = input.documento?.trim() || null;
  }
  if (input.telefone !== undefined) {
    updates.telefone = input.telefone?.trim() || null;
  }
  if (input.chavePix !== undefined) {
    updates.chave_pix = input.chavePix?.trim() || null;
  }
  if (input.etapaPadrao !== undefined) {
    updates.etapa_padrao = input.etapaPadrao?.trim() || null;
  }

  const { data, error } = await supabaseAdmin
    .from('empreiteiros_diario')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(
      'id, tenant_id, nome, apelidos, documento, telefone, chave_pix, etapa_padrao, ativo, created_at'
    )
    .maybeSingle();

  if (!error && data) {
    return mapEmpreiteiroRow(data as unknown as EmpreiteiroDbRow);
  }

  if (isTabelaAusenteError(error)) {
    const { paramId, configs, payload } = await lerFallbackTenant(tenantId);
    const item = payload.empreiteiros.find(
      (e) => e.id === id && e.tenantId === tenantId
    );
    if (!item) return null;
    if (input.nome !== undefined) item.nome = input.nome.trim();
    if (input.apelidos !== undefined) {
      item.apelidos = parsearApelidosLista(input.apelidos);
    }
    if (input.documento !== undefined) {
      item.documento = input.documento?.trim() || null;
    }
    if (input.telefone !== undefined) {
      item.telefone = input.telefone?.trim() || null;
    }
    if (input.chavePix !== undefined) {
      item.chavePix = input.chavePix?.trim() || null;
    }
    if (input.etapaPadrao !== undefined) {
      item.etapaPadrao = input.etapaPadrao?.trim() || null;
    }
    await salvarFallbackTenant(tenantId, paramId, configs, payload);
    return item;
  }

  return null;
}

export async function desativarEmpreiteiroDiario(
  tenantId: string,
  id: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('empreiteiros_diario')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (!error) return true;

  if (isTabelaAusenteError(error)) {
    const { paramId, configs, payload } = await lerFallbackTenant(tenantId);
    const item = payload.empreiteiros.find(
      (e) => e.id === id && e.tenantId === tenantId
    );
    if (!item) return false;
    item.ativo = false;
    await salvarFallbackTenant(tenantId, paramId, configs, payload);
    return true;
  }

  return false;
}

export interface CriarFuncionarioEmpreiteiroInput {
  empreiteiroId?: string | null;
  nomeOficial: string;
  apelidos?: string | string[];
  documento?: string | null;
  funcao?: string | null;
}

export async function criarFuncionarioEmpreiteiro(
  tenantId: string,
  input: CriarFuncionarioEmpreiteiroInput
): Promise<FuncionarioEmpreiteiroRecord> {
  const nomeOficial = input.nomeOficial.trim();
  const apelidos = parsearApelidosLista(input.apelidos);
  const documento = input.documento?.trim() || null;
  const funcao = input.funcao?.trim() || null;
  const empreiteiroId = input.empreiteiroId?.trim() || null;

  const { data, error } = await supabaseAdmin
    .from('funcionarios_empreiteiro')
    .insert({
      tenant_id: tenantId,
      empreiteiro_id: empreiteiroId,
      nome_oficial: nomeOficial,
      apelidos,
      documento,
      funcao,
      ativo: true,
    })
    .select(
      'id, tenant_id, empreiteiro_id, nome_oficial, apelidos, documento, funcao, ativo, created_at'
    )
    .single();

  if (!error && data) {
    const row = data as unknown as FuncionarioEmpDbRow;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      empreiteiroId: row.empreiteiro_id || null,
      nomeOficial: row.nome_oficial,
      apelidos: Array.isArray(row.apelidos) ? row.apelidos : [],
      documento: row.documento || null,
      funcao: row.funcao || null,
      ativo: row.ativo !== false,
      createdAt: row.created_at,
    };
  }

  if (isTabelaAusenteError(error)) {
    const { paramId, configs, payload } = await lerFallbackTenant(tenantId);
    const existente = payload.funcionarios.find(
      (f) =>
        f.tenantId === tenantId &&
        f.ativo !== false &&
        (f.empreiteiroId || null) === empreiteiroId &&
        normalizarTextoBusca(f.nomeOficial) === normalizarTextoBusca(nomeOficial)
    );
    if (existente) {
      existente.apelidos = parsearApelidosLista([
        ...existente.apelidos,
        ...apelidos,
      ]);
      if (documento) existente.documento = documento;
      if (funcao) existente.funcao = funcao;
      await salvarFallbackTenant(tenantId, paramId, configs, payload);
      return existente;
    }

    const novo: FuncionarioEmpreiteiroRecord = {
      id: crypto.randomUUID(),
      tenantId,
      empreiteiroId,
      nomeOficial,
      apelidos,
      documento,
      funcao,
      ativo: true,
      createdAt: new Date().toISOString(),
    };
    payload.funcionarios.push(novo);
    await salvarFallbackTenant(tenantId, paramId, configs, payload);
    return novo;
  }

  if (error?.code === '23505') {
    const lista = await listarEquipesDiarioTenant(tenantId);
    const encontrado = lista.funcionarios.find(
      (f) =>
        (f.empreiteiroId || null) === empreiteiroId &&
        normalizarTextoBusca(f.nomeOficial) === normalizarTextoBusca(nomeOficial)
    );
    if (encontrado) return encontrado;
  }

  throw new Error(error?.message || 'Erro ao cadastrar funcionário.');
}

export async function atualizarFuncionarioEmpreiteiro(
  tenantId: string,
  id: string,
  input: Partial<CriarFuncionarioEmpreiteiroInput>
): Promise<FuncionarioEmpreiteiroRecord | null> {
  const updates: Record<string, string | string[] | null> = {
    updated_at: new Date().toISOString(),
  };
  if (input.empreiteiroId !== undefined) {
    updates.empreiteiro_id = input.empreiteiroId?.trim() || null;
  }
  if (input.nomeOficial !== undefined) {
    updates.nome_oficial = input.nomeOficial.trim();
  }
  if (input.apelidos !== undefined) {
    updates.apelidos = parsearApelidosLista(input.apelidos);
  }
  if (input.documento !== undefined) {
    updates.documento = input.documento?.trim() || null;
  }
  if (input.funcao !== undefined) {
    updates.funcao = input.funcao?.trim() || null;
  }

  const { data, error } = await supabaseAdmin
    .from('funcionarios_empreiteiro')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(
      'id, tenant_id, empreiteiro_id, nome_oficial, apelidos, documento, funcao, ativo, created_at'
    )
    .maybeSingle();

  if (!error && data) {
    const row = data as unknown as FuncionarioEmpDbRow;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      empreiteiroId: row.empreiteiro_id || null,
      nomeOficial: row.nome_oficial,
      apelidos: Array.isArray(row.apelidos) ? row.apelidos : [],
      documento: row.documento || null,
      funcao: row.funcao || null,
      ativo: row.ativo !== false,
      createdAt: row.created_at,
    };
  }

  if (isTabelaAusenteError(error)) {
    const { paramId, configs, payload } = await lerFallbackTenant(tenantId);
    const item = payload.funcionarios.find(
      (f) => f.id === id && f.tenantId === tenantId
    );
    if (!item) return null;
    if (input.empreiteiroId !== undefined) {
      item.empreiteiroId = input.empreiteiroId?.trim() || null;
    }
    if (input.nomeOficial !== undefined) {
      item.nomeOficial = input.nomeOficial.trim();
    }
    if (input.apelidos !== undefined) {
      item.apelidos = parsearApelidosLista(input.apelidos);
    }
    if (input.documento !== undefined) {
      item.documento = input.documento?.trim() || null;
    }
    if (input.funcao !== undefined) {
      item.funcao = input.funcao?.trim() || null;
    }
    await salvarFallbackTenant(tenantId, paramId, configs, payload);
    return item;
  }

  return null;
}

export async function desativarFuncionarioEmpreiteiro(
  tenantId: string,
  id: string
): Promise<boolean> {
  const { error } = await supabaseAdmin
    .from('funcionarios_empreiteiro')
    .update({ ativo: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenantId);

  if (!error) return true;

  if (isTabelaAusenteError(error)) {
    const { paramId, configs, payload } = await lerFallbackTenant(tenantId);
    const item = payload.funcionarios.find(
      (f) => f.id === id && f.tenantId === tenantId
    );
    if (!item) return false;
    item.ativo = false;
    await salvarFallbackTenant(tenantId, paramId, configs, payload);
    return true;
  }

  return false;
}
