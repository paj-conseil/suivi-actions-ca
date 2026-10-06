import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relative : l'application fonctionne sur n'importe quel hébergement statique
export default defineConfig({ plugins: [react()], base: "./" });
