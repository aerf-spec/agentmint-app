export default function HomePage() {
  return (
    <main className="container" style={{ paddingTop: "7rem", paddingBottom: "4rem" }}>
      <section className="section visible">
        <p className="section-label">AgentMint</p>
        <h1 className="section-title">Packet system scaffold is ready for content wiring.</h1>
        <p className="section-body">
          The implementation work in this repo covers the shared visual system, typed packet
          pipeline, hashing, and component primitives. Use <code>/test</code> to preview the UI
          components on the production canvas.
        </p>
      </section>
    </main>
  );
}
