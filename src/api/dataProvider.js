import { supabase } from './supabaseClient';

const CAMPOS_MANUAIS_PROTEGIDOS = [
    'current_status', 'current_motive', 'current_contact_type',
    'promise_date', 'last_contact_date', 'last_note', 'action_to_do',
    'description', 'contact_count', 'protest_requested_by',
    'workflow_status', 'updated_by',
  ];

const CAMPOS_DA_ORIGEM = [
    'client_name', 'value', 'due_date', 'balance', 'source', 'title_number',
  ];

export const dataProvider = {
    async listarTitulos({ limite = 100, offset = 0 } = {}) {
          const { data, error } = await supabase
                  .from('titles').select('*').range(offset, offset + limite - 1);
          if (error) throw error;
          return data;
    },

        async salvarEdicaoManual(id, campos) {
          const { data, error } = await supabase
                  .from('titles').update({ ...campos, updated_at: new Date().toISOString() })
                  .eq('id', id).select();
          if (error) throw error;
          return data;
    },

        async importarTitulo(registro) {
          const apenasOrigem = {};
          for (const c of CAMPOS_DA_ORIGEM) {
                  if (registro[c] !== undefined) apenasOrigem[c] = registro[c];
          }
          const { data, error } = await supabase
                  .from('titles')
                  .upsert(apenasOrigem, { onConflict: 'title_number', ignoreDuplicates: false })
                  .select();
          if (error) throw error;
          return data;
    },

        async darBaixa(id) {
          const { data, error } = await supabase
                  .from('titles').update({ workflow_status: 'baixado' }).eq('id', id).select();
          if (error) throw error;
          return data;
    },
};

export { CAMPOS_MANUAIS_PROTEGIDOS, CAMPOS_DA_ORIGEM };
