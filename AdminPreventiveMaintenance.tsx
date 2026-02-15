
import React, { useState } from 'react';
import { User, UserSession, DailyRoute, Customer, FinanceiroStatus } from '../types';
import { Card, Input, BigButton, Select } from '../components/UI';

interface DriverDailyRouteProps {
  session: UserSession;
  user: User;
  customers: Customer[];
  onSubmit: (route: DailyRoute) => void;
  onBack: () => void;
}

const DriverDailyRoute: React.FC<DriverDailyRouteProps> = ({ session, user, customers, onSubmit, onBack }) => {
  const [clienteId, setClienteId] = useState('');
  const [destino, setDestino] = useState('');
  const [oc, setOc] = useState('');

  // Checklist Photos States (4 fotos agora)
  const [fotoFrente, setFotoFrente] = useState<string | null>(null);
  const [fotoLatEsquerda, setFotoLatEsquerda] = useState<string | null>(null);
  const [fotoLatDireita, setFotoLatDireita] = useState<string | null>(null);
  const [fotoTraseira, setFotoTraseira] = useState<string | null>(null);
  
  // Níveis Separados (Marcador X)
  const [nivelOleo, setNivelOleo] = useState<'no_nivel' | 'abaixo_do_nivel' | null>(null);
  const [nivelAgua, setNivelAgua] = useState<'no_nivel' | 'abaixo_do_nivel' | null>(null);

  const isChecklistComplete = !!(
    fotoFrente && 
    fotoLatEsquerda && 
    fotoLatDireita && 
    fotoTraseira && 
    nivelOleo &&
    nivelAgua
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteId || !destino || !oc || !isChecklistComplete) return;

    const cliente = customers.find(c => c.id === clienteId);

    const newDailyRoute: DailyRoute = {
      id: crypto.randomUUID(),
      motoristaId: user.id,
      vehicleId: session.vehicleId,
      placa: session.placa,
      clienteId,
      clienteNome: cliente?.nome,
      destino,
      oc,
      valorFrete: 0,
      valorMotorista: 0,
      valorAjudante: 0,
      statusFinanceiro: FinanceiroStatus.PENDENTE,
      fotoFrente: fotoFrente || '',
      fotoLateralEsquerda: fotoLatEsquerda || '',
      fotoLateralDireita: fotoLatDireita || '',
      fotoTraseira: fotoTraseira || '',
      nivelOleo: nivelOleo!,
      nivelAgua: nivelAgua!,
      createdAt: new Date().toISOString()
    };

    onSubmit(newDailyRoute);
  };

  const PhotoSlot = ({ label, value, onCapture, icon = "📸" }: { label: string, value: string | null, onCapture: () => void, icon?: string }) => (
    <div 
      onClick={onCapture}
      className={`relative flex flex-col items-center justify-center p-3 rounded-xl border-2 border-dashed transition-all cursor-pointer ${value ? 'border-emerald-600 bg-emerald-950/10' : 'border-slate-800 hover:border-blue-700 bg-slate-950'}`}
    >
      <div className="text-2xl mb-1">{value ? "✅" : icon}</div>
      <div className={`text-[9px] font-black uppercase text-center leading-tight ${value ? 'text-emerald-500' : 'text-slate-500'}`}>
        {label}
      </div>
      {value && (
        <div className="absolute top-1 right-1 w-2 h-2 bg-emerald-500 rounded-full"></div>
      )}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto py-4 animate-fadeIn">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Definir Rota do Dia</h2>
          <p className="text-slate-500 text-sm">Inspeção e destino para {session.placa}</p>
        </div>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-200">Cancelar</button>
      </div>

      <Card className="space-y-8">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Dados da Rota */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800 pb-2">Destino da Operação</h3>
            
            <Select 
              label="CLIENTE" 
              value={clienteId} 
              onChange={setClienteId} 
              options={customers.filter(c => c.ativo).map(c => ({ label: c.nome, value: c.id }))}
              required
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input 
                label="DESTINO" 
                value={destino} 
                onChange={setDestino} 
                required 
                placeholder="Ex: Barueri / SP" 
              />
              <Input 
                label="OC (Ordem de Carga)" 
                value={oc} 
                onChange={setOc} 
                required 
                placeholder="Ex: OC-4582" 
              />
            </div>
          </div>

          {/* Fotos da Inspeção */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800 pb-2 flex justify-between items-center">
              Fotos da Inspeção (4 Externas)
              {(fotoFrente && fotoLatEsquerda && fotoLatDireita && fotoTraseira) && <span className="text-[10px] text-emerald-500 bg-emerald-950 px-2 py-0.5 rounded">FOTOS OK</span>}
            </h3>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <PhotoSlot label="Frente" value={fotoFrente} onCapture={() => setFotoFrente('captured_url_1')} />
              <PhotoSlot label="Lat. Esquerda" value={fotoLatEsquerda} onCapture={() => setFotoLatEsquerda('captured_url_2')} />
              <PhotoSlot label="Lat. Direita" value={fotoLatDireita} onCapture={() => setFotoLatDireita('captured_url_3')} />
              <PhotoSlot label="Traseira" value={fotoTraseira} onCapture={() => setFotoTraseira('captured_url_4')} />
            </div>
          </div>

          {/* Níveis Técnicos Separados */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Nível de Óleo */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                Nível de Óleo do Motor
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setNivelOleo('no_nivel')}
                  className={`p-3 rounded-xl border-2 transition-all flex items-center justify-between ${nivelOleo === 'no_nivel' ? 'border-blue-600 bg-blue-900/20 text-blue-400' : 'border-slate-800 bg-slate-950 text-slate-500'}`}
                >
                  <span className="font-bold text-[10px] uppercase">No Nível</span>
                  <span className="text-lg font-black">{nivelOleo === 'no_nivel' ? 'X' : ''}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNivelOleo('abaixo_do_nivel')}
                  className={`p-3 rounded-xl border-2 transition-all flex items-center justify-between ${nivelOleo === 'abaixo_do_nivel' ? 'border-red-600 bg-red-900/20 text-red-400' : 'border-slate-800 bg-slate-950 text-slate-500'}`}
                >
                  <span className="font-bold text-[10px] uppercase">Abaixo do Nível</span>
                  <span className="text-lg font-black">{nivelOleo === 'abaixo_do_nivel' ? 'X' : ''}</span>
                </button>
              </div>
            </div>

            {/* Nível de Água */}
            <div className="space-y-4">
              <h3 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800 pb-2">
                Nível de Água (Arrefecimento)
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setNivelAgua('no_nivel')}
                  className={`p-3 rounded-xl border-2 transition-all flex items-center justify-between ${nivelAgua === 'no_nivel' ? 'border-blue-600 bg-blue-900/20 text-blue-400' : 'border-slate-800 bg-slate-950 text-slate-500'}`}
                >
                  <span className="font-bold text-[10px] uppercase">No Nível</span>
                  <span className="text-lg font-black">{nivelAgua === 'no_nivel' ? 'X' : ''}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setNivelAgua('abaixo_do_nivel')}
                  className={`p-3 rounded-xl border-2 transition-all flex items-center justify-between ${nivelAgua === 'abaixo_do_nivel' ? 'border-red-600 bg-red-900/20 text-red-400' : 'border-slate-800 bg-slate-950 text-slate-500'}`}
                >
                  <span className="font-bold text-[10px] uppercase">Abaixo do Nível</span>
                  <span className="text-lg font-black">{nivelAgua === 'abaixo_do_nivel' ? 'X' : ''}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4">
            {!isChecklistComplete && (
              <p className="text-[10px] text-red-400 font-bold italic text-center mb-4">
                * As 4 fotos e as marcações de nível são obrigatórias.
              </p>
            )}
            <BigButton 
              onClick={() => {}} 
              disabled={!clienteId || !destino || !oc || !isChecklistComplete}
              variant={isChecklistComplete ? "primary" : "secondary"}
            >
              {isChecklistComplete ? "INICIAR ROTA" : "COMPLETE O CHECKLIST"}
            </BigButton>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default DriverDailyRoute;
