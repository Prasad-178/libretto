import "./home.css";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
const repo = "https://github.com/Prasad-178/libretto";
const architecture = `${repo}/blob/main/docs/architecture.md`;
const definition = `confirm_message:
  kind: conversation
  readback: "{message}. Is that correct?"
  edges:
    - id: confirmed
      to: save_message
      predicate:
        op: equals
        field: message_confirmed
        value: true`;
export default function Home() {
  return (
    <div className="home">
      <a className="home-skip" href="#main">
        Skip to content
      </a>
      <header className="home-nav">
        <a className="home-logo" href="/" aria-label="Libretto home">
          Ⅱ libretto
        </a>
        <nav aria-label="Main navigation">
          <a className="home-how-link" href="#how-it-works">
            How it works
          </a>
          <a href={architecture}>Architecture</a>
          <a href={repo}>GitHub ↗</a>
          <a className="home-button home-button-ink" href="/studio">
            Open the studio →
          </a>
        </nav>
      </header>
      <main id="main">
        <section className="home-hero home-wrap" aria-labelledby="hero-title">
          <p className="home-eyebrow">Open-source / Voice workflow engine</p>
          <h1 id="hero-title">
            Let the conversation flow.
            <br /> Keep the workflow on track.
          </h1>
          <p className="home-intro">
            Define your voice agent’s stages, transitions, and confirmation
            checks in YAML. See the flow. Hear it work.
          </p>
          <div className="home-actions">
            <a className="home-button home-button-blue" href="/studio">
              Try the studio →
            </a>
            <a className="home-button home-button-outline" href={repo}>
              View on GitHub ↗
            </a>
            <p>
              Bring your own API keys.
              <br />
              Explore the editor without connecting.
            </p>
          </div>
        </section>
        <section
          className="home-wrap"
          aria-label="Illustrative YAML definition and workflow"
        >
          <div className="home-preview">
            <div className="home-preview-bar">
              <span>northline.yaml</span>
              <span>/</span>
              <span>One definition. Two ways to understand it.</span>
            </div>
            <div className="home-preview-content">
              <div className="home-code">
                <p className="home-caption">Define the rules</p>
                <pre>
                  <code>{definition}</code>
                </pre>
              </div>
              <div className="home-flow">
                <p className="home-caption">Inspect the flow</p>
                <div className="home-flow-diagram">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 580 290"
                    preserveAspectRatio="none"
                  >
                    <path d="M290 50V150M290 210V260" stroke="#245EC7" />
                    <path d="M185 30H95Q80 30 80 50V125" stroke="#98A9BA" />
                  </svg>
                  <div className="home-node home-node-confirm">
                    <strong>Confirm details</strong>
                    <span>Read back the current snapshot</span>
                  </div>
                  <div className="home-edge">confirmed = true</div>
                  <div className="home-node home-node-capture">
                    <strong>Capture message</strong>
                    <span>Execute only after the guard passes</span>
                  </div>
                  <p className="home-correction">
                    Details corrected?
                    <br />
                    Return to collection.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          className="home-wrap home-how"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="home-how-intro">
            <h2 id="how-title">
              A conversation.
              <br />
              An explicit process.
            </h2>
            <p>
              Callers won’t follow a script. Your agent still needs to collect
              the right details, ask for confirmation, and know when it can act.
            </p>
          </div>
          <ol>
            {[
              [
                "Define it in YAML",
                "Stages, prompts, fields, and allowed transitions live in a definition you can inspect and version.",
              ],
              [
                "Inspect every step",
                "Follow the graph. See what a stage needs, where it can go, and which guards protect an action.",
              ],
              [
                "Test the conversation",
                "Use voice or text, then inspect state, retrieved sources, and simulated tool receipts.",
              ],
            ].map(([title, body], i) => (
              <li key={title}>
                <span className="home-step">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="home-wrap home-boundary">
          <div>
            <h2>
              Workflow control is explicit.
              <br />
              Language is still probabilistic.
            </h2>
            <p>
              The runtime constrains transitions and checks action
              prerequisites. The model still interprets the caller.{" "}
              <a href={architecture}>Explore the architecture</a> to see where
              those responsibilities meet.
            </p>
          </div>
        </section>
        <section className="home-wrap home-closing">
          <h2>Build a flow. Try a conversation.</h2>
          <a className="home-button home-button-blue" href="/studio">
            Open the studio →
          </a>
        </section>
      </main>
      <footer className="home-footer">
        <a className="home-logo" href="/">
          Ⅱ libretto
        </a>
        <p>
          Built by <a href="https://prasadjs.me">Prasad</a> · Voice workflows,
          written in YAML.
        </p>
        <a href={architecture}>Architecture ↗</a>
        <a href={repo}>GitHub ↗</a>
        <p>Demo uses fictional data and simulated actions.</p>
      </footer>
    </div>
  );
}
