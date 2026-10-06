type SendTextOptions = {
  to: string;
  body: string;
};

export async function sendWhatsAppText({ to, body }: SendTextOptions) {
  const token = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API credentials are not configured.");
  }

  const response = await fetch(
    `https://graph.facebook.com/v24.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`WhatsApp send failed: ${response.status} ${payload}`);
  }

  return response.json();
}
