import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidade e proteção de dados",
  description: "Informações sobre os dados de contato recebidos pela Prime Group Representações e Logística Ltda.",
  alternates: { canonical: "https://prime-finance-ochre.vercel.app/empresa/privacidade" },
};

export default function PrivacidadePage() {
  return (
    <main className="pg-info-page">
      <div className="pg-container">
        <span className="pg-section-label">INFORMAÇÕES LEGAIS</span>
        <h1>Privacidade e proteção de dados</h1>
        <p className="pg-info-date">Prime Group Representações e Logística Ltda. · CNPJ 42.361.401/0001-17</p>

        <h2>1. Contato e informações comerciais</h2>
        <p>
          Este site institucional apresenta a empresa e disponibiliza um endereço de e-mail para
          contato comercial. A página não possui formulário próprio de coleta de dados.
          Quando você envia um e-mail, as informações fornecidas podem ser utilizadas para
          responder à sua solicitação, avaliar demandas de transporte e manter a comunicação
          relacionada ao atendimento.
        </p>

        <h2>2. WhatsApp e atendimento com tecnologia</h2>
        <p>
          Quando um canal WhatsApp Business da empresa estiver disponível, mensagens e arquivos
          enviados poderão ser processados para atendimento e execução de solicitações,
          incluindo o uso de sistemas de automação e inteligência artificial.
          Informações sobre operações financeiras privadas são destinadas exclusivamente
          às contas autenticadas e autorizadas no sistema Prime Finance.
        </p>

        <h2>3. Compartilhamento e proteção</h2>
        <p>
          Para fornecer os serviços e responder às mensagens, podem ser utilizados provedores de
          infraestrutura, comunicação e processamento de mensagens. Os dados devem ser tratados
          apenas para finalidades relacionadas ao atendimento, à prestação dos serviços e às
          obrigações legais pertinentes. O acesso a informações financeiras no Prime Finance
          requer autenticação e controles de permissão.
        </p>

        <h2>4. Direitos dos titulares</h2>
        <p>
          Para solicitar informações, correção ou exclusão de dados pessoais, entre em contato
          pelo e-mail <a href="mailto:logistica.primegroup@gmail.com">logistica.primegroup@gmail.com</a>.
          Antes de atender a determinadas solicitações, poderá ser necessário confirmar a
          identidade do solicitante. Eventuais obrigações legais de retenção serão consideradas.
        </p>

        <h2>5. Atualizações</h2>
        <p>
          Este aviso poderá ser revisado para refletir mudanças nos serviços, ferramentas
          utilizadas ou exigências legais. Para orientações sobre remoção de dados, consulte
          também a página de <Link href="/empresa/exclusao-de-dados">exclusão de dados</Link>.
        </p>

        <p className="pg-info-date">Conteúdo institucional sujeito à revisão periódica da empresa.</p>
      </div>
    </main>
  );
}
