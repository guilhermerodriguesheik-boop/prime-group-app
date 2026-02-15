
export enum UserRole {
  ADMIN = 'admin',
  CUSTOM_ADMIN = 'custom_admin',
  MOTORISTA = 'motorista',
  AJUDANTE = 'ajudante'
}

export enum VehicleStatus {
  RODANDO = 'rodando',
  MANUTENCAO = 'manutencao',
  PARADO = 'parado'
}

export enum FuelingStatus {
  PENDENTE = 'pendente',
  APROVADO = 'aprovado',
  REJEITADO = 'rejeitado'
}

export enum MaintenanceStatus {
  PENDENTE = 'pendente',
  ASSUMIDA = 'assumida',
  EM_EXECUCAO = 'em_execucao',
  FEITA = 'feita',
  REPROVADA = 'reprovada'
}

export enum RouteStatus {
  EM_ROTA = 'em_rota',
  FINALIZADA = 'finalizada',
  CANCELADA = 'cancelada'
}

export enum FinanceiroStatus {
  PENDENTE = 'pendente',
  APROVADO = 'aprovado'
}

export interface User {
  id: string;
  nome: string;
  email: string;
  senha?: string;
  perfil: UserRole;
  ativo: boolean;
  permissoes?: string[];
}

export interface Customer {
  id: string;
  nome: string;
  cnpj?: string;
  ativo: boolean;
}

export interface Agregado {
  id: string;
  nome: string;
  placa: string;
  ativo: boolean;
}

export interface FixedExpense {
  id: string;
  categoria: 'funcionario' | 'contador' | 'manobra' | 'sistema' | 'imposto' | 'outros';
  descricao: string;
  valor: number;
  dataCompetencia: string;
  createdAt: string;
}

export interface AgregadoFreight {
  id: string;
  agregadoId: string;
  nomeAgregado: string;
  placa: string;
  valorFrete: number;
  valorAgregado: number;
  oc: string;
  data: string;
  createdAt: string;
}

export interface PreventiveTask {
  id: string;
  descricao: string;
  kmAlvo: number;
  dataProgramada?: string;
}

export interface Vehicle {
  id: string;
  placa: string;
  modelo: string;
  kmAtual: number;
  status: VehicleStatus;
  preventiveTasks?: PreventiveTask[];
  proximaManutencaoKm?: number;
  ultimaRevisaoData?: string;
  trackerId?: string;
  lastLat?: number;
  lastLng?: number;
  isOnline?: boolean;
}

export interface UserSession {
  userId: string;
  vehicleId: string;
  placa: string;
  updatedAt: string;
}

export interface DailyRoute {
  id: string;
  motoristaId: string;
  ajudanteId?: string;
  ajudanteNome?: string;
  vehicleId: string;
  placa: string;
  clienteId: string;
  clienteNome?: string;
  destino: string;
  oc: string;
  valorFrete?: number;
  valorMotorista?: number;
  valorAjudante?: number;
  statusFinanceiro?: FinanceiroStatus;
  adminFinanceiroId?: string;
  createdAt: string;
  fotoFrente?: string;
  fotoLateralEsquerda?: string;
  fotoLateralDireita?: string;
  fotoTraseira?: string;
  nivelOleo?: 'no_nivel' | 'abaixo_do_nivel';
  nivelAgua?: 'no_nivel' | 'abaixo_do_nivel';
}

export interface Fueling {
  id: string;
  vehicleId: string;
  placa: string;
  motoristaId: string;
  kmNoMomento: number;
  valor: number;
  fotoNota: string;
  status: FuelingStatus;
  motivoRejeicao?: string;
  adminAprovadorId?: string;
  createdAt: string;
  approvedAt?: string;
}

export interface MaintenanceRequest {
  id: string;
  vehicleId: string;
  placa: string;
  motoristaId: string;
  tipo: 'preventiva' | 'corretiva';
  descricao: string;
  kmNoMomento: number;
  foto: string;
  status: MaintenanceStatus;
  adminResponsavelId?: string;
  assumedAt?: string;
  startedAt?: string;
  doneAt?: string;
  oficina?: string;
  valor?: number;
  notaFoto?: string;
  observacaoAdmin?: string;
  createdAt: string;
}

export interface RouteDeparture {
  id: string;
  vehicleId: string;
  placa: string;
  motoristaId: string;
  ajudanteId: string;
  ajudanteNome?: string;
  clienteId: string;
  clienteNome?: string;
  destino: string;
  oc: string;
  valorFrete?: number;
  valorMotorista?: number;
  valorAjudante?: number;
  statusFinanceiro?: FinanceiroStatus;
  adminFinanceiroId?: string;
  observacao?: string;
  status: RouteStatus;
  createdAt: string;
  finishedAt?: string;
}

export interface Toll {
  id: string;
  vehicleId: string;
  placa: string;
  valor: number;
  data: string;
  createdAt: string;
}
