
import React from 'react';
import { Fueling, MaintenanceRequest } from '../types';
import { Card, Badge } from '../components/UI';

interface MyRequestsProps {
  fuelings: Fueling[];
  maintenances: MaintenanceRequest[];
  onBack: () => void;
}

const MyRequests: React.FC<MyRequestsProps> = ({ fuelings, maintenances, onBack }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Minhas Solicitações</h2>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-200">Voltar</button>
      </div>

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-slate-400">Últimos Abastecimentos</h3>
        {fuelings.length === 0 && <p className="text-slate-600 text-sm">Nenhum registro encontrado</p>}
        {fuelings.map(f => (
          <Card key={f.id} className="flex justify-between items-center">
            <div>
              <div className="text-lg font-black">R$ {f.valor.toLocaleString()}</div>
              <div className="text-xs text-slate-500 uppercase font-bold">{new Date(f.createdAt).toLocaleDateString()} • {f.placa}</div>
            </div>
            <div className="text-right">
              <Badge status={f.status}>{f.status}</Badge>
              {f.motivoRejeicao && <div className="text-[10px] text-red-400 mt-1 max-w-[150px]">Motivo: {f.motivoRejeicao}</div>}
            </div>
          </Card>
        ))}

        <h3 className="text-lg font-bold text-slate-400 mt-10">Manutenções Solicitadas</h3>
        {maintenances.length === 0 && <p className="text-slate-600 text-sm">Nenhum registro encontrado</p>}
        {maintenances.map(m => (
          <Card key={m.id}>
            <div className="flex justify-between items-start mb-2">
              <div className="text-sm font-bold text-slate-200">{m.tipo.toUpperCase()} - {m.placa}</div>
              <Badge status={m.status}>{m.status}</Badge>
            </div>
            <p className="text-sm text-slate-400 truncate">"{m.descricao}"</p>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default MyRequests;
