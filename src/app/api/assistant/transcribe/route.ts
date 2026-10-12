import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 90;

// Keep comfortably below Vercel's request-body limit. Recordings are not
// stored in Supabase; only the transcript is returned to the signed-in user.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3",
  "audio/wav", "audio/x-wav", "audio/ogg", "audio/flac",
  "audio/x-m4a", "audio/aac",
]);
const ACCEPTED_EXT = new Set(["webm", "mp3", "mp4", "m4a", "wav", "ogg", "oga", "flac", "mpeg", "mpga"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Faça login para transcrever o áudio." }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ error: "A transcrição ainda não foi configurada." }, { status: 503 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_AUDIO_BYTES + 100_000) {
    return NextResponse.json({ error: "Áudio muito grande. Envie um arquivo de até 4 MB." }, { status: 413 });
  }

  let input: FormData;
  try {
    input = await request.formData();
  } catch {
    return NextResponse.json({ error: "Não foi possível abrir o arquivo de áudio." }, { status: 400 });
  }

  const audio = input.get("audio");
  if (!(audio instanceof File) || !audio.size) {
    return NextResponse.json({ error: "Selecione ou grave um áudio para transcrever." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Áudio muito grande. Limite de 4 MB." }, { status: 413 });
  }

  const baseType = audio.type.toLowerCase().split(";")[0];
  const extension = audio.name.split(".").pop()?.toLowerCase() || "";
  if (!ACCEPTED_MIME.has(baseType) || !ACCEPTED_EXT.has(extension)) {
    return NextResponse.json({
      error: "Formato não aceito. Use MP3, M4A, WAV, OGG ou WebM.",
    }, { status: 415 });
  }

  const form = new FormData();
  form.append("file", audio, audio.name);
  form.append("model", process.env.PRIME_TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe");
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("prompt", "Português brasileiro. Finanças pessoais, transportadora Prime Group, VW 12.170, Mercedes Sprinter, CT-e, notas fiscais, fretes, diesel, empréstimos e juros. Preserve valores, nomes, placas e datas com exatidão.");

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(80_000),
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 429) {
        return NextResponse.json({
          error: "A transcrição não foi autorizada pela API. Verifique limite/créditos e tente novamente.",
        }, { status: 429 });
      }
      return NextResponse.json({
        error: "Não foi possível transcrever o áudio agora. Tente novamente.",
      }, { status: 502 });
    }

    const result = (await response.json()) as { text?: unknown };
    if (typeof result.text !== "string" || !result.text.trim()) {
      return NextResponse.json({ error: "Não foi possível entender o áudio. Grave novamente." }, { status: 422 });
    }

    const transcript = result.text.trim().slice(0, 8000);
    return NextResponse.json({ transcript }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({
      error: "Não foi possível concluir a transcrição. Tente novamente.",
    }, { status: 504 });
  }
}
