
import React, { useState } from 'react';
import { Vehicle, VehicleStatus } from '../types';
import { Card, Badge, Input, BigButton } from '../components/UI';

interface VehicleMgmtProps {
  vehicles: Vehicle[];
  setVehicles: React.Dispatch<React.SetStateAction<Vehicle[]>>;
  onBack: () => void;
}

const VehicleManagement: React.FC<VehicleMgmtProps> = ({ vehicles, setVehicles, onBack }) => {
  const [showForm, setShowForm] = useState(false);
  const [placa, setPlaca] = useState('');
  const [modelo, setModelo] = useState('');
  const [km, setKm] = useState('');

  const handleCreateVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!placa || !modelo) return alert('Placa e Modelo são obrigatórios');

    const newVehicle: Vehicle = {
      id: crypto.randomUUID(),
      placa: placa.toUpperCase(),
      modelo,
      kmAtual: Number(km) || 0,
      status: VehicleStatus.RODANDO,
      proximaManutencaoKm: (Number(km) || 0) + 10000
    };

    setVehicles([...vehicles, newVehicle]);
    setShowForm(false);
    setPlaca('');
    setModelo('');
    setKm('');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-100 tracking-tight">Gestão da Frota</h2>
          <p className="text-slate-500 text-sm">Administre as placas cadastradas no PRIME GROUP</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowForm(!showForm)} 
            className={`px-4 py-2 rounded-lg font-bold transition-all ${showForm ? 'bg-red-900/40 text-red-400 border border-red-900/50' : 'bg-blue-700 text-white shadow-lg shadow-blue-900/20'}`}
          >
            {showForm ? 'Cancelar' : '+ Novo Veículo'}
          </button>
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold text-sm">Voltar</button>
        </div>
      </div>

      {showForm && (
        <Card className="border-blue-900/50 animate-slideDown">
          <h3 className="text-lg font-bold mb-6 text-blue-400 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Registrar Novo Caminhão/Veículo
          </h3>
          <form onSubmit={handleCreateVehicle} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Placa" value={placa} onChange={setPlaca} required placeholder="ABC-1234" />
            <Input label="Modelo / Marca" value={modelo} onChange={setModelo} required placeholder="Ex: Scania R450" />
            <Input label="KM Inicial" type="number" value={km} onChange={setKm} placeholder="KM atual do painel" />
            <div className="md:col-span-3 mt-4">
              <BigButton onClick={() => {}} variant="success">CADASTRAR PLACA</BigButton>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vehicles.sort((a,b) => a.placa.localeCompare(b.placa)).map(v => (
          <Card key={v.id} className="flex flex-col sm:flex-row justify-between gap-4 hover:border-blue-900 transition-all">
            <div className="space-y-2">
              <div className="bg-slate-950 inline-block px-3 py-1 rounded-lg font-mono font-black text-xl text-blue-400 border border-slate-800 shadow-inner tracking-widest">
                {v.placa}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-100">{v.modelo}</div>
                <div className="text-[10px] text-slate-500 font-bold uppercase">KM: {v.kmAtual.toLocaleString()}</div>
              </div>
            </div>
            <div className="flex flex-col items-end justify-between gap-2">
              <Badge status={v.status}>{v.status}</Badge>
              <div className="flex gap-3">
                <button className="text-[10px] text-blue-500 font-black uppercase hover:underline tracking-widest">Editar</button>
                <button className="text-[10px] text-red-900 font-black uppercase hover:underline tracking-widest">Remover</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default VehicleManagement;
