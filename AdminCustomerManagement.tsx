
import React, { useState, useMemo } from 'react';
import { User, Vehicle, DailyRoute, UserRole, Customer } from '../types';
import { Card, Input, Select, BigButton } from '../components/UI';

interface AdminCreateDailyRouteProps {
  users: User[];
  vehicles: Vehicle[];
  customers: Customer[];
  onSubmit: (route: DailyRoute) => void;
  onBack: () => void;
}

const AdminCreateDailyRoute: React.FC<AdminCreateDailyRouteProps> = ({ users, vehicles, customers, onSubmit, onBack }) => {
  const [motoristaId, setMotoristaId] = useState('');
  const [ajudanteId, setAjudanteId] = useState('');
  const [vehicleId, setVehicleId] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [destino, setDestino] = useState('');
  const [oc, setOc] = useState('');
  const [valorFrete, setValorFrete] = useState('');
  const [valorMotorista, setValorMotorista] = useState('');
  const [valorAjudante, setValorAjudante] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const drivers = useMemo(() => users.filter(u => u.perfil === UserRole.MOTORISTA && u.ativo), [users]);
  const helpers = useMemo(() => users.filter(u => u.perfil === UserRole.AJUDANTE && u.ativo), [users]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!motoristaId || !vehicleId || !clienteId || !destino || !oc || !selectedDate) return;

    const selectedVehicle = vehicles.find(v => v.id === vehicleId);
    const selectedCustomer = customers.find(c => c.id === clienteId);
    const selectedHelper = helpers.find(h => h.id === ajudanteId);
    
    if (!selectedVehicle) return;

    const now = new Date();
    const [year, month, day] = selectedDate.split('-');
    const finalDate = new Date(Number(year), Number(month) - 1, Number(day), now.getHours(), now.getMinutes(), now.getSeconds());

    const newDailyRoute: DailyRoute = {
      id: crypto.randomUUID(),
      motoristaId: motoristaId,
      ajudanteId: ajudanteId || undefined,
      ajudanteNome: selectedHelper?.nome,
      vehicleId: vehicleId,
      placa: selectedVehicle.placa,
      clienteId: clienteId,
      clienteNome: selectedCustomer?.nome,
      destino,
      oc,
      valorFrete: valorFrete ? Number(valorFrete) : 0,
      valorMotorista: valorMotorista ? Number(valorMotorista) : 0,
      valorAjudante: valorAjudante ? Number(valorAjudante) : 0,
      createdAt: finalDate.toISOString()
    };

    onSubmit(newDailyRoute);
  };

  return (
    <div className="max-w-3xl mx-auto py-4 animate-fadeIn">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Lançar Rota Manual</h2>
          <p className="text-slate-500 text-sm">Vincule a equipe, veículo e destino</p>
        </div>
        <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700 transition-colors">
          Voltar
        </button>
      </div>

      <Card className="border-indigo-900/30 bg-slate-900/60">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select 
              label="1. Selecionar Motorista" 
              value={motoristaId} 
              onChange={setMotoristaId} 
              options={drivers.map(u => ({ label: u.nome, value: u.id }))}
              required 
            />
            <Select 
              label="2. Selecionar Ajudante (Opcional)" 
              value={ajudanteId} 
              onChange={setAjudanteId} 
              options={helpers.map(u => ({ label: u.nome, value: u.id }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select 
              label="3. Selecionar Veículo (Placa)" 
              value={vehicleId} 
              onChange={setVehicleId} 
              options={vehicles.map(v => ({ label: `${v.placa} - ${v.modelo}`, value: v.id }))}
              required 
            />
            <Input 
              label="Data da Operação" 
              type="date"
              value={selectedDate}
              onChange={setSelectedDate}
              required
            />
          </div>

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Informações Financeiras</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input 
                label="Valor do Frete (Bruto)" 
                type="number"
                value={valorFrete}
                onChange={setValorFrete}
                placeholder="0.00"
              />
              <Input 
                label="Valor Motorista" 
                type="number"
                value={valorMotorista}
                onChange={setValorMotorista}
                placeholder="0.00"
              />
              <Input 
                label="Valor Ajudante" 
                type="number"
                value={valorAjudante}
                onChange={setValorAjudante}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Informações da Rota</h3>
            <div className="grid grid-cols-1 gap-4">
              <Select 
                label="CLIENTE" 
                value={clienteId} 
                onChange={setClienteId} 
                options={customers.filter(c => c.ativo).map(c => ({ label: c.nome, value: c.id }))}
                required 
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input 
                  label="DESTINO PRINCIPAL" 
                  value={destino} 
                  onChange={setDestino} 
                  required 
                  placeholder="Ex: Jundiaí / SP" 
                />
                <Input 
                  label="OC (Ordem de Carga)" 
                  value={oc} 
                  onChange={setOc} 
                  required 
                  placeholder="Ex: OC-9988" 
                />
              </div>
            </div>
          </div>

          <div className="p-4 bg-indigo-950/20 border border-indigo-900/30 rounded-xl flex items-start gap-3">
            <span className="text-xl">💰</span>
            <div className="text-xs text-indigo-300 leading-relaxed">
              <strong>Gestão de Custos:</strong> Defina o faturamento bruto (Frete) e as despesas diretas com a equipe (Motorista e Ajudante) para este carregamento.
            </div>
          </div>

          <BigButton 
            onClick={() => {}} 
            variant="primary" 
            disabled={!motoristaId || !vehicleId || !clienteId || !destino || !oc || !selectedDate}
          >
            CONFIRMAR LANÇAMENTO
          </BigButton>
        </form>
      </Card>
    </div>
  );
};

export default AdminCreateDailyRoute;
