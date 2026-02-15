import React, { useState, useMemo } from 'react';
import { FixedExpense } from '../types';
import { Card, Input, Select, BigButton } from '../components/UI';

interface AdminFixedExpensesProps {
  fixedExpenses: FixedExpense[];
  onUpdateExpenses: (expenses: FixedExpense[]) => void;
  onBack: () => void;
}

const AdminFixedExpenses: React.FC<AdminFixedExpensesProps> = ({ fixedExpenses, onUpdateExpenses, onBack }) => {
  const [categoria, setCategoria] = useState<FixedExpense['categoria']>('outros');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!descricao || !valor || !mes) return;

    const newExpense: FixedExpense = {
      id: crypto.randomUUID(),
      categoria,
      descricao,
      valor: Number(valor),
      dataCompetencia: mes,
      createdAt: new Date().toISOString()
    };

    onUpdateExpenses([newExpense, ...fixedExpenses]);
    setDescricao('');
    setValor('');
  };

  const handleRemoveExpense = (id: string) => {
    if (confirm("Deseja remover este custo estrutural?")) {
      onUpdateExpenses(fixedExpenses.filter(e => e.id !== id));
    }
  };

  const filteredExpenses = useMemo(() => {
    return fixedExpenses
      .filter(e => e.dataCompetencia === mes)
      .sort((a, b) => b.valor - a.valor);
  }, [fixedExpenses, mes]);

  // Fixed: Changed definition to () => since it is called without arguments and the previous parameter was unused
  const totalMensal = () => filteredExpenses.reduce((sum, e) => sum + e.valor, 0);

  const categoriasLabels = {
    funcionario: 'Funcionário / Equipe',
    contador: 'Contador / Assessoria',
    manobra: 'Manobra / Pátio',
    sistema: 'Sistema / Software',
    imposto: 'Impostos / Taxas',
    outros: 'Outras Despesas'
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Custos Estruturais (Fixos)</h2>
          <p className="text-slate-500">Despesas mensais de administração e pátio</p>
        </div>
        <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl font-bold border border-slate-700">
          Voltar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulário */}
        <div className="lg:col-span-1">
          <Card className="border-indigo-900/30 sticky top-24">
            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-6">Novo Lançamento</h3>
            <form onSubmit={handleAddExpense} className="space-y-4">
              <Select 
                label="Categoria" 
                value={categoria} 
                onChange={(v) => setCategoria(v as any)}
                options={Object.entries(categoriasLabels).map(([val, lab]) => ({ label: lab, value: val }))}
                required
              />
              <Input 
                label="Mês de Competência" 
                type="month" 
                value={mes} 
                onChange={setMes} 
                required 
              />
              <Input 
                label="Descrição" 
                value={descricao} 
                onChange={setDescricao} 
                required 
                placeholder="Ex: Salário Administração" 
              />
              <Input 
                label="Valor (R$)" 
                type="number" 
                value={valor} 
                onChange={setValor} 
                required 
                placeholder="0.00" 
              />
              <div className="pt-2">
                <BigButton onClick={() => {}} variant="primary" disabled={!descricao || !valor}>
                   LANÇAR DESPESA
                </BigButton>
              </div>
            </form>
          </Card>
        </div>

        {/* Lista e Filtro */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
             <div className="flex items-center gap-4">
               <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Filtrar Mês:</span>
               <input 
                type="month" 
                value={mes} 
                onChange={(e) => setMes(e.target.value)} 
                className="bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white"
               />
             </div>
             <div className="text-right">
                <div className="text-[10px] font-black text-red-500 uppercase">Total do Mês</div>
                <div className="text-xl font-black text-white">R$ {totalMensal().toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
             </div>
          </div>

          <div className="space-y-3">
            {filteredExpenses.length === 0 ? (
              <div className="py-20 text-center text-slate-600 border border-dashed border-slate-800 rounded-2xl italic">
                Nenhuma despesa fixa lançada para este mês.
              </div>
            ) : (
              filteredExpenses.map((expense) => (
                <Card key={expense.id} className="flex items-center justify-between gap-4 hover:border-slate-700 transition-all py-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-950 rounded-xl flex items-center justify-center text-xl shadow-inner border border-slate-800">
                      {expense.categoria === 'funcionario' ? '👥' : 
                       expense.categoria === 'contador' ? '📑' : 
                       expense.categoria === 'manobra' ? '🚜' : 
                       expense.categoria === 'sistema' ? '💻' : 
                       expense.categoria === 'imposto' ? '🏛️' : '💰'}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-100">{expense.descricao}</div>
                      <div className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                        {categoriasLabels[expense.categoria]}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-sm font-black text-slate-200">
                      R$ {expense.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                    <button 
                      onClick={() => handleRemoveExpense(expense.id)}
                      className="text-red-900 hover:text-red-500 transition-colors p-2"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminFixedExpenses;