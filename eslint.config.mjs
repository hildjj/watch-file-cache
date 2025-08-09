import js from "@peggyjs/eslint-config/module.js";
import mocha from "@peggyjs/eslint-config/mocha.js";
import ts from "@peggyjs/eslint-config/ts.js";

export default [
  {
    ignores: [
      "lib/**",
    ],
  },
  ...js,
  ...ts,
  ...mocha,
];
