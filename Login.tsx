
import React from 'react';

export const Logo: React.FC<{ size?: 'sm' | 'md' | 'lg', showText?: boolean }> = ({ size = 'md', showText = true }) => {
  const dimensions = {
    sm: { box: 'w-8 h-8', font: 'text-sm' },
    md: { box: 'w-12 h-12', font: 'text-xl' },
    lg: { box: 'w-24 h-24', font: 'text-3xl' }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`${dimensions[size].box} text-white`}>
        <svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M35 30C23.9543 30 15 38.9543 15 50V75H25V50C25 44.4772 29.4772 40 35 40C40.5228 40 45 44.4772 45 50V60H55V50C55 38.9543 46.0457 30 35 30Z" />
          <path d="M65 70C76.0457 70 85 61.0457 85 50V25H75V50C75 55.5228 70.5228 60 65 60C59.4772 60 55 55.5228 55 50V40H45V50C45 61.0457 53.9543 70 65 70Z" />
        </svg>
      </div>
      {showText && (
        <h1 className={`${dimensions[size].font} font-bold tracking-[0.15em] text-white uppercase`}>
          PRIME <span className="font-light opacity-80">GROUP</span>
        </h1>
      )}
    </div>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`bg-slate-900/50 border border-slate-800 rounded-2xl p-6 shadow-xl ${className}`}>
    {children}
  </div>
);

export const BigButton: React.FC<{ 
  onClick: () => void; 
  children: React.ReactNode; 
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  icon?: React.ReactNode;
  disabled?: boolean;
}> = ({ onClick, children, variant = 'primary', icon, disabled }) => {
  const styles = {
    primary: 'bg-blue-700 hover:bg-blue-600 border-blue-600 text-white shadow-blue-900/20',
    secondary: 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-100',
    danger: 'bg-red-700 hover:bg-red-600 border-red-600 text-white',
    success: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white'
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      className={`w-full p-6 text-xl font-bold rounded-2xl border-b-4 flex flex-col items-center justify-center gap-3 transition-all active:translate-y-1 active:border-b-0 disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]}`}
    >
      {icon && <div className="text-3xl">{icon}</div>}
      {children}
    </button>
  );
};

export const Input: React.FC<{
  label: string;
  type?: string;
  value: string | number;
  onChange: (val: any) => void;
  required?: boolean;
  placeholder?: string;
}> = ({ label, type = 'text', value, onChange, required, placeholder }) => (
  <div className="mb-4">
    <label className="block text-slate-400 text-sm font-medium mb-1.5 uppercase tracking-wider">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-700"
    />
  </div>
);

export const Select: React.FC<{
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
  required?: boolean;
}> = ({ label, value, options, onChange, required }) => (
  <div className="mb-4">
    <label className="block text-slate-400 text-sm font-medium mb-1.5 uppercase tracking-wider">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-slate-50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all appearance-none"
    >
      <option value="">Selecione...</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);

export const Badge: React.FC<{ children: React.ReactNode; status: string }> = ({ children, status }) => {
  const getColors = () => {
    switch(status.toLowerCase()) {
      case 'pendente': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'aprovado': 
      case 'feita': 
      case 'finalizada': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'rejeitado':
      case 'reprovada':
      case 'cancelada': return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'assumida':
      case 'em_rota':
      case 'rodando': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'em_execucao': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default: return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
    }
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border uppercase tracking-widest ${getColors()}`}>
      {children}
    </span>
  );
};
