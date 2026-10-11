import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/manrope";
import { App } from "./App";
import { useMotionPreference } from "./motion";
import "./styles.css";
import "./purchasing.css";
import "./operations.css";
import "./assistant.css";

function MotionRoot() {
  const reduced = useMotionPreference();
  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      <App />
    </MotionConfig>
  );
}
createRoot(document.getElementById("root")!).render(<MotionRoot />);
