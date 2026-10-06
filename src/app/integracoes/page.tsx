import { Header, SectionTitle } from "@/components/ui";

export default function Page() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "+5521980999580";
  const metaReady = Boolean(
    process.env.META_WHATSAPP_APP_SECRET &&
    process.env.META_WHATSAPP_ACCESS_TOKEN &&
    process.env.META_WHATSAPP_PHONE_NUMBER_ID,
  );

  const items = [
    {
      name: "Supabase",
      description: "PostgreSQL, autenticação, RLS e arquivos privados",
      status: "Online",
      tone: "green",
    },
    {
      name: "Vercel AI Gateway",
      description: "Assistente financeiro com GPT 5.6 Luna por padrão",
      status: "Online",
      tone: "green",
    },
    {
      name: "WhatsApp Cloud API",
      description: `Canal configurado: ${whatsappNumber}`,
      status: metaReady ? "Online" : "Aguardando Meta",
      tone: metaReady ? "green" : "orange",
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

      <SectionTitle title="Webhook do WhatsApp" />
      <div className="notice">
        Endpoint preparado em <b>/api/webhooks/whatsapp</b>. A entrada de mensagens só é ativada
        depois que as credenciais privadas da Meta forem cadastradas no Vercel.
      </div>
    </>
  );
}
