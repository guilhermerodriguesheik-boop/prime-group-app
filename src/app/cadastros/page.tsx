import { Cadastros } from "@/components/ledger/cadastros";
import { parsePart } from "@/lib/ledger/parts";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ parte?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.parte) ? params.parte[0] : params.parte;
  return <Cadastros initialPart={parsePart(raw)} />;
}
