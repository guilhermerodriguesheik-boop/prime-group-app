
import React, { useState } from 'react';
import { Vehicle } from '../types';
import { Card, Input } from '../components/UI';

interface VehicleSelectionProps {
  vehicles: Vehicle[];
  onSelect: (id: string, placa: string) => void;
  onBack: () => void;
}

const VehicleSelection: React.FC<VehicleSelectionProps> = ({ vehicles, onSelect, onBack }) => {
  const [filter, setFilter] = useState('');

  const filteredVehicles = vehicles.filter(v => 
    v.placa.toLowerCase().includes(filter.toLowerCase()) || 
    v.modelo.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="max-w-2xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Selecionar Veículo</h2>
          <p className="text-slate-400">Escolha a placa que você utilizará hoje</p>
        </div>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-200 text-sm">Voltar</button>
      </div>

      <div className="mb-6">
        <Input 
          label="Filtrar placa ou modelo" 
          value={filter} 
          onChange={setFilter} 
          placeholder="Ex: LQB or Volvo..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {filteredVehicles.map(v => (
          <button
            key={v.id}
            onClick={() => onSelect(v.id, v.placa)}
            className="p-5 bg-slate-900 border border-slate-800 rounded-2xl hover:border-blue-500 hover:bg-slate-800 transition-all text-left shadow-lg group"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="bg-slate-950 px-3 py-1 rounded border border-slate-700 font-mono text-lg font-bold group-hover:border-blue-800 transition-colors">
                {v.placa}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-tighter ${v.status === 'rodando' ? 'text-emerald-500' : 'text-yellow-500'}`}>
                {v.status}
              </span>
            </div>
            <div className="text-sm font-medium text-slate-300">{v.modelo}</div>
            <div className="text-xs text-slate-500 mt-1">KM Atual: {v.kmAtual.toLocaleString()}</div>
          </button>
        ))}
        {filteredVehicles.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-600 border border-dashed border-slate-800 rounded-2xl">
            Nenhum veículo encontrado
          </div>
        )}
      </div>
    </div>
  );
};

export default VehicleSelection;
