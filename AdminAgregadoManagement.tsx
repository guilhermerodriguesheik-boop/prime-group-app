
import React, { useState, useEffect } from 'react';
import { AgregadoFreight, Agregado } from '../types';
import { Card, Input, BigButton, Select } from '../components/UI';

interface AdminAgregadoFreightProps {
  agregados: Agregado[];
  onSubmit: (freight: AgregadoFreight) => void;
  onBack: () => void;
}

const AdminAgregadoFreight: React.FC<AdminAgregadoFreightProps> = ({ agregados, onSubmit, onBack }) => {
  const [agregadoId, setAgregadoId] = useState('');
  const [placa, setPlaca] = useState('');
  const [valorFrete, setValorFrete] = useState('');
  const [valorAgregado, setValorAgregado] = useState('');
  const [data, setData] = useState(new Date().toISOString().split('T')[0]);
  const [oc, setOc] = useState('');

  // Auto-fill placa when agregado is selected
  useEffect(() => {
    const selected = agregados.find(a => a.id === agregadoId);
    if (selected) {
      setPlaca(selected.placa);
    } else {
      setPlaca('');
    }
  }, [agregadoId, agregados]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agregadoId || !valorFrete || !valorAgregado || !data || !oc) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    const selectedAgregado = agregados.find(a => a.id === agregadoId);
    if (!selectedAgregado) return;

    const newFreight: AgregadoFreight = {
      id: crypto.randomUUID(),
      agregadoId: agregadoId,
      nomeAgregado: selectedAgregado.nome,
      placa: selectedAgregado.placa,
      valorFrete: Number(valorFrete),
      valorAgregado: Number(valorAgregado),
      data,
      oc,
      createdAt: new Date().toISOString()
    };

    onSubmit(newFreight);
    onBack();
  };

  const activeAgregadosOptions = agregados
    .filter(a => a.ativo)
    .map(a => ({ label: `${a.nome} (${a.placa})`, value: a.id }));

  return (
    <div className="max-w-3xl mx-auto py-4 animate-fadeIn">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Lançar Frete de Agregado</h2>
          <p className="text-slate-500 text-sm">Registro de operação de terceiros (Agregados Cadastrados)</p>
        </div>
        <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700 transition-colors">
          Cancelar
        </button>
      </div>

      <Card className="border-indigo-900/30">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select 
              label="Selecionar Agregado" 
              value={agregadoId} 
              onChange={setAgregadoId} 
              options={activeAgregadosOptions}
              required 
            />
            <div className="mb-4">
              <label className="block text-slate-400 text-sm font-medium mb-1.5 uppercase tracking-wider">Placa do Veículo</label>
              <div className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-blue-400 font-mono font-bold text-xl tracking-widest shadow-inner">
                {placa || '--- ---'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input 
              label="Data da Operação" 
              type="date" 
              value={data} 
              onChange={setData} 
              required 
            />
            <Input 
              label="OC (Ordem de Carga)" 
              value={oc} 
              onChange={setOc} 
              required 
              placeholder="Ex: OC-8855" 
            />
          </div>

          <div className="border-t border-slate-800 pt-6 space-y-4">
            <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">Valores da Operação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                label="Valor do Frete (Receita)" 
                type="number" 
                value={valorFrete} 
                onChange={setValorFrete} 
                required 
                placeholder="0.00" 
              />
              <Input 
                label="Valor Pago ao Agregado (Custo)" 
                type="number" 
                value={valorAgregado} 
                onChange={setValorAgregado} 
                required 
                placeholder="0.00" 
              />
            </div>
          </div>

          <div className="p-4 bg-indigo-950/20 border border-indigo-900/30 rounded-xl flex items-center justify-between">
             <span className="text-xs font-bold text-indigo-400 uppercase">Saldo Estimado:</span>
             <span className="text-xl font-black text-emerald-400">
               R$ {(Number(valorFrete) - Number(valorAgregado)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
             </span>
          </div>

          {agregados.length === 0 ? (
            <div className="p-4 bg-red-900/20 border border-red-900/40 rounded-xl text-red-400 text-xs font-bold text-center italic">
              Aviso: Nenhum agregado cadastrado. Vá em "Cadastrar Agregado" primeiro.
            </div>
          ) : (
            <BigButton 
              onClick={() => {}} 
              variant="primary" 
              disabled={!agregadoId || !valorFrete || !valorAgregado || !oc}
            >
              CONFIRMAR LANÇAMENTO
            </BigButton>
          )}
        </form>
      </Card>
    </div>
  );
};

export default AdminAgregadoFreight;
