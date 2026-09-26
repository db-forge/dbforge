import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: ["contracts/**"],
  },
];

export default eslintConfig;
