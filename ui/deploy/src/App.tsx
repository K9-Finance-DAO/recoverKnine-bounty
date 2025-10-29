import { Connect } from './components/Connect'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import { ExploiterAssist } from './pages/ExploiterAssist'
import Tokens from './pages/Tokens'
import { BuildTag } from './components/BuildTag'
import DeployMultiFunder from './pages/DeployMultiFunder'

export default function App() {
  return (
    <HashRouter>
      <div className="container">
        <div className="header">
          <h2 style={{ margin: 0 }}>K9 Recovery Bounty</h2>
          <span className="pill muted">KnineRecoveryBountyDecayAccept</span>
          <div className="space" />
          <nav className="row" style={{ gap: 6 }}>
            <NavLink to="/" className={({ isActive }) => `pill ${isActive ? '' : 'muted'}`}>Assist Exploiter</NavLink>
            <NavLink to="/tokens" className={({ isActive }) => `pill ${isActive ? '' : 'muted'}`}>Tokens</NavLink>
            <NavLink to="/multi" className={({ isActive }) => `pill ${isActive ? '' : 'muted'}`}>Deploy Multi‑Funder</NavLink>
          </nav>
          <div className="space" />
          <BuildTag />
          <Connect />
        </div>
        <div className="card">
          <Routes>
            <Route path="/" element={<ExploiterAssist />} />
            <Route path="/assist" element={<ExploiterAssist />} />
            <Route path="/tokens" element={<Tokens />} />
            <Route path="/multi" element={<DeployMultiFunder />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
