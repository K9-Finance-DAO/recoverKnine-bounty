import { Connect } from './components/Connect'
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom'
import { ExploiterAssist } from './pages/ExploiterAssist'
import { BuildTag } from './components/BuildTag'

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
          </nav>
          <div className="space" />
          <BuildTag />
          <Connect />
        </div>
        <div className="card">
          <Routes>
            <Route path="/" element={<ExploiterAssist />} />
            <Route path="/assist" element={<ExploiterAssist />} />
          </Routes>
        </div>
      </div>
    </HashRouter>
  )
}
