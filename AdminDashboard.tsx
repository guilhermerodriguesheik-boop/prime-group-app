
import React from 'react';
import { User, UserSession, UserRole } from '../types';
import { BigButton, Card } from '../components/UI';

interface OperationHomeProps {
  user: User;
  session: UserSession | null;
  onNavigate: (page: string) => void;
  onLogout: () => void;
}

const OperationHome: React.FC<OperationHomeProps> = ({ user, session, onNavigate, onLogout }) => {
  const isAdminTotal = user.perfil === UserRole.ADMIN;
  const isCustomAdmin = user.perfil === UserRole.CUSTOM_ADMIN;
  const isAnyAdmin = isAdminTotal || isCustomAdmin;

  const hasPermission = (pageId: string) => {
    if (isAdminTotal) return true;
    if (isCustomAdmin) return user.permissoes?.includes(pageId);
    return false;
  };

  const SectionHeader = ({ title }: { title: string }) => (
    <div className="col-span-full mt-6 mb-2">
      <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] flex items-center gap-3">
        <span className="flex-1 h-px bg-slate-800"></span>
        {title}
        <span className="flex-1 h-px bg-slate-800"></span>
      </h3>
    </div>
  );

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Session Banner */}
      <Card className={`flex flex-col md:flex-row items-center justify-between gap-6 border-l-8 ${isAnyAdmin ? 'border-l-indigo-600' : 'border-l-blue-600'}`}>
        <div>
          <h2 className="text-2xl font-bold">Painel de Controle</h2>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-slate-400">Status: <span className="text-emerald-500 font-bold uppercase text-xs">Conectado</span></span>
            <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
            <span className="text-slate-400">Perfil: <span className="text-blue-400 font-bold uppercase tracking-wider text-xs">
              {user.perfil === UserRole.CUSTOM_ADMIN ? 'Admin Personalizado' : user.perfil}
            </span></span>
          </div>
        </div>
        
        <div className="flex flex-col items-center md:items-end gap-2">
          {session ? (
            <>
              <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                <span className="text-xs text-slate-500 font-bold uppercase">Veículo Atual:</span>
                <span className="font-mono text-xl font-black text-blue-400 tracking-wider">{session.placa}</span>
              </div>
              <button onClick={() => onNavigate('select-vehicle')} className="text-xs text-blue-500 hover:underline">Trocar Veículo</button>
            </>
          ) : !isAnyAdmin && (
            <button 
              onClick={() => onNavigate('select-vehicle')}
              className="bg-yellow-600 hover:bg-yellow-500 text-white px-6 py-2 rounded-xl font-bold shadow-lg animate-pulse"
            >
              SELECIONAR PLACA
            </button>
          )}

          {isAnyAdmin && (
            <div className="text-right">
              <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Acesso Global</div>
              <div className="text-xs text-indigo-400">Admin não requer vínculo de placa</div>
            </div>
          )}
        </div>
      </Card>

      {!session && !isAnyAdmin && (
        <div className="bg-slate-900/80 p-12 rounded-2xl text-center border-2 border-dashed border-slate-800">
          <div className="text-5xl mb-4">🚛</div>
          <h3 className="text-xl font-bold text-slate-200">Veículo não selecionado</h3>
          <p className="text-slate-500 max-w-sm mx-auto mt-2">Como você é um usuário operacional, precisa selecionar um veículo para iniciar.</p>
        </div>
      )}

      {(session || isAnyAdmin) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Menu para Motoristas */}
          {user.perfil === UserRole.MOTORISTA && (
            <>
              <SectionHeader title="Minha Operação" />
              <BigButton onClick={() => onNavigate('daily-route')} icon="🛣️" variant="primary">Rota do Dia</BigButton>
              <BigButton onClick={() => onNavigate('fueling')} icon="⛽">Abastecer</BigButton>
              <BigButton onClick={() => onNavigate('maintenance')} icon="🔧" variant="secondary">Solicitar Manutenção</BigButton>
              <SectionHeader title="Histórico" />
              <BigButton onClick={() => onNavigate('my-requests')} icon="📋" variant="secondary">Minhas Solicitações</BigButton>
            </>
          )}

          {/* Menu para Ajudantes */}
          {user.perfil === UserRole.AJUDANTE && (
            <>
              <SectionHeader title="Minha Operação" />
              <BigButton onClick={() => onNavigate('route')} icon="📦">Registrar Saída</BigButton>
              <SectionHeader title="Histórico" />
              <BigButton onClick={() => onNavigate('my-routes')} icon="📋" variant="secondary">Minhas Saídas</BigButton>
            </>
          )}

          {/* Menu Organizado para Administradores (Total ou Personalizado) */}
          {isAnyAdmin && (
            <>
              {/* CATEGORIA 1: CONTROLE CRÍTICO */}
              {(hasPermission('admin-pending') || hasPermission('admin-dashboard') || hasPermission('admin-checklists') || hasPermission('admin-tracking')) && (
                <SectionHeader title="Controle & Auditoria" />
              )}
              {hasPermission('admin-pending') && <BigButton onClick={() => onNavigate('admin-pending')} icon="🔔" variant="primary">Pendências</BigButton>}
              {hasPermission('admin-tracking') && <BigButton onClick={() => onNavigate('admin-tracking')} icon="📡" variant="primary">Rastreamento</BigButton>}
              {hasPermission('admin-dashboard') && <BigButton onClick={() => onNavigate('admin-dashboard')} icon="📊" variant="secondary">Dashboard Global</BigButton>}
              {hasPermission('admin-checklists') && <BigButton onClick={() => onNavigate('admin-checklists')} icon="📸" variant="primary">Checklist Inspeções</BigButton>}

              {/* CATEGORIA 2: LANÇAMENTOS FINANCEIROS */}
              {(hasPermission('admin-create-route') || hasPermission('admin-agregado-freight') || hasPermission('admin-tolls')) && (
                <SectionHeader title="Operacional & Lançamentos" />
              )}
              {hasPermission('admin-create-route') && <BigButton onClick={() => onNavigate('admin-create-route')} icon="➕" variant="primary">Lançar Rota (Manual)</BigButton>}
              {hasPermission('admin-agregado-freight') && <BigButton onClick={() => onNavigate('admin-agregado-freight')} icon="🚛" variant="primary">Lançar Frete Agregado</BigButton>}
              {hasPermission('admin-tolls') && <BigButton onClick={() => onNavigate('admin-tolls')} icon="🛣️" variant="primary">Gestão de Pedágios</BigButton>}

              {/* CATEGORIA 3: RELATÓRIOS DE PERFORMANCE */}
              {(hasPermission('admin-consolidated-finance') || hasPermission('admin-vehicle-report') || hasPermission('admin-agregado-report') || hasPermission('admin-activity-report') || hasPermission('admin-fixed-expenses')) && (
                <SectionHeader title="Relatórios Financeiros" />
              )}
              {hasPermission('admin-consolidated-finance') && <BigButton onClick={() => onNavigate('admin-consolidated-finance')} icon="🏦" variant="success">Faturamento e Lucro Geral</BigButton>}
              {hasPermission('admin-vehicle-report') && <BigButton onClick={() => onNavigate('admin-vehicle-report')} icon="📉" variant="secondary">Desempenho Frota</BigButton>}
              {hasPermission('admin-agregado-report') && <BigButton onClick={() => onNavigate('admin-agregado-report')} icon="📈" variant="primary">Relatório Agregados</BigButton>}
              {hasPermission('admin-activity-report') && <BigButton onClick={() => onNavigate('admin-activity-report')} icon="👤" variant="primary">Relatório por Usuário</BigButton>}
              {hasPermission('admin-fixed-expenses') && <BigButton onClick={() => onNavigate('admin-fixed-expenses')} icon="💸" variant="primary">Despesas Fixas</BigButton>}

              {/* CATEGORIA 4: MANUTENÇÃO E FROTA */}
              {(hasPermission('admin-preventive') || hasPermission('admin-maintenance-history') || hasPermission('vehicle-mgmt')) && (
                <SectionHeader title="Frota & Manutenção" />
              )}
              {hasPermission('admin-preventive') && <BigButton onClick={() => onNavigate('admin-preventive')} icon="🛡️" variant="success">Preventiva Frota</BigButton>}
              {hasPermission('admin-maintenance-history') && <BigButton onClick={() => onNavigate('admin-maintenance-history')} icon="📜" variant="secondary">Histórico Manutenção</BigButton>}
              {hasPermission('vehicle-mgmt') && <BigButton onClick={() => onNavigate('vehicle-mgmt')} icon="🚛" variant="secondary">Todas as Placas</BigButton>}

              {/* CATEGORIA 5: CONFIGURAÇÕES E CADASTROS */}
              {(hasPermission('admin-agregado-mgmt') || hasPermission('admin-customers') || hasPermission('user-mgmt')) && (
                <SectionHeader title="Cadastros & Equipe" />
              )}
              {hasPermission('admin-agregado-mgmt') && <BigButton onClick={() => onNavigate('admin-agregado-mgmt')} icon="🤝" variant="primary">Cadastrar Agregado</BigButton>}
              {hasPermission('admin-customers') && <BigButton onClick={() => onNavigate('admin-customers')} icon="🏢" variant="primary">Gestão de Clientes</BigButton>}
              {hasPermission('user-mgmt') && <BigButton onClick={() => onNavigate('user-mgmt')} icon="👥" variant="secondary">Gestão de Equipe</BigButton>}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default OperationHome;
