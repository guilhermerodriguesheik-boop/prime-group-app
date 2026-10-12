"use client";

import { useEffect, useRef, useState } from "react";
import { FileAudio, Mic, Square } from "lucide-react";

const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

export function AudioControls({
  disabled,
  onTranscript,
  onStatus,
  onBusyChange,
}: {
  disabled: boolean;
  onTranscript: (value: string) => void;
  onStatus: (message: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state === "recording") recorderRef.current.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function transcribe(file: File) {
    if (!file.size || file.size > MAX_AUDIO_BYTES) {
      onStatus("O áudio precisa ter conteúdo e no máximo 4 MB. Tente gravar novamente.");
      onBusyChange(false);
      return;
    }

    setTranscribing(true);
    onBusyChange(true);
    onStatus("Transcrevendo áudio...");
    try {
      const normalized = /\.opus$/i.test(file.name)
        ? new File([file], file.name.replace(/\.opus$/i, ".ogg"), { type: "audio/ogg" })
        : file;

      const form = new FormData();
      form.append("audio", normalized, normalized.name);

      const response = await fetch("/api/assistant/transcribe", { method: "POST", body: form });
      const result = (await response.json()) as { transcript?: string; error?: string };
      if (!response.ok || !result.transcript?.trim()) {
        throw new Error(result.error || "Não foi possível entender o áudio.");
      }

      onTranscript(result.transcript.trim());
      onStatus("Áudio transcrito. Confira valores, datas e nomes antes de enviar à IA.");
    } catch (error) {
      onStatus(error instanceof Error ? error.message : "Erro ao transcrever o áudio.");
    } finally {
      setTranscribing(false);
      onBusyChange(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  }

  async function toggleRecording() {
    if (recording) {
      stopRecording();
      return;
    }
    if (disabled || transcribing) return;

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onStatus("Seu navegador não suporta microfone aqui. Use Enviar áudio.");
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = [
        "audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg",
      ].find((value) => MediaRecorder.isTypeSupported(value));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);

      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        onStatus("Falha na gravação. Verifique o microfone ou use Enviar áudio.");
      };
      recorder.onstop = () => {
        if (timerRef.current) clearTimeout(timerRef.current);
        stream?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);

        const type = recorder.mimeType.split(";")[0] || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        void transcribe(new File([blob], "gravacao-" + Date.now() + "." + ext, { type }));
      };

      recorder.start(1000);
      setRecording(true);
      onBusyChange(true);
      onStatus("Gravando... Clique em Parar quando terminar (máximo 2 minutos).");
      timerRef.current = setTimeout(() => stopRecording(), 120_000);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      onBusyChange(false);
      onStatus("Microfone não disponível. Libere a permissão do navegador ou envie um arquivo de áudio.");
    }
  }

  return (
    <>
      <button
        className={"button voice " + (recording ? "recording" : "")}
        type="button"
        onClick={() => void toggleRecording()}
        disabled={(disabled || transcribing) && !recording}
        aria-pressed={recording}
        aria-label={recording ? "Parar gravação" : "Gravar áudio"}
      >
        {recording ? <Square size={15} /> : <Mic size={16} />}
        {recording ? "Parar gravação" : "Gravar áudio"}
      </button>
      <input
        ref={fileInputRef}
        className="file-input-hidden"
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.ogg,.oga,.opus,.webm,.mp4"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void transcribe(file);
        }}
      />
      <button
        className="button attach"
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || recording || transcribing}
      >
        <FileAudio size={16} /> Enviar áudio
      </button>
      <span className="metric-foot">até 4 MB · revise a transcrição</span>
    </>
  );
}
