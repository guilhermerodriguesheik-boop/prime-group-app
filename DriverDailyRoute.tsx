
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { Card, Badge, Input, Select, BigButton } from '../components/UI';

interface UserMgmtProps {
  users: User[];
  setUsers: React.Dispatch<React.SetStateAction<User[]>>;
  onBack: () => void;
}

const AVAILABLE_PERMISSIONS = [
  { id: 'admin-dashboard', label: 'Dashboard Global' },
  { id: 'admin-pending', label: 'Pendências' },
  { id: 'admin-tracking', label: 'Rastreamento de Frota' },
  { id: 'admin-checklists', label: 'Checklist Inspeções' },
  { id: 'admin-create-route', label: 'Lançar Rota (Manual)' },
  { id: 'admin-agregado-freight', label: 'Lançar Frete Agregado' },
  { id: 'admin-tolls', label: 'Gestão de Pedágios' },
  { id: 'admin-consolidated-finance', label: 'Faturamento e Lucro Geral' },
  { id: 'admin-vehicle-report', label: 'Desempenho Frota' },
  { id: 'admin-agregado-report', label: 'Relatório Agregados' },
  { id: 'admin-activity-report', label: 'Relatório por Usuário' },
  { id: 'admin-fixed-expenses', label: 'Despesas Fixas' },
  { id: 'admin-preventive', label: 'Preventiva Frota' },
  { id: 'admin-maintenance-history', label: 'Histórico Manutenção' },
  { id: 'vehicle-mgmt', label: 'Todas as Placas' },
  { id: 'admin-agregado-mgmt', label: 'Cadastrar Agregado' },
  { id: 'admin-customers', label: 'Gestão de Clientes' },
  { id: 'user-mgmt', label: 'Gestão de Equipe' },
];

