import { Header, SectionTitle } from "@/components/ui";
import { WhatsAppLinkPanel } from "@/components/whatsapp/link-panel";

export default function Page() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "a definir";
  const metaReady = Boolean(
    process.env.META_WHATSAPP_APP_SECRET &&
    process.env.META_WHATSAPP_ACCESS_TOKEN &&
    process.env.META_WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    process.env.WHATSAPP_INGRESS_SECRET,
  );

  const items = [
    {
      name: "Supabase",
      description: "PostgreSQL, autenticação, RLS e arquivos privados",
      status: "Online",
      tone: "green",
    },
    {
      name: "OpenAI API",
      description: "Assistente financeiro por texto e análise de documentos",
      status: process.env.OPENAI_API_KEY ? "Configurada" : "Não configurada",
      tone: process.env.OPENAI_API_KEY ? "green" : "orange",
    },
    {
      name: "WhatsApp Cloud API",
      description: `Canal configurado: ${whatsappNumber}`,
      status: metaReady ? "Credenciais presentes (teste pendente)" : "Aguardando Meta",
      tone: "orange",
    },
    {
      name: "Cargozilla",
      description: "Adaptador previsto para CT-e, fretes e viagens",
      status: "Próxima etapa",
      tone: "orange",
    },
    {
      name: "Open Finance / Pluggy",
      description: "Contas, transações, cartões e conciliação",
      status: "Próxima etapa",
      tone: "orange",
    },
  ];

  return (
    <>
      <Header title="Integrações" subtitle="Conectores desacoplados do núcleo financeiro." />
      <SectionTitle title="Status real" />
      <div className="grid grid-2">
        {items.map((item) => (
          <div className="card" key={item.name}>
            <h3>{item.name}</h3>
            <p className="metric-foot">{item.description}</p>
            <span className={`badge ${item.tone}`}>{item.status}</span>
          </div>
        ))}
      </div>

      <SectionTitle title="WhatsApp Business" />
      <WhatsAppLinkPanel />
      <div className="notice">
        <b>Callback do webhook:</b> https://prime-finance-ochre.vercel.app/api/webhooks/whatsapp.
        A Meta precisa verificar o callback, inscrever o aplicativo nos eventos de mensagens e liberar
        um número e um token de acesso. Não é necessário informar sua senha da Meta ao Prime Finance.
        A conta da Meta é verificada pelo próprio proprietário.
      </div>
    </>
  );
}
