import { Header, SectionTitle } from "@/components/ui";
import { WhatsAppLinkPanel } from "@/components/whatsapp/link-panel";

export default function Page() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "a definir";
  const viaQr = process.env.WHATSAPP_PROVIDER === "evolution";
  const metaReady = Boolean(
    process.env.META_WHATSAPP_APP_SECRET &&
    process.env.META_WHATSAPP_ACCESS_TOKEN &&
    process.env.META_WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_VERIFY_TOKEN &&
    process.env.WHATSAPP_INGRESS_SECRET,
  );
  const evolutionReady = Boolean(
    process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY &&
    process.env.EVOLUTION_INSTANCE && process.env.WHATSAPP_INGRESS_SECRET &&
    (process.env.EVOLUTION_WEBHOOK_SECRET||"").length >= 32,
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
      name: viaQr ? "WhatsApp QR Code (Evolution)" : "WhatsApp Cloud API",
      description: "Canal configurado: "+(viaQr ? (process.env.EVOLUTION_PHONE_NUMBER||whatsappNumber) : whatsappNumber),
      status: viaQr
        ? (evolutionReady ? "Credenciais presentes (teste pendente)" : "Aguardando conexão QR")
        : (metaReady ? "Credenciais presentes (teste pendente)" : "Aguardando Meta"),
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
        {viaQr ? (
          <>
            <b>Canal QR Code:</b> conecte um número dedicado na instância Evolution e configure
            o webhook HTTPS <code>/api/webhooks/evolution</code> para o evento MESSAGES_UPSERT,
            com o cabeçalho privado x-prime-webhook-secret. Depois, gere o código de vínculo
            acima e envie pelo seu outro WhatsApp para o número conectado via QR Code.
            Este canal não é oficial da Meta; prefira um número secundário para testes.
          </>
        ) : (
          <>
            <b>Callback do webhook:</b> https://prime-finance-ochre.vercel.app/api/webhooks/whatsapp.
            A Meta precisa verificar o callback, inscrever o aplicativo nos eventos de mensagens e liberar
            um número e um token de acesso. Não informe senha ou token da Meta ao Prime Finance.
          </>
        )}
      </div>
    </>
  );
}
