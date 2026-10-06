export const dashboard = {
  caixa: 87420,
  receber30: 61200,
  pagar30: 32400,
  patrimonio: 819000,
};

export const fleet = [
  { vehicle: "VW 12.170", revenue: 28000, cost: 14000, profit: 14000, km: 4210, kmL: 2.9 },
  { vehicle: "Sprinter 2019", revenue: 18000, cost: 8500, profit: 9500, km: 3380, kmL: 8.6 },
  { vehicle: "Sprinter 2007", revenue: 12700, cost: 8700, profit: 4000, km: 2940, kmL: 7.5 },
];

export const receivables = [
  { name: "Cliente A · CT-e 1842", workspace: "Prime", due: "09/10/2026", amount: 4500, status: "A receber" },
  { name: "Gustavo · parcela", workspace: "Juros/Recebíveis", due: "09/10/2026", amount: 5000, status: "A receber" },
  { name: "Cliente B · CT-e 1847", workspace: "Prime", due: "14/10/2026", amount: 3800, status: "A receber" },
  { name: "Motor · parcela", workspace: "Pessoal", due: "15/10/2026", amount: 7700, status: "Previsto" },
];

export const recurring = [
  { name: "Aluguel", scope: "Pessoal", amount: 1300, day: 10 },
  { name: "Plano de saúde", scope: "Pessoal", amount: 700, day: 5 },
  { name: "Academia + personal", scope: "Pessoal", amount: 500, day: 5 },
  { name: "Consórcio", scope: "Pessoal", amount: 731, day: 15 },
  { name: "Pronampe", scope: "Prime", amount: 300, day: 20 },
];
