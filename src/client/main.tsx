import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { fetchMetadata, parseAuditDonePayload } from './api';
import type { AppMetadata, Audit, Recommendation } from '../lib/schemas';
import type { ChatMessage, UiStatus } from './types';

const exampleUrl = 'https://apps.apple.com/us/app/spotify-music-and-podcasts/id324684580';

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function formatInteger(value: number | null): string {
  return typeof value === 'number' ? new Intl.NumberFormat().format(value) : 'n/a';
}

function StatusBadge({ status }: { status: UiStatus }) {
  return <div className="status">{status}</div>;
}

function TextBubble({ role, text }: { role: 'assistant' | 'user'; text: string }) {
  return <article className={`bubble ${role}`}>{text}</article>;
}

function ConfirmationCard({
  metadata,
  disabled,
  onCancel,
  onConfirm
}: {
  metadata: AppMetadata;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <article className="bubble assistant confirmation">
      {metadata.iconUrl ? <img src={metadata.iconUrl} alt={`${metadata.name} app icon`} /> : <div className="iconFallback" />}
      <div>
        <p className="eyebrow">Is this the app you meant?</p>
        <h2>{metadata.name}</h2>
        <dl>
          <div>
            <dt>Developer</dt>
            <dd>{metadata.developer}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{metadata.category}</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{metadata.country.toUpperCase()}</dd>
          </div>
        </dl>
        <div className="actions">
          <button className="secondary" disabled={disabled} type="button" onClick={onCancel}>
            No, try another
          </button>
          <button disabled={disabled} type="button" onClick={onConfirm}>
            Yes, run audit
          </button>
        </div>
      </div>
    </article>
  );
}

function DimensionRow({ label, score }: { label: string; score: number }) {
  return (
    <div className="dimension">
      <strong>{label}</strong>
      <div className="bar" style={{ '--value': score } as React.CSSProperties}>
        <span />
      </div>
      <span>{score}/10</span>
    </div>
  );
}

function RecommendationCard({ item }: { item: Recommendation }) {
  return (
    <article className="rec">
      <strong>{item.title}</strong>
      <p className="meta">
        {item.impact} impact / {item.effort} effort
      </p>
      <p>{item.action}</p>
      <p className="meta">Evidence: {item.evidence}</p>
      {(item.before || item.after) && (
        <div className="before-after">
          <div>
            <span className="meta">Before</span>
            <p>{item.before || 'n/a'}</p>
          </div>
          <div>
            <span className="meta">After</span>
            <p>{item.after || 'n/a'}</p>
          </div>
        </div>
      )}
    </article>
  );
}

