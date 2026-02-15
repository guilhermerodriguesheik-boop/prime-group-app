
import React, { useMemo } from 'react';
import { MaintenanceRequest, User, MaintenanceStatus } from '../types';
import { Card, Badge } from '../components/UI';

interface AdminMaintenanceHistoryProps {
  maintenances: MaintenanceRequest[];
  users: User[];
  onBack: () => void;
}

const AdminMaintenanceHistory: React.FC<AdminMaintenanceHistoryProps> = ({ maintenances, users, onBack }) => {
  const history = useMemo(() => {
    // Manutenções atendidas (Feitas, Em Execução ou Assumidas) que já saíram do estado Pendente
    return maintenances
      .filter(m => m.status !== MaintenanceStatus.PENDENTE)
      .sort((a, b) => {
        const dateA = a.doneAt || a.startedAt || a.assumedAt || '';
        const dateB = b.doneAt || b.startedAt || b.assumedAt || '';
        return dateB.localeCompare(dateA);
      });
  }, [maintenances]);

  const getUserName = (id: string) => users.find(u => u.id === id)?.nome || 'Usuário Desconhecido';

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold">Histórico de Manutenções</h2>
          <p className="text-slate-500">Registros de solicitações atendidas e concluídas</p>
        </div>
        <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold transition-colors">Voltar</button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {history.length === 0 ? (
          <div className="py-20 text-center text-slate-600 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
            Nenhum histórico de manutenção disponível ainda.
          </div>
        ) : (
          history.map(m => (
            <Card key={m.id} className="border-l-4 border-l-blue-500">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xl font-black text-blue-400 bg-slate-950 px-3 py-1 rounded border border-slate-800">{m.placa}</span>
                    <Badge status={m.status}>{m.status}</Badge>
                    <span className={`text-xs font-black uppercase px-2 py-1 rounded ${m.tipo === 'preventiva' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>
                      {m.tipo}
                    </span>
                  </div>

                  <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Descrição do Problema</div>
                    <p className="text-slate-300 italic font-medium">"{m.descricao}"</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="flex flex-col">
                      <span className="text-slate-500 font-bold uppercase tracking-tighter">Motorista Solicitante</span>
                      <span className="text-slate-100 font-medium">{getUserName(m.motoristaId)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-slate-500 font-bold uppercase tracking-tighter">Admin Responsável</span>
                      <span className="text-indigo-400 font-medium">{m.adminResponsavelId ? getUserName(m.adminResponsavelId) : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                <div className="w-full md:w-64 space-y-3 text-right">
                  <div className="text-xs space-y-1">
                    {m.assumedAt && (
                      <div className="flex justify-between text-slate-500">
                        <span>Assumido:</span>
                        <span className="text-slate-300 font-mono">{new Date(m.assumedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {m.startedAt && (
                      <div className="flex justify-between text-slate-500">
                        <span>Iniciado:</span>
                        <span className="text-slate-300 font-mono">{new Date(m.startedAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {m.doneAt && (
                      <div className="flex justify-between text-slate-500 font-bold">
                        <span className="text-emerald-500 uppercase">Concluído:</span>
                        <span className="text-emerald-500 font-mono">{new Date(m.doneAt).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {m.status === MaintenanceStatus.FEITA && (
                    <div className="bg-emerald-900/20 border border-emerald-900/40 p-3 rounded-lg text-left">
                      <div className="text-[10px] text-emerald-500 font-bold uppercase mb-1">Dados de Fechamento</div>
                      <div className="text-xs text-slate-300">Oficina: <span className="text-white font-bold">{m.oficina || 'Não inf.'}</span></div>
                      <div className="text-sm text-emerald-400 font-black mt-1">R$ {m.valor?.toLocaleString() || '0,00'}</div>
                    </div>
                  )}

                  {m.foto && (
                    <div className="flex justify-end gap-2">
                      <button className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-400 uppercase font-black tracking-widest transition-colors">Ver Foto do Problema</button>
                      {m.notaFoto && (
                         <button className="text-[10px] bg-blue-900/30 hover:bg-blue-900/50 px-2 py-1 rounded text-blue-400 uppercase font-black tracking-widest transition-colors">Ver Nota</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminMaintenanceHistory;
