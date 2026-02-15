
import React, { useState, useMemo } from 'react';
import { Fueling, MaintenanceRequest, User, Vehicle, FuelingStatus, MaintenanceStatus, DailyRoute, RouteDeparture, FinanceiroStatus, PreventiveTask } from '../types';
import { Card, Badge, Input } from '../components/UI';

interface AdminPendingProps {
  fuelings: Fueling[];
  maintenances: MaintenanceRequest[];
  dailyRoutes: DailyRoute[];
  routes: RouteDeparture[];
  vehicles: Vehicle[];
  users: User[];
  currentUser: User;
  onUpdateFueling: (id: string, update: Partial<Fueling>) => void;
  onUpdateMaintenance: (id: string, update: Partial<MaintenanceRequest>) => void;
  onUpdateDailyRoute: (id: string, update: Partial<DailyRoute>) => void;
  onUpdateRoute: (id: string, update: Partial<RouteDeparture>) => void;
  onBack: () => void;
}

const AdminPending: React.FC<AdminPendingProps> = ({ 
  fuelings, 
  maintenances, 
  dailyRoutes, 
  routes, 
  vehicles, 
  users, 
  currentUser, 
  onUpdateFueling, 
  onUpdateMaintenance,
  onUpdateDailyRoute,
  onUpdateRoute,
  onBack 
}) => {
  const [tab, setTab] = useState<'fuel' | 'maintenance' | 'financial' | 'alerts' | 'history'>('fuel');
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  
  // States for financial approval
  const [approvingFinId, setApprovingFinId] = useState<string | null>(null);
  const [finFrete, setFinFrete] = useState('');
  const [finMotorista, setFinMotorista] = useState('');
  const [finAjudante, setFinAjudante] = useState('');

  // States for finishing maintenance
  const [oficina, setOficina] = useState('');
  const [valorMaint, setValorMaint] = useState('');

  const pendingFuelings = fuelings.filter(f => f.status === FuelingStatus.PENDENTE);
  const activeMaintenances = maintenances.filter(m => m.status !== MaintenanceStatus.FEITA && m.status !== MaintenanceStatus.REPROVADA);
  
  const pendingFinancial = useMemo(() => {
    const dailyPending = dailyRoutes.filter(dr => dr.statusFinanceiro === FinanceiroStatus.PENDENTE).map(dr => ({ ...dr, type: 'daily' }));
    const routePending = routes.filter(r => r.statusFinanceiro === FinanceiroStatus.PENDENTE).map(r => ({ ...r, type: 'route' }));
    return [...dailyPending, ...routePending];
  }, [dailyRoutes, routes]);

  const auditHistory = useMemo(() => {
    const fuelHistory = fuelings
      .filter(f => f.status !== FuelingStatus.PENDENTE)
      .map(f => ({
        id: f.id,
        data: f.createdAt,
        placa: f.placa,
        tipo: 'Abastecimento',
        descricao: `R$ ${f.valor.toLocaleString()}`,
        status: f.status,
        adminId: f.adminAprovadorId,
        obs: f.motivoRejeicao
      }));

    const maintenanceHistory = maintenances
      .filter(m => m.status === MaintenanceStatus.FEITA || m.status === MaintenanceStatus.REPROVADA)
      .map(m => ({
        id: m.id,
        data: m.doneAt || m.createdAt,
        placa: m.placa,
        tipo: 'Manutenção',
        descricao: `${m.tipo.toUpperCase()}: ${m.descricao}`,
        status: m.status,
        adminId: m.adminResponsavelId,
        obs: m.oficina ? `Oficina: ${m.oficina} - R$ ${m.valor}` : ''
      }));

    const financialHistory = [
      ...dailyRoutes.filter(dr => dr.statusFinanceiro === FinanceiroStatus.APROVADO).map(dr => ({
        id: dr.id,
        data: dr.createdAt,
        placa: dr.placa,
        tipo: 'Fin. Rota Dia',
        descricao: `${dr.clienteNome} (OC: ${dr.oc})`,
        status: 'Aprovado',
        adminId: dr.adminFinanceiroId,
        obs: `Frete: R$ ${dr.valorFrete}`
      })),
      ...routes.filter(r => r.statusFinanceiro === FinanceiroStatus.APROVADO).map(r => ({
        id: r.id,
        data: r.createdAt,
        placa: r.placa,
        tipo: 'Saída OC (Ajudante)',
        descricao: `${r.clienteNome} (OC: ${r.oc})`,
        status: 'Direcionado',
        adminId: r.adminFinanceiroId,
        obs: r.valorFrete ? `Frete: R$ ${r.valorFrete}` : 'Confirmado sem valor'
      }))
    ];

    return [...fuelHistory, ...maintenanceHistory, ...financialHistory].sort((a, b) => 
      new Date(b.data).getTime() - new Date(a.data).getTime()
    );
  }, [fuelings, maintenances, dailyRoutes, routes]);

  const fleetAlerts = useMemo(() => {
    const alerts: { vehicle: Vehicle; task: PreventiveTask; reason: string }[] = [];
    vehicles.forEach(v => {
      v.preventiveTasks?.forEach(task => {
        const kmOverdue = task.kmAlvo > 0 && v.kmAtual >= task.kmAlvo;
        const dateOverdue = task.dataProgramada && new Date() >= new Date(task.dataProgramada);
        
        if (kmOverdue || dateOverdue) {
          alerts.push({
            vehicle: v,
            task,
            reason: kmOverdue ? 'KM Atingido' : 'Data Vencida'
          });
        }
      });
    });
    return alerts;
  }, [vehicles]);

  const getUserName = (id?: string) => users.find(u => u.id === id)?.nome || 'Sistema';

  const handleApproveFueling = (id: string) => {
    onUpdateFueling(id, { 
      status: FuelingStatus.APROVADO, 
      adminAprovadorId: currentUser.id, 
      approvedAt: new Date().toISOString() 
    });
  };

  const handleRejectFueling = (id: string) => {
    if (!motivo) return alert("Motivo obrigatório");
    onUpdateFueling(id, { 
      status: FuelingStatus.REJEITADO, 
      motivoRejeicao: motivo,
      adminAprovadorId: currentUser.id
    });
    setRejectId(null);
    setMotivo('');
  };

  const handleFinishMaintenance = (id: string) => {
    if (!valorMaint || !oficina) return alert("Oficina e Valor são obrigatórios para fechamento financeiro.");
    
    onUpdateMaintenance(id, { 
      status: MaintenanceStatus.FEITA, 
      doneAt: new Date().toISOString(),
      valor: Number(valorMaint),
      oficina: oficina,
      adminResponsavelId: currentUser.id
    });
    setCompletingId(null);
    setOficina('');
    setValorMaint('');
  };

  // Função para aprovar financeiro (com ou sem valores)
  const handleApproveFinancial = (item: any, quickDirect = false) => {
    const update = {
      valorFrete: quickDirect ? 0 : (Number(finFrete) || 0),
      valorMotorista: quickDirect ? 0 : (Number(finMotorista) || 0),
      valorAjudante: quickDirect ? 0 : (Number(finAjudante) || 0),
      statusFinanceiro: FinanceiroStatus.APROVADO,
      adminFinanceiroId: currentUser.id
    };

    if (item.type === 'daily') {
      onUpdateDailyRoute(item.id, update);
    } else {
      onUpdateRoute(item.id, update);
    }

    setApprovingFinId(null);
    setFinFrete('');
    setFinMotorista('');
    setFinAjudante('');
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold">Central de Pendências</h2>
          <p className="text-slate-500 text-sm">Gerenciamento de fluxos operacionais e financeiros</p>
        </div>
        <button onClick={onBack} className="text-slate-500 hover:text-slate-200">Voltar</button>
      </div>

      <div className="flex flex-wrap gap-2 p-1 bg-slate-900 rounded-xl overflow-x-auto shadow-inner">
        <button onClick={() => setTab('fuel')} className={`flex-1 min-w-[120px] py-2 px-4 rounded-lg font-bold text-xs transition-all ${tab === 'fuel' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
          Abastecer ({pendingFuelings.length})
        </button>
        <button onClick={() => setTab('financial')} className={`flex-1 min-w-[120px] py-2 px-4 rounded-lg font-bold text-xs transition-all ${tab === 'financial' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
          Financeiro ({pendingFinancial.length})
        </button>
        <button onClick={() => setTab('maintenance')} className={`flex-1 min-w-[120px] py-2 px-4 rounded-lg font-bold text-xs transition-all ${tab === 'maintenance' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
          Corretivas ({activeMaintenances.length})
        </button>
        <button onClick={() => setTab('alerts')} className={`flex-1 min-w-[120px] py-2 px-4 rounded-lg font-bold text-xs transition-all ${tab === 'alerts' ? 'bg-red-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
          Alertas ({fleetAlerts.length})
        </button>
        <button onClick={() => setTab('history')} className={`flex-1 min-w-[140px] py-2 px-4 rounded-lg font-bold text-xs transition-all ${tab === 'history' ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
          Audit Histórico
        </button>
      </div>

      {tab === 'fuel' && (
        <div className="grid grid-cols-1 gap-4">
          {pendingFuelings.length === 0 ? (
            <div className="py-20 text-center text-slate-600 border border-dashed border-slate-800 rounded-2xl">Nenhum abastecimento pendente</div>
          ) : (
            pendingFuelings.map(f => (
              <Card key={f.id} className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                <div className="w-full md:w-32 h-32 bg-slate-950 rounded-lg overflow-hidden border border-slate-800">
                  <img src={f.fotoNota} alt="Nota" className="w-full h-full object-cover opacity-60 hover:opacity-100 transition-opacity" />
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-blue-400">{f.placa}</span>
                    <Badge status={f.status}>{f.status}</Badge>
                  </div>
                  <div className="text-2xl font-black">R$ {f.valor.toLocaleString()}</div>
                  <div className="text-xs text-slate-500 uppercase font-bold tracking-widest">KM: {f.kmNoMomento} • Solicitado em: {new Date(f.createdAt).toLocaleString()}</div>
                </div>
                {rejectId === f.id ? (
                  <div className="w-full md:w-64 space-y-2">
                    <Input label="Motivo Rejeição" value={motivo} onChange={setMotivo} placeholder="Obrigatório..." />
                    <div className="flex gap-2">
                      <button onClick={() => handleRejectFueling(f.id)} className="flex-1 bg-red-600 py-2 rounded font-bold text-sm">Confirmar</button>
                      <button onClick={() => setRejectId(null)} className="flex-1 bg-slate-800 py-2 rounded font-bold text-sm">Voltar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 w-full md:w-auto">
                    <button onClick={() => handleApproveFueling(f.id)} className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-500 px-6 py-3 rounded-xl font-bold">Aprovar</button>
                    <button onClick={() => setRejectId(f.id)} className="flex-1 md:flex-none bg-red-900/40 text-red-400 border border-red-900 px-6 py-3 rounded-xl font-bold">Rejeitar</button>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'financial' && (
        <div className="grid grid-cols-1 gap-4">
          {pendingFinancial.length === 0 ? (
            <div className="py-20 text-center text-slate-600 border border-dashed border-slate-800 rounded-2xl">
              Tudo em dia! Nenhuma operação aguardando financeiro.
            </div>
          ) : (
            pendingFinancial.map(item => (
              <Card key={item.id} className={`border-l-4 ${item.type === 'route' ? 'border-l-blue-600' : 'border-l-emerald-600'}`}>
                <div className="flex flex-col lg:flex-row gap-6">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="bg-slate-950 px-3 py-1 rounded border border-slate-800 font-mono text-xl font-black text-blue-400 tracking-wider">
                        {item.placa}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest ${item.type === 'route' ? 'text-blue-500' : 'text-emerald-500'}`}>
                        {item.type === 'daily' ? 'ROTA DO DIA (Motorista)' : 'SAÍDA / OC (Ajudante)'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                        <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Equipe</div>
                        <div className="text-xs font-bold text-slate-200">Mot: {getUserName(item.motoristaId)}</div>
                        {item.ajudanteId && <div className="text-xs font-bold text-slate-400">Aju: {getUserName(item.ajudanteId)}</div>}
                      </div>
                      <div className="bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                        <div className="text-[9px] text-slate-500 font-black uppercase mb-1">Destino / Cliente</div>
                        <div className="text-xs font-bold text-slate-200">{item.clienteNome} • {item.destino}</div>
                        <div className="text-[10px] text-blue-500 font-mono mt-1">OC: {item.oc}</div>
                      </div>
                    </div>
                  </div>

                  {approvingFinId === item.id ? (
                    <div className="lg:w-96 bg-slate-950 p-4 rounded-xl border border-emerald-900/40 space-y-3 animate-slideDown">
                      <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Atribuir Valores Financeiros</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <Input label="Valor Frete (Bruto)" type="number" value={finFrete} onChange={setFinFrete} placeholder="0.00" />
                        <Input label="Custo Motorista" type="number" value={finMotorista} onChange={setFinMotorista} placeholder="0.00" />
                        <Input label="Custo Ajudante" type="number" value={finAjudante} onChange={setFinAjudante} placeholder="0.00" />
                        <div className="flex items-end pb-4">
                          <button onClick={() => handleApproveFinancial(item)} className="w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded-lg font-bold text-xs uppercase shadow-lg">Aprovar Rota</button>
                        </div>
                      </div>
                      <button onClick={() => setApprovingFinId(null)} className="w-full text-[10px] text-slate-500 uppercase font-black hover:text-slate-300">Cancelar</button>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-center gap-2 min-w-[200px]">
                       <button 
                        onClick={() => {
                          setApprovingFinId(item.id);
                          setFinFrete(item.valorFrete?.toString() || '');
                          setFinMotorista(item.valorMotorista?.toString() || '');
                          setFinAjudante(item.valorAjudante?.toString() || '');
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 px-6 py-3 rounded-xl font-bold whitespace-nowrap shadow-lg shadow-emerald-950/20"
                      >
                        Definir Valores
                      </button>
                      
                      {item.type === 'route' && (
                        <button 
                          onClick={() => handleApproveFinancial(item, true)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white px-6 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest border border-slate-700 transition-all"
                        >
                          Confirmar e Direcionar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="grid grid-cols-1 gap-4">
          {activeMaintenances.length === 0 ? (
            <div className="py-20 text-center text-slate-600 border border-dashed border-slate-800 rounded-2xl">Nenhuma corretiva ativa</div>
          ) : (
            activeMaintenances.map(m => (
              <Card key={m.id} className="flex flex-col md:flex-row gap-6">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-blue-400 tracking-wider">{m.placa}</span>
                    <Badge status={m.status}>{m.status}</Badge>
                    <span className={`text-xs font-black uppercase px-2 py-1 rounded ${m.tipo === 'preventiva' ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`}>
                      {m.tipo}
                    </span>
                  </div>
                  <p className="text-slate-300 font-medium italic">"{m.descricao}"</p>
                  <div className="text-[10px] text-slate-600 font-bold uppercase">Solicitado em: {new Date(m.createdAt || '').toLocaleDateString()} • KM: {m.kmNoMomento}</div>
                </div>
                
                {completingId === m.id ? (
                  <div className="w-full md:w-80 p-4 bg-slate-950 rounded-xl border border-blue-900/30 space-y-3 animate-slideDown">
                    <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Fechamento Financeiro</h4>
                    <Input label="Oficina / Fornecedor" value={oficina} onChange={setOficina} placeholder="Ex: Oficina do Zé" />
                    <Input label="Valor Total (R$)" type="number" value={valorMaint} onChange={setValorMaint} placeholder="0.00" />
                    <div className="flex gap-2">
                      <button onClick={() => handleFinishMaintenance(m.id)} className="flex-1 bg-emerald-600 py-2 rounded-lg font-bold text-xs uppercase">Confirmar</button>
                      <button onClick={() => setCompletingId(null)} className="flex-1 bg-slate-800 py-2 rounded-lg font-bold text-xs uppercase">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 min-w-[140px]">
                    {m.status === MaintenanceStatus.PENDENTE && (
                      <button onClick={() => onUpdateMaintenance(m.id, { status: MaintenanceStatus.ASSUMIDA, adminResponsavelId: currentUser.id, assumedAt: new Date().toISOString() })} 
                              className="bg-blue-600 hover:bg-blue-500 p-3 rounded-xl font-bold whitespace-nowrap">Assumir</button>
                    )}
                    {m.status === MaintenanceStatus.ASSUMIDA && m.adminResponsavelId === currentUser.id && (
                      <button onClick={() => onUpdateMaintenance(m.id, { status: MaintenanceStatus.EM_EXECUCAO, startedAt: new Date().toISOString() })}
                              className="bg-indigo-600 hover:bg-indigo-500 p-3 rounded-xl font-bold whitespace-nowrap">Iniciar</button>
                    )}
                    {m.status === MaintenanceStatus.EM_EXECUCAO && m.adminResponsavelId === currentUser.id && (
                      <button onClick={() => setCompletingId(m.id)}
                              className="bg-emerald-600 hover:bg-emerald-500 p-3 rounded-xl font-bold whitespace-nowrap">Concluir</button>
                    )}
                    {m.status !== MaintenanceStatus.PENDENTE && m.adminResponsavelId !== currentUser.id && (
                       <div className="text-[10px] text-slate-600 font-bold uppercase text-center border border-slate-800 p-2 rounded">Assumida por {getUserName(m.adminResponsavelId)}</div>
                    )}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div className="grid grid-cols-1 gap-4">
          {fleetAlerts.length === 0 ? (
            <div className="py-20 text-center text-slate-600 border border-dashed border-slate-800 rounded-2xl">
              Frota em dia! Nenhum alerta preventivo.
            </div>
          ) : (
            fleetAlerts.map((alert, idx) => (
              <Card key={idx} className="border-l-4 border-l-red-600 bg-red-900/5">
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xl font-black text-white bg-slate-950 px-3 py-1 rounded border border-slate-800">{alert.vehicle.placa}</span>
                      <span className="text-xs font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-2 py-1 rounded">⚠️ {alert.reason}</span>
                    </div>
                    <div className="text-sm font-bold text-slate-200 mt-2">{alert.task.descricao}</div>
                    <div className="text-xs text-slate-500 flex gap-4">
                      {alert.task.kmAlvo > 0 && <span>Meta: {alert.task.kmAlvo.toLocaleString()} KM (Atual: {alert.vehicle.kmAtual.toLocaleString()})</span>}
                      {alert.task.dataProgramada && <span>Limite: {new Date(alert.task.dataProgramada).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-800 shadow-2xl">
            <table className="w-full text-left border-collapse bg-slate-950/20">
              <thead>
                <tr className="bg-slate-950 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <th className="p-4 border-b border-slate-800">Data Ação</th>
                  <th className="p-4 border-b border-slate-800">Placa</th>
                  <th className="p-4 border-b border-slate-800">Tipo Pendência</th>
                  <th className="p-4 border-b border-slate-800">Descrição Item</th>
                  <th className="p-4 border-b border-slate-800">Status Final</th>
                  <th className="p-4 border-b border-slate-800">Autorizado Por</th>
                </tr>
              </thead>
              <tbody>
                {auditHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-20 text-center text-slate-600 italic">Nenhum histórico de auditoria registrado.</td>
                  </tr>
                ) : (
                  auditHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-900/50 transition-colors border-b border-slate-900/50">
                      <td className="p-4 text-xs font-mono text-slate-400">
                        {new Date(item.data).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 font-mono text-xs font-bold text-blue-400">
                          {item.placa}
                        </span>
                      </td>
                      <td className="p-4 text-[10px] font-black uppercase text-slate-400 tracking-tighter">
                        {item.tipo}
                      </td>
                      <td className="p-4">
                        <div className="text-xs font-bold text-slate-200">{item.descricao}</div>
                        {item.obs && <div className="text-[10px] text-slate-500 italic mt-1">{item.obs}</div>}
                      </td>
                      <td className="p-4">
                        <Badge status={item.status}>{item.status}</Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/20"></div>
                          <span className="text-xs font-black text-white uppercase tracking-tighter">
                            {getUserName(item.adminId)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPending;
