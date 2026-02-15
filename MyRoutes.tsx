
import React, { useState } from 'react';
import { User, UserSession, RouteDeparture, RouteStatus, Customer, FinanceiroStatus } from '../types';
import { Card, Input, BigButton, Select } from '../components/UI';

interface RouteFormProps {
  session: UserSession;
  user: User;
  drivers: User[];
  customers: Customer[];
  onSubmit: (route: RouteDeparture) => void;
  onBack: () => void;
}

const RouteForm: React.FC<RouteFormProps> = ({ session, user, drivers, customers, onSubmit, onBack }) => {
  const [clienteId, setClienteId] = useState('');
  const [destino, setDestino] = useState('');
  const [oc, setOc] = useState('');
  const [motoristaId, setMotoristaId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !destino || !oc || !motoristaId) return;

    const selectedCustomer = customers.find(c => c.id === clienteId);

    const newRoute: RouteDeparture = {
      id: crypto.randomUUID(),
      vehicleId: session.vehicleId,
      placa: session.placa,
      motoristaId: motoristaId,
      ajudanteId: user.id,
      clienteId,
      clienteNome: selectedCustomer?.nome,
      destino,
      oc,
      valorFrete: 0,
      valorMotorista: 0,
      valorAjudante: 0,
      statusFinanceiro: FinanceiroStatus.PENDENTE,
      status: RouteStatus.EM_ROTA,
      createdAt: new Date().toISOString()
    };
    onSubmit(newRoute);
  };

  return (
    <div className="max-w-xl mx-auto py-4">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl font-bold">Registrar Saída</h2>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-200">Cancelar</button>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          <Select 
            label="Motorista Responsável" 
            value={motoristaId} 
            onChange={setMotoristaId} 
            options={drivers.map(d => ({ label: d.nome, value: d.id }))} 
            required 
          />
          
          <Select 
            label="CLIENTE" 
            value={clienteId} 
            onChange={setClienteId} 
            options={customers.filter(c => c.ativo).map(c => ({ label: c.nome, value: c.id }))}
            required 
          />

          <Input label="DESTINO" value={destino} onChange={setDestino} required placeholder="Ex: Cliente X - Curitiba" />
          <Input label="OC (Ordem de Carga)" value={oc} onChange={setOc} required placeholder="Ex: OC-12345" />
          
          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-xs text-slate-500">
            Atenção: Registre a saída corretamente. O valor financeiro será atribuído pelo administrador na aba "Pendências > Financeiro".
          </div>

          <BigButton onClick={() => {}} disabled={!clienteId || !destino || !oc || !motoristaId}>INICIAR ROTA</BigButton>
        </form>
      </Card>
    </div>
  );
};

export default RouteForm;
