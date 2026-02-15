
import React, { useState } from 'react';
import { User, UserSession, MaintenanceRequest, MaintenanceStatus } from '../types';
import { Card, Input, Select, BigButton } from '../components/UI';

interface MaintenanceFormProps {
  session: UserSession;
  user: User;
  onSubmit: (maintenance: MaintenanceRequest) => void;
  onBack: () => void;
}

const MaintenanceForm: React.FC<MaintenanceFormProps> = ({ session, user, onSubmit, onBack }) => {
  const [tipo, setTipo] = useState<'preventiva' | 'corretiva'>('corretiva');
  const [desc, setDesc] = useState('');
  const [km, setKm] = useState('');
  const [hasPhoto, setHasPhoto] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !km) return;

    // Added createdAt field to match interface definition
    const newReq: MaintenanceRequest = {
      id: crypto.randomUUID(),
      vehicleId: session.vehicleId,
      placa: session.placa,
      motoristaId: user.id,
      tipo,
      descricao: desc,
      kmNoMomento: Number(km),
      foto: hasPhoto ? 'https://picsum.photos/400/300' : '', // Simulação de upload
      status: MaintenanceStatus.PENDENTE,
      createdAt: new Date().toISOString()
    };
    onSubmit(newReq);
  };

  return (
    <div className="max-w-xl mx-auto py-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-100">Solicitar Manutenção</h2>
          <p className="text-slate-500 text-sm">Relate problemas técnicos do veículo {session.placa}</p>
        </div>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-200">Cancelar</button>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-between items-center">
            <span className="text-sm font-bold text-slate-500 uppercase">Veículo</span>
            <span className="font-mono text-lg text-blue-400 font-bold">{session.placa}</span>
          </div>

          <Select 
            label="Tipo de Manutenção" 
            value={tipo} 
            onChange={(v) => setTipo(v as any)} 
            options={[
              {label: 'Preventiva (Revisão/Troca Óleo)', value: 'preventiva'}, 
              {label: 'Corretiva (Quebra/Defeito)', value: 'corretiva'}
            ]} 
          />

          <Input label="KM Atual do Painel" type="number" value={km} onChange={setKm} required placeholder="Ex: 154000" />
          
          <div>
            <label className="block text-slate-400 text-sm font-medium mb-1.5 uppercase tracking-wider">Descrição do Problema</label>
            <textarea 
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-50 min-h-[120px] focus:border-blue-500 outline-none transition-all"
              placeholder="Descreva detalhadamente o que está acontecendo com o veículo..."
              required
            ></textarea>
          </div>

          <div className="space-y-2">
            <label className="block text-slate-400 text-sm font-medium uppercase tracking-wider">Foto do Problema (Opcional)</label>
            <div 
              onClick={() => setHasPhoto(true)}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all bg-slate-950/50 ${hasPhoto ? 'border-emerald-500 bg-emerald-500/5' : 'border-slate-800 hover:border-blue-700'}`}
            >
              {hasPhoto ? (
                <div className="text-emerald-500">
                  <span className="text-3xl block mb-2">✅</span>
                  <span className="text-sm font-bold">Foto capturada com sucesso!</span>
                </div>
              ) : (
                <>
                  <span className="text-3xl block mb-2">📸</span>
                  <span className="text-sm text-slate-500">Clique para tirar foto ou anexar imagem</span>
                </>
              )}
              <input type="file" className="hidden" accept="image/*" />
            </div>
          </div>

          <BigButton onClick={() => {}} disabled={!desc || !km}>
            ENVIAR SOLICITAÇÃO
          </BigButton>
        </form>
      </Card>
    </div>
  );
};

export default MaintenanceForm;
