import Link from "next/link";
import { Header, SectionTitle } from "@/components/ui";
import { WhatsAppLinkPanel } from "@/components/whatsapp/link-panel";

export default function Page() {
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "a definir";
  const viaGo = process.env.WHATSAPP_PROVIDER === "evolution_go";
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
  const evolutionGoReady = Boolean(
    process.env.EVOLUTION_GO_API_URL && process.env.EVOLUTION_GO_INSTANCE_NAME &&
    (process.env.EVOLUTION_GO_TOKEN||"").length >= 32 && process.env.WHATSAPP_INGRESS_SECRET,
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
      name: viaGo ? "WhatsApp What's Evolution Go" : viaQr ? "WhatsApp QR Code (Evolution)" : "WhatsApp Cloud API",
      description: "Canal configurado: "+(viaGo ? (process.env.EVOLUTION_GO_PHONE_NUMBER||whatsappNumber) :
        viaQr ? (process.env.EVOLUTION_PHONE_NUMBER||whatsappNumber) : whatsappNumber),
      status: viaGo ? (evolutionGoReady ? "Configurado · Evolution Go" : "Aguardando Evolution Go") :
        viaQr ? (evolutionReady ? "Credenciais presentes (teste pendente)" : "Aguardando conexão QR") :
        (metaReady ? "Credenciais presentes (teste pendente)" : "Aguardando Meta"),
      tone: viaGo && evolutionGoReady ? "green" : "orange",
    },
    {
      name: "Cargozilla",
      description: "CT-e e MDF-e emitidos externamente; documentos e acertos importados do Gmail",
      status: "Emissão externa",
      tone: "green",
    },
    {
      name: "Open Finance / Pluggy",
      description: "Itaú PJ, Bradesco PJ e Inter PF — integração em modo de leitura",
      status: process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET
        ? "Credenciais configuradas; aguardando consentimentos"
        : "Conector implementado; aguardando credenciais",
      tone: process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET ? "green" : "orange",
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

      <div className="notice"><Link href="/bancos">Abrir painel bancário / Open Finance →</Link></div>
      <SectionTitle title="WhatsApp Business" />
      <WhatsAppLinkPanel />
      <div className="notice">
        {viaGo ? (
          <>
            <b>Webhook do What&apos;s Evolution Go:</b>
            <code> https://prime-finance-ochre.vercel.app/api/webhooks/evolution-go </code>.
            No painel do Evolution Go, abra Webhook, use essa URL, ative mensagens recebidas
            (evento MESSAGE) e salve. O serviço envia o token da instância no evento, validado
            no servidor. Em seguida, use o código de vínculo acima enviando de outro WhatsApp
            para o número conectado. Não compartilhe o token nem o insira no GitHub.
          </>
        ) : viaQr ? (
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
