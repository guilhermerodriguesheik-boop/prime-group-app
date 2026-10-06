import { login, signup } from "@/app/auth/actions";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>Prime Finance</strong>
            <small>acesso seguro</small>
          </div>
        </div>
        <h1>Entrar</h1>
        <p className="metric-foot">Use sua conta para acessar os dados financeiros protegidos por RLS.</p>

        {params.error ? <div className="auth-message error">{params.error}</div> : null}
        {params.message ? <div className="auth-message">{params.message}</div> : null}

        <form className="auth-form">
          <label>
            Nome
            <input name="full_name" placeholder="Seu nome" autoComplete="name" />
          </label>
          <label>
            Email
            <input name="email" type="email" required placeholder="voce@empresa.com" autoComplete="email" />
          </label>
          <label>
            Senha
            <input name="password" type="password" required minLength={8} autoComplete="current-password" />
          </label>
          <div className="auth-actions">
            <button formAction={login} className="button primary">Entrar</button>
            <button formAction={signup} className="button">Criar conta</button>
          </div>
        </form>
      </div>
    </div>
  );
}
