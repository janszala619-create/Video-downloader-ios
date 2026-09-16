import { HashRouter as BrowserRouter, Routes, Route } from 'react-router-dom'
import { Navigation } from './components/Navigation'
import { HomePage } from './pages/HomePage'
import { HistoryPage } from './pages/HistoryPage'
import { PlayerPage } from './pages/PlayerPage'
import { useHistory } from './hooks/useHistory'

export default function App() {
  const { items, add, remove, clear } = useHistory()

  return (
    <BrowserRouter>
      <div className="app-screen bg-bg font-sans">
        <Routes>
          <Route path="/" element={<HomePage onDownloadComplete={add} />} />
          <Route
            path="/history"
            element={<HistoryPage items={items} onDelete={remove} onClear={clear} />}
          />
          <Route path="/player" element={<PlayerPage />} />
        </Routes>
        <Navigation />
      </div>
    </BrowserRouter>
  )
}
