
import { User, UserRole, Vehicle, VehicleStatus, Customer } from './types';

export const INITIAL_USERS: User[] = [
  { id: 'u1', nome: 'Guilherme', email: 'guilherme@prime.com', senha: 'prime123', perfil: UserRole.ADMIN, ativo: true },
  { id: 'u2', nome: 'Danilo', email: 'danilo@prime.com', senha: 'prime123', perfil: UserRole.ADMIN, ativo: true },
  { id: 'u3', nome: 'João Pinheiro', email: 'joao@prime.com', senha: '123', perfil: UserRole.MOTORISTA, ativo: true },
  { id: 'u4', nome: 'José Clemente', email: 'jose@prime.com', senha: '123', perfil: UserRole.MOTORISTA, ativo: true },
  { id: 'u5', nome: 'Carlos Eduardo', email: 'carlos@prime.com', senha: '123', perfil: UserRole.MOTORISTA, ativo: true },
  { id: 'u6', nome: 'Sérgio Medeiros', email: 'sergio@prime.com', senha: '123', perfil: UserRole.MOTORISTA, ativo: true },
  { id: 'u7', nome: 'André Luiz', email: 'andre@prime.com', senha: '123', perfil: UserRole.MOTORISTA, ativo: true },
  { id: 'u8', nome: 'Renan', email: 'renan@prime.com', senha: '123', perfil: UserRole.AJUDANTE, ativo: true },
  { id: 'u9', nome: 'Junior', email: 'junior@prime.com', senha: '123', perfil: UserRole.AJUDANTE, ativo: true },
];

export const INITIAL_VEHICLES: Vehicle[] = [
  { id: 'v1', placa: 'LQB2B76', modelo: 'Mercedes-Benz Atego', kmAtual: 154200, status: VehicleStatus.RODANDO, proximaManutencaoKm: 160000 },
  { id: 'v2', placa: 'LUX9A15', modelo: 'Volvo FH 540', kmAtual: 89000, status: VehicleStatus.RODANDO, proximaManutencaoKm: 95000 },
  { id: 'v3', placa: 'INZ6I09', modelo: 'Scania R450', kmAtual: 210000, status: VehicleStatus.MANUTENCAO, proximaManutencaoKm: 210500 },
  { id: 'v4', placa: 'KVN8790', modelo: 'Volkswagen Constellation', kmAtual: 125600, status: VehicleStatus.RODANDO, proximaManutencaoKm: 130000 },
  { id: 'v5', placa: 'DLA3I85', modelo: 'Iveco Stralis', kmAtual: 340000, status: VehicleStatus.PARADO, proximaManutencaoKm: 345000 },
  { id: 'v6', placa: 'LNN4760', modelo: 'Ford Cargo', kmAtual: 45000, status: VehicleStatus.RODANDO, proximaManutencaoKm: 50000 },
  { id: 'v7', placa: 'LNX4C34', modelo: 'Mercedes-Benz Axor', kmAtual: 178000, status: VehicleStatus.RODANDO, proximaManutencaoKm: 185000 },
];

export const INITIAL_CUSTOMERS: Customer[] = [
  { id: 'c1', nome: 'Frigocopa', ativo: true },
  { id: 'c2', nome: 'King Ouro', ativo: true },
  { id: 'c3', nome: 'Ortobom', ativo: true },
];

export const APP_THEME = {
  primary: 'bg-blue-900',
  secondary: 'bg-slate-900',
  accent: 'text-blue-400',
  background: 'bg-slate-950',
  card: 'bg-slate-900/50',
  border: 'border-slate-800'
};
