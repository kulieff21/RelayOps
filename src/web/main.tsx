import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/manrope";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>,
);
