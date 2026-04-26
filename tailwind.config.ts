import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["system-ui", "Impact", "Haettenschweiler", "Arial Black", "sans-serif"],
      },
      colors: {
        meme: {
          pink: "#ff2ea6",
          yellow: "#ffe600",
          cyan: "#00e5ff",
          purple: "#8a2be2",
          ink: "#0b0b12",
        },
      },
      keyframes: {
        "score-pop": {
          "0%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.35) rotate(-2deg)" },
          "100%": { transform: "scale(1) rotate(0)" },
        },
        "shake": {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-6px)" },
          "75%": { transform: "translateX(6px)" },
        },
        "confetti-fall": {
          "0%": { transform: "translateY(-20vh) rotate(0)", opacity: "1" },
          "100%": { transform: "translateY(120vh) rotate(720deg)", opacity: "0.6" },
        },
        "gradient-pan": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "score-pop": "score-pop 180ms ease-out",
        "shake": "shake 220ms ease-in-out",
        "confetti-fall": "confetti-fall 2.4s linear forwards",
        "gradient-pan": "gradient-pan 8s ease infinite",
      },
      backgroundImage: {
        "meme-gradient":
          "linear-gradient(120deg,#ff2ea6 0%,#8a2be2 30%,#00e5ff 60%,#ffe600 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
