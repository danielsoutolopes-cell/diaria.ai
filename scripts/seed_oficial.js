const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const conf = {};
env.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const k = parts[0].trim();
    const v = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    conf[k] = v;
  }
});

const s = createClient(conf.NEXT_PUBLIC_SUPABASE_URL, conf.SUPABASE_SERVICE_ROLE_KEY);

const data = [
  { nome_trabalhador: 'EDMILSON - PEU', valor_diaria: 250, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 250, chave_pix: 'pix.edmilson@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'GILVAN - GIL', valor_diaria: 250, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 250, chave_pix: 'pix.gilvan@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'MATEUS', valor_diaria: 200, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 200, chave_pix: 'pix.mateus@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'MANOEL', valor_diaria: 230, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 230, chave_pix: 'pix.manoel@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'IGOR', valor_diaria: 180, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 180, chave_pix: 'pix.igor@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'DANIEL', valor_diaria: 180, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 180, chave_pix: 'pix.daniel@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'IAN', valor_diaria: 180, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 180, chave_pix: 'pix.ian@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'ZÉ BAIANO', valor_diaria: 180, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 180, chave_pix: 'pix.zebaiano@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'ZÉ NITO', valor_diaria: 250, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 250, chave_pix: 'pix.zenito@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'BETO - JOSE ROBERTO', valor_diaria: 300, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 300, chave_pix: 'pix.beto@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'WENDER', valor_diaria: 180, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 180, chave_pix: 'pix.wender@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'WESLEI', valor_diaria: 150, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 150, chave_pix: 'pix.weslei@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'WANDERSON VERISSIMO', valor_diaria: 220, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 220, chave_pix: 'pix.wanderson@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'SAMARINO', valor_diaria: 200, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 200, chave_pix: 'pix.samarino@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'ALEX DINHO', valor_diaria: 300, regime_remuneracao: 'DIARISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 300, chave_pix: 'pix.alexdinho@diaria.ai', funcao: 'OPERACIONAL', ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' },
  { nome_trabalhador: 'DIEGO', valor_diaria: 0, regime_remuneracao: 'MENSALISTA', ciclo_pagamento: 'SEMANAL', valor_base_contratual: 8700, chave_pix: 'pix.diego@diaria.ai', funcao: 'ENCARREGADO', is_encarregado: true, ativo: true, tenant_id: '00000000-0000-0000-0000-000000000001' }
];

async function run() {
  console.log('Iniciando sincronização dos 16 colaboradores...');
  for (const item of data) {
    const { data: existing } = await s
      .from('funcionarios_obra')
      .select('id')
      .eq('nome_trabalhador', item.nome_trabalhador)
      .maybeSingle();

    if (existing && existing.id) {
      const { error } = await s
        .from('funcionarios_obra')
        .update(item)
        .eq('id', existing.id);
      if (error) console.error('Erro update em', item.nome_trabalhador, ':', error.message);
      else console.log('Atualizado:', item.nome_trabalhador);
    } else {
      const { error } = await s
        .from('funcionarios_obra')
        .insert(item);
      if (error) console.error('Erro insert em', item.nome_trabalhador, ':', error.message);
      else console.log('Criado:', item.nome_trabalhador);
    }
  }
}
run();
