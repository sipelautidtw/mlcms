/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        maritime: {
          50: "#f0f7ff",
          500: "#1e6fb8",
          700: "#155084",
          900: "#0d3252",
        },
      },
    },
  },
  plugins: [],
};
