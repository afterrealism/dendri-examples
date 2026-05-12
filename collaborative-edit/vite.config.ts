import tailwindcss from "@tailwindcss/vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		dedupe: ["yjs", "y-protocols", "@afterrealism/dendri-client"]
	},
	plugins: [tailwindcss(), sveltekit()],
});
