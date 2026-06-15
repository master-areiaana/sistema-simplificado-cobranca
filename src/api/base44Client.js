import { supabase } from './supabaseClient';

// Campos manuais que a importacao NUNCA pode sobrescrever:
const CAMPOS_MANUAIS = [
    'current_status','current_motive','current_contact_type','promise_date',
    'last_contact_date','last_note','action_to_do','description','contact_count',
    'protest_requested_by','workflow_status','updated_by',
  ];

function makeEntity(tabela) {
    return {
          async list(orderBy, limit = 1000) {
                  const { data, error } = await supabase.from(tabela).select('*').limit(limit);
                  if (error) throw error;
                  return data;
          },
          async filter(criterios = {}, orderBy, limit = 1000) {
                  let q = supabase.from(tabela).select('*').limit(limit);
                  for (const [campo, valor] of Object.entries(criterios)) q = q.eq(campo, valor);
                  const { data, error } = await q;
                  if (error) throw error;
                  return data;
          },
          async create(registro) {
                  const { data, error } = await supabase.from(tabela).insert(registro).select();
                  if (error) throw error;
                  return data?.[0];
          },
          async update(id, campos) {
                  const { data, error } = await supabase.from(tabela)
                    .update({ ...campos, updated_at: new Date().toISOString() })
                    .eq('id', id).select();
                  if (error) throw error;
                  return data?.[0];
          },
          subscribe(callback) {
                  const canal = supabase.channel('rt-' + tabela)
                    .on('postgres_changes', { event: '*', schema: 'public', table: tabela }, callback)
                    .subscribe();
                  return () => supabase.removeChannel(canal);
          },
    };
}

export const base44 = {
    entities: {
          Titulo: makeEntity('titles'),
          ChargeEvent: makeEntity('charge_events'),
    },
};

export { CAMPOS_MANUAIS };
