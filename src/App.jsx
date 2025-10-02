import './App.css'
import { useEffect } from "react";
import { primeAuth } from "./components/TextInput.jsx";
import { setLoginHint } from "./components/TextInput.jsx";
import { LoginHint } from "./data/Login.js";
import Notebook from "./pages/Notebook.jsx"
import MobileNotebook from "./pages/MobileNotebook.jsx"

function App() {

  useEffect(() => { primeAuth(); }, []);
  setLoginHint(LoginHint);

  return (
    <div className="h-full w-full flex items-center justify-center">
      <Notebook />
    </div>
  )
}

export default App