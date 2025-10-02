import './App.css';
import { useEffect, useState } from "react";
import { primeAuth, setLoginHint } from "./components/TextInput.jsx";
import { LoginHint } from "./data/Login.js";
import Notebook from "./pages/Notebook.jsx";
import MobileNotebook from "./pages/MobileNotebook.jsx";

function App() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    primeAuth();
    setLoginHint(LoginHint);

    const handleResize = () => {
      setIsMobile(window.innerWidth < 900);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="h-full w-full flex items-center justify-center">
      {isMobile ? <MobileNotebook /> : <Notebook />}
    </div>
  );
}

export default App;