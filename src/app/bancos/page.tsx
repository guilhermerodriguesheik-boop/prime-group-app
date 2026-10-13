import { Header, SectionTitle } from "@/components/ui";
import { BankDashboard } from "@/components/banks/bank-dashboard";

export const metadata={title:"Bancos e Open Finance | Prime Finance"};
export default function Page(){
  return <>
    <Header title="Bancos e Open Finance" subtitle="Itaú Empresas · Bradesco Empresas · Inter Pessoal, sem misturar seu caixa."/>
    <SectionTitle title="Conexões bancárias autorizadas" hint="Saldos e extratos são importados em leitura; conciliação exige confirmação."/>
    <BankDashboard/>
    <div className="notice" style={{marginTop:18}}>
      Acesso bancário por consentimento: nunca compartilhe senhas com o Prime Finance.
      Conectar e revogar permissões depende dos canais do provedor e das instituições.
      Pausar a sincronização neste app não revoga o consentimento no banco.
    </div>
  </>;
}