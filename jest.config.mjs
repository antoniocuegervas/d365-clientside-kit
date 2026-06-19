/** @type {import('jest').Config} */
export default {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  passWithNoTests: true,
  // For `npm run coverage`: instrument every first-party source file, so files
  // no test touches still show up (Jest otherwise only reports imported ones).
  // Generated and type-only files are excluded so the numbers reflect real code.
  collectCoverageFrom: [
    "shared/**/*.{ts,tsx}",
    "clientui/**/*.{ts,tsx}",
    "clienthooks/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/generated/**",
  ],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        // Jest runs CJS; the repo tsconfig targets bundlers. Override just
        // the module plumbing, keep strictness from tsconfig.json.
        tsconfig: {
          module: "CommonJS",
          moduleResolution: "Node",
          jsx: "react-jsx",
          esModuleInterop: true,
        },
      },
    ],
  },
  // Fluent v9 and its griffel deps ship dual CJS/ESM, CJS resolves fine under
  // jest, so no transformIgnorePatterns surgery is needed.
};
