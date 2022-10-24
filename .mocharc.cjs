"use strict";

module.exports = {
  diff: true,
  "full-trace": true,
  recursive: true,
  reporter: "spec",
  loader: "ts-node/esm",
  spec: "test/**/*.spec.ts",
  timeout: 10000,
};
