export default function Page () {
  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">Silent Meeting Copilot<small>silent live conversation assistant</small></div>
        <label className="control">Language
          <select defaultValue="auto" disabled>
            <option value="auto">Auto</option>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
          </select>
        </label>
        <span className="pill"><span className="dot" />Helper: not connected</span>
      </div>

      <div className="meters">
        <div className="meter"><span>ME (microphone)</span><div className="bar me"><i style={{ width: "0%" }} /></div></div>
        <div className="meter"><span>OTHERS (system audio)</span><div className="bar others"><i style={{ width: "0%" }} /></div></div>
      </div>

      <div className="grid">
        <section className="panel others"><h2>OTHERS - what they are saying</h2><div className="body">Waiting for the engine...</div></section>
        <section className="panel me"><h2>ME - what you are saying</h2><div className="body">Waiting for the engine...</div></section>
        <section className="panel"><h2>Respond to them</h2><div className="body">Suggestions will appear here once the engine is connected.</div></section>
        <section className="panel"><h2>Your delivery</h2><div className="body">Alignment and red-line guidance will appear here.</div></section>
      </div>

      <div className="foot">Skeleton UI. Live transcripts and coaching arrive when the Cloudflare engine and the desktop helper are connected.</div>
    </div>
  )
}