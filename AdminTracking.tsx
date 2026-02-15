
import React, { useState } from 'react';
import { Agregado } from '../types';
import { Card, Input, BigButton, Badge } from '../components/UI';

interface AdminAgregadoManagementProps {
  agregados: Agregado[];
  onUpdateAgregados: (newAgregados: Agregado[]) => void;
  onBack: () => void;
}

const AdminAgregadoManagement: React.FC<AdminAgregadoManagementProps> = ({ agregados, onUpdateAgregados, onBack }) => {
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState('');
  const [placa, setPlaca] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !placa) return alert('Preencha Nome e Placa');

    const newAgregado: Agregado = {
      id: crypto.randomUUID(),
      nome,
      placa: placa.toUpperCase(),
      ativo: true
    };

    onUpdateAgregados([newAgregado, ...agregados]);
    setShowForm(false);
    setNome('');
    setPlaca('');
  };

  const toggleStatus = (id: string) => {
    onUpdateAgregados(agregados.map(a => a.id === id ? { ...a, ativo: !a.ativo } : a));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-100 tracking-tight">Cadastro de Agregados</h2>
          <p className="text-slate-500 text-sm">Gerencie os parceiros terceirizados e suas placas</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowForm(!showForm)} 
            className={`px-4 py-2 rounded-lg font-bold transition-all ${showForm ? 'bg-red-900/40 text-red-400 border border-red-900/50' : 'bg-blue-700 text-white shadow-lg shadow-blue-900/20'}`}
          >
            {showForm ? 'Cancelar' : '+ Novo Agregado'}
          </button>
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold text-sm">Voltar</button>
        </div>
      </div>

      {showForm && (
        <Card className="border-blue-900/50 animate-slideDown">
          <h3 className="text-lg font-bold mb-6 text-blue-400 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Registrar Novo Parceiro
          </h3>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nome do Agregado" value={nome} onChange={setNome} required placeholder="Ex: João Transportes" />
            <Input label="Placa do Veículo" value={placa} onChange={setPlaca} required placeholder="ABC-1234" />
            <div className="md:col-span-2 mt-4">
              <BigButton onClick={() => {}} variant="success">CADASTRAR AGREGADO</BigButton>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agregados.map(a => (
          <Card key={a.id} className={`flex flex-col gap-4 group transition-all border-l-4 ${a.ativo ? 'border-l-blue-600' : 'border-l-red-900'}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors text-lg">{a.nome}</div>
                <div className="bg-slate-950 inline-block px-2 py-0.5 rounded border border-slate-800 font-mono font-bold text-blue-400 text-sm mt-1">
                  {a.placa}
                </div>
              </div>
              <Badge status={a.ativo ? 'aprovado' : 'rejeitado'}>
                {a.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>

            <div className="flex gap-2 mt-auto pt-2 border-t border-slate-800">
              <button 
                onClick={() => toggleStatus(a.id)}
                className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded transition-colors ${a.ativo ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40'}`}
              >
                {a.ativo ? 'Inativar' : 'Reativar'}
              </button>
            </div>
          </Card>
        ))}
        {agregados.length === 0 && !showForm && (
           <div className="col-span-full py-20 text-center text-slate-600 border border-dashed border-slate-800 rounded-2xl italic">
            Nenhum agregado cadastrado ainda.
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAgregadoManagement;
