import test from "node:test";
import assert from "node:assert/strict";
import { parseAuthorizedNfeXml } from "../src/lib/fiscal/nfe.ts";

const key = "33260914294395000278550010001584551163753462";
function validXml() {
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + '<nfeProc><NFe><infNFe Id="NFe' + key + '">'
    + '<ide><nNF>158455</nNF><serie>1</serie><dhEmi>2026-09-30T10:44:00-03:00</dhEmi></ide>'
    + '<emit><CNPJ>14294395000278</CNPJ><xNome>Emitente teste</xNome><enderEmit><xMun>QUEIMADOS</xMun><UF>RJ</UF></enderEmit></emit>'
    + '<dest><CNPJ>07656566000115</CNPJ><xNome>Cliente teste</xNome><enderDest><xMun>ITAPERUNA</xMun><UF>RJ</UF></enderDest></dest>'
    + '<total><ICMSTot><vNF>21671.50</vNF></ICMSTot></total>'
    + '<transp><vol><qVol>1400</qVol><pesoB>887.500</pesoB></vol></transp>'
    + '<infAdic><infAdFisco>Pedido: 195369 Carga: 030198</infAdFisco></infAdic>'
    + '</infNFe></NFe><protNFe><infProt><cStat>100</cStat><chNFe>' + key + '</chNFe></infProt></protNFe></nfeProc>';
}
test("ler NF-e autorizada e nao confundir mercadoria com frete", () => {
  const result = parseAuthorizedNfeXml(validXml());
  assert.equal(result.invoiceNumber, "158455");
  assert.equal(result.cargoReference, "030198");
  assert.equal(result.originCity, "QUEIMADOS");
  assert.equal(result.destinationCity, "ITAPERUNA");
  assert.equal(result.goodsValue, 21671.5);
  assert.equal(result.grossWeightKg, 887.5);
  assert.equal(Object.hasOwn(result,"freightValue"),false);
});
test("recusar NF-e nao autorizada", () => {
  assert.throws(() => parseAuthorizedNfeXml(validXml().replace("<cStat>100</cStat>","<cStat>110</cStat>")),/autorizada/);
});
test("recusar chave divergente do protocolo", () => {
  assert.throws(() => parseAuthorizedNfeXml(validXml().replace("<chNFe>" + key,"<chNFe>" + "1".repeat(44))),/Chave/);
});
test("recusar doctype e entidades externas", () => {
  assert.throws(()=>parseAuthorizedNfeXml('<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + validXml()),/externa/);
});
test("recusar xml malformado", () => {
  assert.throws(()=>parseAuthorizedNfeXml("<broken>"),/malformado/);
});
test("recusar XML maior que 1 MB", () => {
  assert.throws(()=>parseAuthorizedNfeXml("x".repeat(1024*1024+1)),/1 MB/);
});


import { validateMdfePreparation,normalizePlate,validCpf,validCteAccessKey,mdfeTransmissionBlockers } from "../src/lib/fiscal/preflight.ts";
const mdfeInput={cteDraftId:"123e4567-e89b-42d3-a456-426614174000",plate:"ABC1D23",rntrc:"12345678",driverCpf:"52998224725",originUf:"RJ",destinationUf:"MG"};
test("preparacao MDF-e valida placa Mercosul e CPF sem liberar emissao",()=>{
 assert.deepEqual(validateMdfePreparation(mdfeInput),[]);
 assert.equal(normalizePlate("abc-1d23"),"ABC1D23");
 assert.equal(validCpf(mdfeInput.driverCpf),true);
 assert.ok(mdfeTransmissionBlockers().length>=3);
});
test("preparacao MDF-e rejeita motorista, RNTRC, placa e UF invalidos",()=>{
 const issues=validateMdfePreparation({...mdfeInput,plate:"XYZ",rntrc:"a",driverCpf:"11111111111",destinationUf:"ZZ"});
 assert.equal(issues.length,4);
});
test("chave CT-e valida tamanho e digito verificador",()=>{
 assert.equal(validCteAccessKey("123"),false);
 assert.equal(validCteAccessKey("1".repeat(44)),false);
});
