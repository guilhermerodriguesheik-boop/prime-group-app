
import React, { useState } from 'react';
import { Customer } from '../types';
import { Card, Badge, Input, BigButton } from '../components/UI';

interface AdminCustomerManagementProps {
  customers: Customer[];
  setCustomers: React.Dispatch<React.SetStateAction<Customer[]>>;
  onBack: () => void;
}

const AdminCustomerManagement: React.FC<AdminCustomerManagementProps> = ({ customers, setCustomers, onBack }) => {
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome) return alert('Nome do Cliente é obrigatório');

    const newCustomer: Customer = {
      id: crypto.randomUUID(),
      nome,
      cnpj,
      ativo: true
    };

    setCustomers([...customers, newCustomer]);
    setShowForm(false);
    setNome('');
    setCnpj('');
  };

  const toggleStatus = (id: string) => {
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ativo: !c.ativo } : c));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-100 tracking-tight">Gestão de Clientes</h2>
          <p className="text-slate-500 text-sm">Administre os clientes atendidos pela PRIME GROUP</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowForm(!showForm)} 
            className={`px-4 py-2 rounded-lg font-bold transition-all ${showForm ? 'bg-red-900/40 text-red-400 border border-red-900/50' : 'bg-blue-700 text-white shadow-lg shadow-blue-900/20'}`}
          >
            {showForm ? 'Cancelar' : '+ Novo Cliente'}
          </button>
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold text-sm">Voltar</button>
        </div>
      </div>

      {showForm && (
        <Card className="border-blue-900/50 animate-slideDown">
          <h3 className="text-lg font-bold mb-6 text-blue-400 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            Registrar Novo Cliente
          </h3>
          <form onSubmit={handleCreateCustomer} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Nome do Cliente" value={nome} onChange={setNome} required placeholder="Ex: Mercado Livre" />
            <Input label="CNPJ (Opcional)" value={cnpj} onChange={setCnpj} placeholder="00.000.000/0000-00" />
            <div className="md:col-span-2 mt-4">
              <BigButton onClick={() => {}} variant="success">CADASTRAR CLIENTE</BigButton>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.sort((a,b) => a.nome.localeCompare(b.nome)).map(c => (
          <Card key={c.id} className={`flex flex-col gap-4 group transition-all border-l-4 ${c.ativo ? 'border-l-blue-600' : 'border-l-red-900'}`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-950 rounded-full flex items-center justify-center font-bold text-slate-500 border border-slate-800">
                  {c.nome.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors">{c.nome}</div>
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.1em]">Cliente</div>
                </div>
              </div>
              <Badge status={c.ativo ? 'aprovado' : 'rejeitado'}>
                {c.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>
            
            {c.cnpj && (
              <div className="bg-slate-950 p-2 rounded border border-slate-800 flex justify-between items-center">
                 <span className="text-[9px] text-slate-600 font-bold uppercase">CNPJ:</span>
                 <span className="text-xs font-mono text-slate-300">{c.cnpj}</span>
              </div>
            )}

            <div className="flex gap-2 mt-auto pt-2 border-t border-slate-800">
              <button 
                onClick={() => toggleStatus(c.id)}
                className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded transition-colors ${c.ativo ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40'}`}
              >
                {c.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminCustomerManagement;
