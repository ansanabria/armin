import { createRoot } from "react-dom/client";
import App from "./App";
import { installNoSpellcheck } from "@/lib/disable-spellcheck";
import "@xyflow/react/dist/style.css";
import "./index.css";

installNoSpellcheck();

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
