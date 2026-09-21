import { Route, Routes } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicOnlyRoute from './components/PublicOnlyRoute'
import Dashboard from './pages/Dashboard'
import Graph from './pages/Graph'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Obligations from './pages/Obligations'
import Risks from './pages/Risks'
import Signup from './pages/Signup'
import Sources from './pages/Sources'
import Upload from './pages/Upload'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <Login />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/signup"
        element={
          <PublicOnlyRoute>
            <Signup />
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/upload" element={<Upload />} />
                <Route path="/sources" element={<Sources />} />
                <Route path="/obligations" element={<Obligations />} />
                <Route path="/risks" element={<Risks />} />
                <Route path="/graph" element={<Graph />} />
              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
