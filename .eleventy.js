const path = require("node:path");
const EleventyNavigationPlugin = require("@11ty/eleventy-navigation");

module.exports = async function (eleventyConfig) {
  const { default: EleventyVitePlugin } = await import("@11ty/eleventy-plugin-vite");

  eleventyConfig.addPlugin(EleventyNavigationPlugin);

  eleventyConfig.addPlugin(EleventyVitePlugin, {
    tempFolderName: ".11ty-vite",
    viteOptions: {
      clearScreen: false,
      publicDir: path.resolve(".", "site/_public"),
      build: {
        target: "es2019",
        cssCodeSplit: true,
        assetsInlineLimit: 0,
        rollupOptions: {
          output: {
            entryFileNames: "assets/[name]-[hash].js",
            chunkFileNames: "assets/[name]-[hash].js",
            assetFileNames: "assets/[name]-[hash][extname]"
          }
        }
      }
    }
  });

  eleventyConfig.addPassthroughCopy({ "site/assets": "vite" });

  eleventyConfig.addFilter("trimTrailingSlash", (value) => {
    const input = String(value || "");
    if (input === "/") return "/";
    return input.replace(/\/+$/, "");
  });

  eleventyConfig.addFilter("withSiteUrl", (pathValue, siteUrl) => {
    const base = String(siteUrl || "").replace(/\/+$/, "");
    const pathname = String(pathValue || "").startsWith("/")
      ? String(pathValue)
      : `/${String(pathValue || "")}`;
    return `${base}${pathname}`;
  });

  return {
    dir: {
      input: "site",
      includes: "_includes",
      data: "_data",
      output: "_site"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"]
  };
};