const UserManagement: React.FC<UserMgmtProps> = ({ users, setUsers, onBack }) => {
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [perfil, setPerfil] = useState<UserRole>(UserRole.MOTORISTA);
  const [senha, setSenha] = useState('');
  const [permissoes, setPermissoes] = useState<string[]>([]);

  const resetForm = () => {
    setNome('');
    setEmail('');
    setPerfil(UserRole.MOTORISTA);
    setSenha('');
    setPermissoes([]);
    setEditingUser(null);
    setShowForm(false);
  };

  const handleEditClick = (user: User) => {
    setEditingUser(user);
    setNome(user.nome);
    setEmail(user.email);
    setPerfil(user.perfil);
    setSenha(user.senha || '');
    setPermissoes(user.permissoes || []);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const togglePermission = (permId: string) => {
    setPermissoes(prev => 
      prev.includes(permId) ? prev.filter(p => p !== permId) : [...prev, permId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome || !senha) return alert('Nome e Senha são obrigatórios');

    if (editingUser) {
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { 
        ...u, 
        nome, 
        email, 
        perfil, 
        senha,
        permissoes: perfil === UserRole.CUSTOM_ADMIN ? permissoes : undefined
      } : u));
    } else {
      const newUser: User = {
        id: crypto.randomUUID(),
        nome,
        email,
        senha,
        perfil,
        ativo: true,
        permissoes: perfil === UserRole.CUSTOM_ADMIN ? permissoes : undefined
      };
      setUsers(prev => [...prev, newUser]);
    }

    resetForm();
  };

  const toggleUserStatus = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ativo: !u.ativo } : u));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-100 tracking-tight">Gestão de Equipe</h2>
          <p className="text-slate-500 text-sm">Controle de acessos e senhas do PRIME GROUP</p>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={() => { if(showForm) resetForm(); else setShowForm(true); }} 
            className={`px-4 py-2 rounded-lg font-bold transition-all ${showForm ? 'bg-red-900/40 text-red-400 border border-red-900/50' : 'bg-blue-700 text-white shadow-lg shadow-blue-900/20'}`}
          >
            {showForm ? 'Cancelar' : '+ Novo Cadastro'}
          </button>
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg font-bold">Voltar</button>
        </div>
      </div>

      {showForm && (
        <Card className="border-blue-900/50 animate-slideDown shadow-2xl shadow-blue-900/10">
          <h3 className="text-lg font-bold mb-6 text-blue-400 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            {editingUser ? `Editando: ${editingUser.nome}` : 'Formulário de Cadastro'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Nome Completo" value={nome} onChange={setNome} required placeholder="Ex: Lucas Silva" />
              <Input label="Email / Login" value={email} onChange={setEmail} placeholder="Ex: lucas@prime.com" />
              <Select 
                label="Perfil de Acesso" 
                value={perfil} 
                onChange={(v) => setPerfil(v as UserRole)} 
                options={[
                  { label: 'Administrador Total', value: UserRole.ADMIN },
                  { label: 'Administrador Personalizado', value: UserRole.CUSTOM_ADMIN },
                  { label: 'Motorista', value: UserRole.MOTORISTA },
                  { label: 'Ajudante', value: UserRole.AJUDANTE },
                ]}
                required
              />
              <Input label="Senha de Acesso" type="text" value={senha} onChange={setSenha} required placeholder="Mínimo 4 caracteres" />
            </div>

            {perfil === UserRole.CUSTOM_ADMIN && (
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-4">
                <h4 className="text-xs font-black text-blue-500 uppercase tracking-widest border-b border-slate-800 pb-2">Definir Permissões de Acesso</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AVAILABLE_PERMISSIONS.map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800 rounded-xl cursor-pointer hover:bg-slate-800 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={permissoes.includes(p.id)} 
                        onChange={() => togglePermission(p.id)}
                        className="w-5 h-5 rounded border-slate-700 bg-slate-950 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-xs font-bold text-slate-300">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex gap-3 pt-4">
              <div className="flex-1">
                <BigButton onClick={() => {}} variant={editingUser ? "primary" : "success"}>
                  {editingUser ? 'SALVAR ALTERAÇÕES' : 'CADASTRAR USUÁRIO'}
                </BigButton>
              </div>
              {editingUser && (
                <button 
                  type="button"
                  onClick={resetForm}
                  className="px-6 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold transition-colors"
                >
                  Descartar
                </button>
              )}
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.sort((a,b) => a.nome.localeCompare(b.nome)).map(u => (
          <Card key={u.id} className={`flex flex-col gap-4 group transition-all border-l-4 ${u.ativo ? 'border-l-blue-600' : 'border-l-red-900'}`}>
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-950 rounded-full flex items-center justify-center font-bold text-slate-500 border border-slate-800">
                  {u.nome.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-slate-100 group-hover:text-blue-400 transition-colors">{u.nome}</div>
                  <div className="text-[10px] text-slate-500 font-black uppercase tracking-[0.1em]">
                    {u.perfil === UserRole.CUSTOM_ADMIN ? 'Admin Personalizado' : u.perfil}
                  </div>
                </div>
              </div>
              <Badge status={u.ativo ? 'rodando' : 'rejeitado'}>
                {u.ativo ? 'Ativo' : 'Inativo'}
              </Badge>
            </div>

            {u.perfil === UserRole.CUSTOM_ADMIN && (
              <div className="text-[10px] text-slate-500 italic">
                {u.permissoes?.length || 0} abas permitidas
              </div>
            )}

            <div className="bg-slate-950 p-2 rounded border border-slate-800 flex justify-between items-center">
               <span className="text-[9px] text-slate-600 font-bold uppercase">Senha:</span>
               <span className="text-xs font-mono text-slate-300">{u.senha}</span>
            </div>

            <div className="flex gap-2 mt-auto pt-2 border-t border-slate-800">
              <button 
                onClick={() => handleEditClick(u)}
                className="flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest bg-blue-900/20 text-blue-400 hover:bg-blue-900/40 rounded transition-colors"
              >
                Editar / Senha
              </button>
              <button 
                onClick={() => toggleUserStatus(u.id)}
                className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded transition-colors ${u.ativo ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-emerald-900/20 text-emerald-400 hover:bg-emerald-900/40'}`}
              >
                {u.ativo ? 'Desativar' : 'Reativar'}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default UserManagement;
