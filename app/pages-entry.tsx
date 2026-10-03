import { createRoot } from "react-dom/client";
import DatabaseApp from "./database-app";
import "./globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");
createRoot(root).render(<DatabaseApp />);
