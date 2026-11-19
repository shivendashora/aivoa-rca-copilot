import { Route, Routes } from "react-router-dom";
import CommonMain from "./components/common/main";
import Home from "./components/main/home";
import AuthMain from "./components/auth/auth-main";
import ProtectedRoutes from "./layouts/protected-routes";

export default function App() {
  return(
    <Routes>
      <Route path = "/" element={<AuthMain />} />
      <Route path="/main" element={<ProtectedRoutes><Home /></ProtectedRoutes>} />
      <Route path="/common" element={<CommonMain />} />
    </Routes>
  )
}
