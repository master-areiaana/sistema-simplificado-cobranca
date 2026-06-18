import { base44 } from './base44Client';

export const Titulos = {
  list: async ({ limite = 1000, orderBy = '-updated_date' } = {}) =>
    base44.entities.Titulo.list(orderBy, limite),
  filter: async (criterios = {}, orderBy = '-updated_date', limite = 1000) =>
    base44.entities.Titulo.filter(criterios, orderBy, limite),
  salvarManual: async (id, campos) =>
    base44.entities.Titulo.update(id, campos),
  importar: async (registro) =>
    base44.entities.Titulo.create(registro),
  darBaixa: async (id) =>
    base44.entities.Titulo.update(id, {
      active: false,
      current_status: 'Baixado',
      workflow_status: 'baixado_importacao',
      current_motive: 'Baixa manual pelo sistema',
    }),
};

export const ChargeEvents = {
  list: async (orderBy = '-created_date', limite = 1000) =>
    base44.entities.ChargeEvent.list(orderBy, limite),
  create: async (registro) =>
    base44.entities.ChargeEvent.create(registro),
};
