import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Solicitar exclusão de dados",
  description: "Como solicitar exclusão ou esclarecimentos sobre seus dados pessoais à Prime Group.",
  alternates: { canonical: "https://prime-finance-ochre.vercel.app/empresa/exclusao-de-dados" },
};

export default function ExclusaoDadosPage() {
  return (
    <main className="pg-info-page">
      <div className="pg-container">
        <span className="pg-section-label">PROTEÇÃO DE DADOS</span>
        <h1>Solicitar exclusão de dados</h1>
        <p>
          Você pode solicitar informações sobre o tratamento de dados pessoais e, quando
          aplicável, a correção ou exclusão desses dados mantidos pela Prime Group
          Representações e Logística Ltda.
        </p>

        <h2>Como solicitar</h2>
        <ul>
          <li>Escreva para <a href="mailto:logistica.primegroup@gmail.com?subject=Solicita%C3%A7%C3%A3o%20sobre%20dados%20pessoais">logistica.primegroup@gmail.com</a> com o assunto “Solicitação sobre dados pessoais”.</li>
          <li>Descreva os dados ou serviços relacionados à solicitação, como atendimento comercial ou comunicações recebidas.</li>
          <li>Não envie senhas, códigos de acesso ou documentos pessoais sensíveis por mensagem aberta. Caso seja necessária confirmação de identidade, a empresa deverá orientar um meio adequado.</li>
        </ul>
        <h2>Análise e resposta</h2>
        <p>
          A solicitação será analisada considerando a confirmação da identidade do titular,
          as finalidades do tratamento e eventuais obrigações legais de conservação.
          O desligamento de um número do WhatsApp do Prime Finance não equivale,
          por si só, à exclusão de todos os registros anteriores.
        </p>
        <p>
          Para conhecer melhor como as informações podem ser tratadas, consulte a
          {" "}<Link href="/empresa/privacidade">página de privacidade</Link>.
        </p>
      </div>
    </main>
  );
}
