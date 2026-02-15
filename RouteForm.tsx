
import React, { useState } from 'react';
import { Card } from '../components/UI';

const TechnicalDocs: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<'sql' | 'terminal' | 'playstore'>('terminal');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const commands = [
    { cmd: "npm install", desc: "Baixa as ferramentas do Capacitor" },
    { cmd: "npm run android:init", desc: "Cria a pasta do projeto Android" },
    { cmd: "npm run android:sync", desc: "Sincroniza o código com o celular" },
    { cmd: "npm run android:open", desc: "Abre o Android Studio para gerar o App" }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 animate-fadeIn">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Console de Publicação</h2>
          <p className="text-slate-500">Transforme este código em um instalador (.AAB / .APK)</p>
        </div>
        <button onClick={onBack} className="bg-slate-800 px-6 py-2 rounded-xl font-bold border border-slate-700">Voltar</button>
      </div>

      <div className="flex gap-2 p-1 bg-slate-900 rounded-xl w-fit">
        <button onClick={() => setTab('terminal')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === 'terminal' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>1. Terminal (Node)</button>
        <button onClick={() => setTab('playstore')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === 'playstore' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>2. Google Play</button>
        <button onClick={() => setTab('sql')} className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab === 'sql' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Banco SQL</button>
      </div>

      {tab === 'terminal' && (
        <section className="space-y-6 animate-slideDown">
          <div className="bg-indigo-900/10 border border-indigo-900/30 p-4 rounded-xl">
            <h4 className="text-indigo-400 font-bold text-sm mb-2">Comandos para o seu Terminal</h4>
            <p className="text-xs text-slate-400">Certifique-se de estar na pasta do projeto no seu PC.</p>
          </div>

          <div className="space-y-3">
            {commands.map((c, i) => (
              <div key={i} className="flex items-center gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800 group hover:border-indigo-500 transition-all">
                <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-xs font-black text-slate-500 border border-slate-800">{i+1}</div>
                <div className="flex-1">
                  <code className="text-indigo-400 font-mono text-sm">{c.cmd}</code>
                  <p className="text-[10px] text-slate-500 uppercase font-bold mt-1">{c.desc}</p>
                </div>
                <button onClick={() => copyToClipboard(c.cmd)} className="opacity-0 group-hover:opacity-100 bg-slate-800 px-3 py-1 rounded text-[10px] font-bold text-white transition-all">Copiar</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'playstore' && (
        <section className="space-y-4 animate-slideDown">
          <Card className="border-emerald-900/30">
            <h3 className="text-xl font-bold text-emerald-400 mb-4">Finalizando o App</h3>
            <div className="space-y-4 text-sm text-slate-300">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <strong>Importante:</strong> Você precisa ter o <a href="https://developer.android.com/studio" target="_blank" className="text-blue-400 underline">Android Studio</a> instalado.
              </div>
              <p>Ao rodar o comando <code>npm run android:open</code>, o Android Studio abrirá o projeto automaticamente.</p>
              <p>Lá dentro, vá em: <strong>Build > Generate Signed Bundle / APK</strong> para criar o arquivo oficial da Play Store.</p>
            </div>
          </Card>
        </section>
      )}

      {tab === 'sql' && (
        <section className="space-y-4 animate-slideDown">
          <Card className="bg-slate-950 p-6">
            <pre className="text-[10px] text-slate-400 font-mono overflow-x-auto leading-relaxed">
{`CREATE TYPE user_role AS ENUM ('admin', 'custom_admin', 'motorista', 'ajudante');
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE,
  perfil user_role NOT NULL,
  ativo BOOLEAN DEFAULT true
);`}
            </pre>
          </Card>
        </section>
      )}
    </div>
  );
};

export default TechnicalDocs;
