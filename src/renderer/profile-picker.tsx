import { createRoot } from "react-dom/client";
import { ProfilePickerApp } from "./profile-picker-app";
import { installNoSpellcheck } from "@/lib/disable-spellcheck";
import "./index.css";

installNoSpellcheck();

const root = createRoot(document.getElementById("root")!);
root.render(<ProfilePickerApp />);
