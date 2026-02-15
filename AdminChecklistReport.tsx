
import React, { useState, useMemo } from 'react';
import { Vehicle, Toll } from '../types';
import { Card, Input, Select, BigButton } from '../components/UI';

interface AdminTollManagementProps {
  tolls: Toll[];
  vehicles: Vehicle[];
  onUpdateTolls: (newTolls: Toll[]) => void;
  onBack: () => void;
}

const AdminTollManagement: React.FC<AdminTollManagementProps> = ({ tolls, vehicles, onUpdateTolls, onBack }) => {
  const [vehicleId, setVehicleId] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleAddToll = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !valor || !data) return;

    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;

    const newToll: Toll = {
      id: crypto.randomUUID(),
      vehicleId,
      placa: vehicle.placa,
      valor: Number(valor),
      data,
      createdAt: new Date().toISOString()
    };

    onUpdateTolls([newToll, ...tolls]);
    setVehicleId('');
    setValor('');
  };

  const handleRemoveToll = (id: string) => {
    if (confirm("Deseja remover este lançamento de pedágio?")) {
      onUpdateTolls(tolls.filter(t => t.id !== id));
    }
  };

  const sortedTolls = useMemo(() => {
    return [...tolls].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
  }, [tolls]);

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestão de Pedágios</h2>
          <p className="text-slate-500">Lance custos de pedágios por veículo e data</p>
        </div>
        <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700">
          Voltar
        </button>
      </div>

      <Card className="border-blue-900/30">
        <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-4">Novo Lançamento</h3>
        <form onSubmit={handleAddToll} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <Select 
            label="Veículo" 
            value={vehicleId} 
            onChange={setVehicleId} 
            options={vehicles.map(v => ({ label: v.placa, value: v.id }))} 
            required
          />
          <Input label="Data" type="date" value={data} onChange={setData} required />
          <Input label="Valor (R$)" type="number" value={valor} onChange={setValor} required placeholder="0.00" />
          <div className="pb-4">
            <BigButton onClick={() => {}} variant="primary" disabled={!vehicleId || !valor || !data}>
               LANÇAR
            </BigButton>
          </div>
        </form>
      </Card>

      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest px-1">Histórico de Lançamentos</h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-800 shadow-xl">
          <table className="w-full text-left border-collapse bg-slate-900/20">
            <thead>
              <tr className="bg-slate-950 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <th className="p-4 border-b border-slate-800">Data</th>
                <th className="p-4 border-b border-slate-800">Veículo</th>
                <th className="p-4 border-b border-slate-800 text-right">Valor (R$)</th>
                <th className="p-4 border-b border-slate-800 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedTolls.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center text-slate-600 italic">Nenhum pedágio lançado.</td>
                </tr>
              ) : (
                sortedTolls.map((toll) => (
                  <tr key={toll.id} className="hover:bg-slate-900/50 transition-colors border-b border-slate-800/30">
                    <td className="p-4 text-xs font-mono text-slate-400">
                      {new Date(toll.data).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4">
                      <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 font-mono text-xs font-bold text-blue-400">
                        {toll.placa}
                      </span>
                    </td>
                    <td className="p-4 text-right text-sm font-bold text-slate-100">
                      R$ {toll.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => handleRemoveToll(toll.id)}
                        className="text-red-900 hover:text-red-500 transition-colors"
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                         </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminTollManagement;
