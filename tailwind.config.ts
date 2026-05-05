import type { Config } from "tailwindcss";
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        toi: { DEFAULT: "#F97316", fg: "#FED7AA" },
        elle: { DEFAULT: "#A855F7", fg: "#E9D5FF" }
      }
    }
  },
  plugins: []
};
export default config;
