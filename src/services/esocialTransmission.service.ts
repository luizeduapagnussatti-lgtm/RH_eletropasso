/**
 * Sprint 10 — eSocial gov transmission (optional).
 * Requires e-CNPJ A1 certificate in secure vault + validated production environment.
 * Not enabled until org configures ESOCIAL_TRANSMISSION_ENABLED and certificate.
 */

export interface EsocialTransmissionConfig {
  enabled: boolean;
  certificateConfigured: boolean;
  ambiente: 'PRODUCAO' | 'PRODUCAO_RESTRITA';
}

export interface TransmissionResult {
  ok: boolean;
  protocol?: string;
  message: string;
}

export const esocialTransmissionService = {
  getConfig(): EsocialTransmissionConfig {
    return {
      enabled: false,
      certificateConfigured: false,
      ambiente: 'PRODUCAO_RESTRITA',
    };
  },

  async transmitSignedXml(_signedXml: string): Promise<TransmissionResult> {
    return {
      ok: false,
      message:
        'Transmissão webservice gov não habilitada. Use o pacote ZIP (Sprint 9) para o contador assinar e transmitir com e-CNPJ.',
    };
  },
};
