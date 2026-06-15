import { dataProvider } from './dataProvider';

// Camada unica que as telas usam. Hoje aponta para o Supabase.
// Se um dia trocar o backend, so este arquivo muda - as telas nao.
export const Titulos = {
  list: (opts) => dataProvider.listarTitulos(opts),
    salvarManual: (id, campos) => dataProvider.salvarEdicaoManual(id, campos),
      importar: (registro) => dataProvider.importarTitulo(registro),
        darBaixa: (id) => dataProvider.darBaixa(id),
        };
        
