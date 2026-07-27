import { PayrollExportV1 } from './payrollConsolidation.service';

/** eSocial S-1.3 evtRemun draft — not signed, for accountant import. */
export const ESOCIAL_LAYOUT_VERSION = 'S-1.3';

export interface XmlValidationResult {
  ok: boolean;
  errors: string[];
  xml: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function padCompetencia(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function buildS1200XmlDraft(exportData: PayrollExportV1): XmlValidationResult {
  const errors: string[] = [];
  if (!exportData.empregador.cnpj) errors.push('CNPJ empregador obrigatório');
  if (!exportData.colaboradores.length) errors.push('Nenhum colaborador na pré-folha');

  for (const c of exportData.colaboradores) {
    if (!c.cpf) errors.push(`CPF ausente: ${c.nome || c.profileId}`);
    if (!c.pis) errors.push(`PIS ausente: ${c.nome || c.profileId}`);
  }

  const ideEmpregador = `
    <ideEmpregador>
      <tpInsc>1</tpInsc>
      <nrInsc>${esc(exportData.empregador.cnpj.slice(0, 8))}</nrInsc>
    </ideEmpregador>`;

  const dmDevBlocks = exportData.colaboradores.map(c => {
    const itens = c.rubricas
      .map(
        r => `
        <itensRemun>
          <codRubr>${esc(r.codigo)}</codRubr>
          <qtdRubr>${r.quantidadeHoras.toFixed(2)}</qtdRubr>
        </itensRemun>`
      )
      .join('');

    return `
    <dmDev>
      <cpfTrab>${esc(c.cpf)}</cpfTrab>
      <nisTrab>${esc(c.pis)}</nisTrab>
      <infoPerApur>
        <ideEstabLot>
          <remunPerApur>${itens}
          </remunPerApur>
        </ideEstabLot>
      </infoPerApur>
    </dmDev>`;
  }).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtRemun/${ESOCIAL_LAYOUT_VERSION}">
  <evtRemun Id="OpenHR-${exportData.competencia.periodId}">
    ${ideEmpregador}
    <ideEvento>
      <tpAmb>${exportData.empregador.ambiente === 'PRODUCAO' ? '1' : '2'}</tpAmb>
      <procEmi>1</procEmi>
      <verProc>OpenHR-1.0</verProc>
    </ideEvento>
    <ideTrabalhador/>
    <infoComplCont/>
    <infoMV/>
    <infoInterm/>
    <infoCompl/>
    <infoPerApur>
      <idePeriodo>
        <perApur>${padCompetencia(exportData.competencia.year, exportData.competencia.month)}</perApur>
      </idePeriodo>
      ${dmDevBlocks}
    </infoPerApur>
  </evtRemun>
</eSocial>`;

  return { ok: errors.length === 0, errors, xml };
}

export const esocialXmlService = {
  buildS1200XmlDraft,
};
