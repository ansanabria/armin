import { createRoot } from "react-dom/client";
import App from "./App";
import { installNoSpellcheck } from "@/lib/disable-spellcheck";
import { installViewTransitionRejectionHandler } from "@/lib/view-transitions";
import "@xyflow/react/dist/style.css";
import "./index.css";

installNoSpellcheck();
installViewTransitionRejectionHandler();

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
