import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "node_modules/**", "storage/**", "load-tests/**", "drizzle/**", "public/sw.js", "public/app/sw.js", "supabase/functions/**", ".static-build/**", "out-static/**", "mobile/node_modules/**", "mobile/*/www/**", "mobile/*/android/**", "mobile/*/ios/**"] },
  ...next,
  {
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
    },
  },
];
export default config;
