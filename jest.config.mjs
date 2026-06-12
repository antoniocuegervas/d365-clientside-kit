/** @type {import('jest').Config} */
export default {
  testEnvironment: "jsdom",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  passWithNoTests: true,
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