function RecommendationSection({ title, items }: { title: string; items: Recommendation[] }) {
  return (
    <section className="section">
      <h3>{title}</h3>
      <div className="cards">
        {items.map((item) => (
          <RecommendationCard key={`${title}-${item.title}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function AuditResult({ metadata, audit }: { metadata: AppMetadata; audit: Audit }) {
  const competitorRows = useMemo(
    () =>
      audit.competitors.map((competitor) => (
        <tr key={competitor.appId}>
          <td>{competitor.name}</td>
          <td>{competitor.developer}</td>
          <td>{competitor.rating?.toFixed(2) ?? 'n/a'}</td>
          <td>{formatInteger(competitor.ratingCount)}</td>
          <td>{competitor.screenshots}</td>
        </tr>
      )),
    [audit.competitors]
  );

  return (
    <article className="bubble assistant auditBubble">
      <div className="audit">
        <section className="score-hero">
          <div className="score-ring" style={{ '--score': audit.overallScore } as React.CSSProperties}>
            {audit.overallScore}
          </div>
          <div>
            <p className="eyebrow">ASO Score Card</p>
            <h2>{metadata.name}</h2>
            <p>
              {metadata.developer} · {metadata.category} · {metadata.country.toUpperCase()}
            </p>
          </div>
        </section>

        <section className="section">
          {audit.dimensions.map((dimension) => (
            <DimensionRow key={dimension.key} label={dimension.label} score={dimension.score} />
          ))}
        </section>

        <RecommendationSection title="Quick Wins" items={audit.quickWins} />
        <RecommendationSection title="High-Impact Changes" items={audit.highImpactChanges} />
        <RecommendationSection title="Strategic Recommendations" items={audit.strategicRecommendations} />

        <section className="section">
          <h3>Competitor Comparison</h3>
          <p className="meta">{audit.competitorNotes}</p>
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>App</th>
                  <th>Developer</th>
                  <th>Rating</th>
                  <th>Ratings</th>
                  <th>Screenshots</th>
                </tr>
              </thead>
              <tbody>{competitorRows}</tbody>
            </table>
          </div>
        </section>
      </div>
    </article>
  );
}

function App() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<UiStatus>('Ready');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: newId('message'), role: 'assistant', kind: 'text', text: 'Paste an Apple App Store listing URL to start.' }
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const activeStream = useRef<EventSource | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(
    () => () => {
      activeStream.current?.close();
    },
    []
  );

  function appendMessage(message: ChatMessage): void {
    setMessages((current) => [...current, message]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl || status !== 'Ready') return;

    appendMessage({ id: newId('message'), role: 'user', kind: 'text', text: trimmedUrl });
    setStatus('Fetching');

    try {
      const payload = await fetchMetadata(trimmedUrl);
      setActiveSessionId(payload.sessionId);
      appendMessage({
        id: newId('confirm'),
        role: 'assistant',
        kind: 'confirmation',
        metadata: payload.metadata,
        sessionId: payload.sessionId
      });
      setUrl('');
      setStatus('Confirm');
    } catch (error) {
      appendMessage({
        id: newId('error'),
        role: 'assistant',
        kind: 'text',
        text: error instanceof Error ? error.message : 'Could not fetch metadata.'
      });
      setStatus('Ready');
    }
  }

  function cancelConfirmation(messageId: string): void {
    setMessages((current) => current.filter((message) => message.id !== messageId));
    setActiveSessionId(null);
    setStatus('Ready');
    appendMessage({ id: newId('message'), role: 'assistant', kind: 'text', text: 'Paste the correct App Store URL when ready.' });
  }

  function runAudit(sessionId: string): void {
    if (status === 'Auditing') return;
    setStatus('Auditing');
    appendMessage({
      id: newId('message'),
      role: 'assistant',
      kind: 'text',
      text: 'Running the audit. I will keep you posted as each step finishes.'
    });

    activeStream.current?.close();
    const stream = new EventSource(`/api/audit/stream?sessionId=${encodeURIComponent(sessionId)}`);
    activeStream.current = stream;

    stream.addEventListener('progress', (event) => {
      const payload = JSON.parse(event.data) as { message: string };
      appendMessage({ id: newId('progress'), role: 'assistant', kind: 'text', text: payload.message });
    });

    stream.addEventListener('done', (event) => {
      const payload = parseAuditDonePayload(event.data);
      appendMessage({ id: newId('audit'), role: 'assistant', kind: 'audit', ...payload });
      setActiveSessionId(null);
      setStatus('Ready');
      stream.close();
    });

    stream.addEventListener('error', (event) => {
      if (event instanceof MessageEvent && event.data) {
        const payload = JSON.parse(event.data) as { message: string };
        appendMessage({ id: newId('error'), role: 'assistant', kind: 'text', text: payload.message });
      } else {
        appendMessage({ id: newId('error'), role: 'assistant', kind: 'text', text: 'The audit stream disconnected.' });
      }
      setActiveSessionId(null);
      setStatus('Ready');
      stream.close();
    });
  }

  return (
    <main className="shell">
      <section className="chat">
        <header className="topbar">
          <div>
            <h1>ASO Audit Agent</h1>
            <p>Paste an Apple App Store URL, confirm the app, and get a prioritized audit.</p>
          </div>
          <StatusBadge status={status} />
        </header>

        <div className="messages" ref={scrollRef} aria-live="polite">
          {messages.map((message) => {
            if (message.kind === 'text') {
              return <TextBubble key={message.id} role={message.role} text={message.text} />;
            }
            if (message.kind === 'confirmation') {
              return (
                <ConfirmationCard
                  key={message.id}
                  metadata={message.metadata}
                  disabled={status === 'Auditing' || activeSessionId !== message.sessionId}
                  onCancel={() => cancelConfirmation(message.id)}
                  onConfirm={() => runAudit(message.sessionId)}
                />
              );
            }
            return <AuditResult key={message.id} metadata={message.metadata} audit={message.audit} />;
          })}
        </div>

        <form className="composer" onSubmit={handleSubmit}>
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            type="url"
            placeholder={exampleUrl}
            autoComplete="off"
            required
            disabled={status === 'Fetching' || status === 'Auditing'}
          />
          <button type="submit" disabled={status !== 'Ready'}>
            Audit
          </button>
        </form>
      </section>
    </main>
  );
}

const root = document.querySelector('#root');
if (!root) {
  throw new Error('React root element was not found.');
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
