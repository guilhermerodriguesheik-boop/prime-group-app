import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Container, Mail, MapPin, MoveUpRight, PackageCheck, Truck } from "lucide-react";

export const metadata: Metadata = {
  description: "Conheça a Prime Group, transportadora com base em Duque de Caxias, RJ. Transporte rodoviário de cargas, coleta, distribuição e fretes.",
};

const email = "logistica.primegroup@gmail.com";

export default function EmpresaPage() {
  return (
    <main>
      <section className="pg-hero">
        <div className="pg-container pg-hero-grid">
          <div className="pg-hero-content">
            <span className="pg-eyebrow"><span className="pg-status-dot" /> TRANSPORTE E LOGÍSTICA NO RIO DE JANEIRO</span>
            <h1>Compromisso com a sua carga. <span>Foco na sua operação.</span></h1>
            <p>
              A Prime Group atua no transporte rodoviário de cargas, com soluções para coleta,
              distribuição e operações de frete, a partir de Duque de Caxias, no Rio de Janeiro.
            </p>
            <div className="pg-hero-actions">
              <a className="pg-button pg-button-primary" href={"mailto:"+email+"?subject=Cota%C3%A7%C3%A3o%20de%20transporte%20-%20Prime%20Group"}>
                Solicitar contato comercial <ArrowRight size={18} aria-hidden />
              </a>
              <Link className="pg-button pg-button-secondary" href="#servicos">
                Conhecer serviços
              </Link>
            </div>
            <div className="pg-hero-meta">
              <div><CheckCircle2 size={18} aria-hidden /> Empresa registrada no Brasil</div>
              <div><MapPin size={18} aria-hidden /> Duque de Caxias, RJ</div>
            </div>
          </div>
          <div className="pg-hero-visual" aria-hidden="true">
            <div className="pg-visual-grid" />
            <div className="pg-road-track" />
            <div className="pg-visual-center">
              <div className="pg-visual-truck"><Truck size={104} strokeWidth={1.2} /></div>
              <div className="pg-visual-title">PRIME GROUP</div>
              <div className="pg-visual-subtitle">MOVENDO OPERAÇÕES</div>
            </div>
            <div className="pg-visual-chip pg-chip-top"><PackageCheck size={20} /> COLETA &amp; DISTRIBUIÇÃO</div>
            <div className="pg-visual-chip pg-chip-bottom"><MapPin size={18} /> BASE NO RIO DE JANEIRO</div>
          </div>
        </div>
      </section>

      <section className="pg-overview" id="sobre">
        <div className="pg-container pg-overview-grid">
          <div>
            <div className="pg-section-label">QUEM SOMOS</div>
            <h2>Uma empresa de transporte voltada à rotina de quem precisa entregar.</h2>
          </div>
          <div>
            <p>
              A <strong>Prime Group Representações e Logística Ltda.</strong> tem sede em Duque de
              Caxias, RJ, e atua no setor de transporte e logística. Nosso trabalho envolve
              operações de frete e movimentação rodoviária de cargas.
            </p>
            <p>
              Para avaliar um atendimento, envie as informações básicas da carga, origem,
              destino e prazo. Nossa equipe poderá analisar a solicitação comercial.
            </p>
          </div>
        </div>
      </section>

      <section className="pg-services" id="servicos">
        <div className="pg-container">
          <div className="pg-section-heading">
            <div>
              <div className="pg-section-label">O QUE FAZEMOS</div>
              <h2>Soluções para o transporte de cargas</h2>
            </div>
            <p>Atendimento comercial mediante disponibilidade operacional e características da carga.</p>
          </div>
          <div className="pg-service-grid">
            <article className="pg-service-card">
              <div className="pg-service-icon"><Truck size={28}/></div>
              <h3>Transporte rodoviário</h3>
              <p>Operações de frete para movimentação de mercadorias, com avaliação de rota, carga e prazo.</p>
              <span>LOGÍSTICA DE CARGAS <MoveUpRight size={16}/></span>
            </article>
            <article className="pg-service-card">
              <div className="pg-service-icon"><PackageCheck size={28}/></div>
              <h3>Coleta e distribuição</h3>
              <p>Suporte ao planejamento de coletas e entregas de acordo com as necessidades de cada operação.</p>
              <span>COLETAS E ENTREGAS <MoveUpRight size={16}/></span>
            </article>
            <article className="pg-service-card">
              <div className="pg-service-icon"><Container size={28}/></div>
              <h3>Operações dedicadas</h3>
              <p>Discussão de alternativas de transporte para demandas recorrentes e entregas programadas.</p>
              <span>CONSULTE DISPONIBILIDADE <MoveUpRight size={16}/></span>
            </article>
          </div>
        </div>
      </section>

      <section className="pg-contact" id="contato">
        <div className="pg-container pg-contact-content">
          <div>
            <div className="pg-section-label">CONTATO COMERCIAL</div>
            <h2>Vamos conversar sobre sua operação?</h2>
            <p>Envie uma mensagem com a origem, o destino e os detalhes da carga.</p>
          </div>
          <a className="pg-contact-email" href={"mailto:"+email}>
            <Mail size={24} aria-hidden />
            <span><small>E-MAIL COMERCIAL</small><strong>{email}</strong></span>
            <ArrowRight size={21} aria-hidden />
          </a>
        </div>
      </section>
    </main>
  );
}
