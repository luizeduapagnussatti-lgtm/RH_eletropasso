# Sprint 10 — Transmissão eSocial gov (opcional)

Pré-requisitos antes de habilitar transmissão direta pelo OpenHR:

1. Certificado **e-CNPJ A1** da empresa em vault seguro (Supabase secrets / HSM).
2. Ambiente **produção restrita** validado com XML S-1200 gerado pelo OpenHR.
3. Decisão de produto para substituir transmissão via contador.

Implementação atual: [`esocialTransmission.service.ts`](../src/services/esocialTransmission.service.ts) retorna `enabled: false`.

Até lá, use **Pacote eSocial (ZIP)** na página Pré-folha — contador assina e transmite com e-CNPJ próprio.
