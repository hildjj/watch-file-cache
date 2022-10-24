"use strict";

module.exports = {
  root: true,
  extends: [
    "@peggyjs",
    "@peggyjs/eslint-config/typescript",
    "plugin:eslint-plugin/recommended",
  ],
  ignorePatterns: [
    "/coverage/",
    "/lib/", // Generated
    "/node_modules/",
  ],
  parserOptions: {
    ecmaVersion: 2020,
  },
  overrides: [
    {
      files: ["test/**/*.js"],
      extends: [
        "plugin:mocha/recommended",
      ],
      rules: {
        "mocha/no-mocha-arrows": "off",
      },
    },
  ],
};
