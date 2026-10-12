import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArrowUp, Check, CircleHelp, Compass, Lightbulb, Plus, Sparkles, WandSparkles, WifiOff } from 'lucide-react';
import { useHealthCheck } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient();

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type Message = ChatMessage & { id: number };
type StreamEvent = { content?: string; done?: boolean; error?: string };

const prompts = [
  { label: 'Help me make a tricky decision', icon: Compass },
  { label: 'Explain something in plain English', icon: Lightbulb },
  { label: 'Give me a fresh perspective on a problem', icon: CircleHelp },
  { label: 'Help me get started on a blank page', icon: WandSparkles },
];

function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState('');
  const { data: health, isError: healthError, isLoading: healthLoading } = useHealthCheck();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const idRef = useRef(0);
  const retryMessagesRef = useRef<ChatMessage[]>([]);
  const assistantIdRef = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [draft]);

  const runStream = useCallback(async (payload: ChatMessage[], assistantId: number) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    retryMessagesRef.current = payload;
    assistantIdRef.current = assistantId;
    setStreaming(true);
    setError('');
    setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: '' } : message));

    try {
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ messages: payload }),
        credentials: 'include',
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = '';
        try {
          const body = await response.json() as { error?: string };
          detail = body.error || '';
        } catch {
          detail = '';
        }
        throw new Error(detail || `The assistant couldn't respond (${response.status}). Please try again.`);
      }
      if (!response.body) throw new Error('The response stream was unavailable. Please try again.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finished = false;
      const consume = (raw: string) => {
        const dataLines = raw.split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim());
        if (!dataLines.length) return;
        const data = dataLines.join('\n');
        if (data === '[DONE]') {
          finished = true;
          return;
        }
        let event: StreamEvent;
        try {
          event = JSON.parse(data) as StreamEvent;
        } catch {
          return;
        }
        if (event.done) {
          finished = true;
          return;
        }
        if (event.error) {
          setError(event.error);
          finished = true;
          return;
        }
        if (typeof event.content === 'string') {
          setMessages((current) => current.map((message) =>
            message.id === assistantId ? { ...message, content: message.content + event.content } : message,
          ));
        }
      };

      while (!finished) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const event of events) consume(event);
        if (done) {
          if (buffer.trim()) consume(buffer);
          break;
        }
      }
      if (!finished) throw new Error('The response ended before it was complete. You can try again.');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError(caught instanceof Error ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setStreaming(false);
      }
    }
  }, []);

  const submit = (event?: FormEvent<HTMLFormElement>, suggestedText?: string) => {
    event?.preventDefault();
    const content = (suggestedText ?? draft).trim();
    if (!content || streaming) return;
    const userMessage: Message = { id: ++idRef.current, role: 'user', content };
    const assistantMessage: Message = { id: ++idRef.current, role: 'assistant', content: '' };
    const payload: ChatMessage[] = [...messages.map(({ role, content: text }) => ({ role, content: text })), { role: 'user', content }];
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setDraft('');
    setError('');
    runStream(payload, assistantMessage.id);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const startNewChat = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
    setMessages([]);
    setDraft('');
    setError('');
    retryMessagesRef.current = [];
    assistantIdRef.current = null;
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const retry = () => {
    const assistantId = assistantIdRef.current;
    if (assistantId === null || !retryMessagesRef.current.length) return;
    runStream(retryMessagesRef.current, assistantId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const serviceStatus = healthLoading
    ? 'Checking connection'
    : healthError
      ? 'Connection unavailable'
      : error
        ? 'AI service is busy'
      : health?.status?.toLowerCase() === 'ok'
        ? 'Ready to help'
        : 'Assistant ready';

  return (
    <main className="app-shell" data-testid="chat-app">
      <aside className="side-rail" aria-label="Chat controls">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><Sparkles size={17} strokeWidth={1.8} /></div>
          <div>
            <div className="brand-name" data-testid="text-brand">Morrow</div>
            <div className="brand-tagline">A little help, right now</div>
          </div>
        </div>
        <button className="new-chat" type="button" onClick={startNewChat} data-testid="button-new-chat">
          <Plus size={16} strokeWidth={2.2} />
          <span>New chat</span>
        </button>
        <div className="rail-note">
          <div className="rail-status" data-testid="status-assistant">
            {healthError || error ? <WifiOff size={13} /> : <span className="status-dot" />}
            <span>{serviceStatus}</span>
          </div>
          <p className="rail-caption">Ask anything. Start wherever you are.</p>
        </div>
      </aside>

      <section className="main-panel" aria-label="Conversation">
        <header className="topbar">
          <div className="topbar-left">
            <button className="mobile-new" type="button" onClick={startNewChat} aria-label="Start a new chat" data-testid="button-new-chat-mobile">
              <Plus size={17} />
            </button>
            <div className="topbar-label" data-testid="text-page-title">A clear head starts here</div>
          </div>
          <div className="topbar-right" data-testid="text-response-mode">JUST YOU &amp; A GOOD ANSWER</div>
        </header>

        <div className="conversation-area">
          {messages.length === 0 ? (
            <section className="welcome-wrap" aria-labelledby="welcome-title" data-testid="empty-chat">
              <div className="welcome-kicker"><span>YOUR THINKING PARTNER</span></div>
              <h1 className="welcome-title" id="welcome-title">
                What’s on your <em>mind?</em>
              </h1>
              <p className="welcome-copy">Bring a question, a half-formed idea, or a knot you can’t quite untangle. We’ll work through it together.</p>
              <div className="suggestions" aria-label="Suggested prompts">
                {prompts.map(({ label, icon: Icon }, index) => (
                  <button
                    className="suggestion"
                    type="button"
                    key={label}
                    onClick={() => submit(undefined, label)}
                    data-testid={`button-suggestion-${index + 1}`}
                  >
                    <Icon className="suggestion-icon" size={16} strokeWidth={1.8} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section className="messages" aria-label="Messages" aria-live="polite" data-testid="message-list">
              {messages.map((message, index) => (
                <article className={`message-row ${message.role}`} key={message.id} data-testid={`message-${message.role}-${index + 1}`}>
                  {message.role === 'assistant' && (
                    <div className="message-avatar" aria-label="Morrow assistant">
                      <Sparkles size={14} strokeWidth={1.9} />
                    </div>
                  )}
                  <div className="message-body">
                    <div className="message-meta">{message.role === 'user' ? 'You' : 'Morrow'}</div>
                    {message.role === 'assistant' && streaming && message.content.length === 0 && message.id === assistantIdRef.current ? (
                      <div className="typing" aria-label="Assistant is thinking" data-testid="status-thinking">
                        <span /><span /><span />
                      </div>
                    ) : (
                      <div className="message-content" data-testid={`text-message-${message.id}`}>{message.content}</div>
                    )}
                    {message.role === 'assistant' && error && message.id === assistantIdRef.current && (
                      <div className="error-box" role="alert" data-testid="status-chat-error">
                        <span>{error}</span>
                        <button className="error-retry" type="button" onClick={retry} data-testid="button-retry">Try again</button>
                      </div>
                    )}
                    {message.role === 'assistant' && !streaming && !error && message.content.length > 0 && index === messages.length - 1 && (
                      <div className="message-meta" style={{ marginTop: 10, textTransform: 'none', letterSpacing: 0 }} data-testid="status-response-complete">
                        <Check size={11} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Here with you
                      </div>
                    )}
                  </div>
                </article>
              ))}
              <div ref={messagesEndRef} />
            </section>
          )}

          <div className="composer-wrap">
            <form className="composer" onSubmit={submit} data-testid="form-chat">
              <textarea
                ref={textareaRef}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask whatever’s on your mind…"
                aria-label="Message"
                disabled={streaming}
                data-testid="input-message"
              />
              <button className="send-button" type="submit" disabled={!draft.trim() || streaming} aria-label="Send message" data-testid="button-send">
                <ArrowUp size={18} strokeWidth={2.2} />
              </button>
            </form>
            <div className="composer-hint">
              <span>Thoughtful answers, one question at a time.</span>
              <span><kbd>↵</kbd> send&nbsp;&nbsp; <kbd>⇧ ↵</kbd> new line</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
