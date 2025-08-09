"use strict";

/** @type {import('typedoc').TypeDocOptions} */
module.exports = {
  entryPoints: ["src/index.ts"],
  out: "docs",
  cleanOutputDir: true,
  sidebarLinks: {
    "GitHub": "https://github.com/hildjj/watch-file-cache/",
    "Documentation": "http://hildjj.github.io/watch-file-cache/",
  },
  navigation: {
    includeCategories: false,
    includeGroups: false,
  },
  categorizeByGroup: false,
  sort: ["static-first", "alphabetical"],
  exclude: ["test/**"],
};
