// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const site = "https://docs.samkuo.me";
const ogImageUrl = new URL("/og.png", site).href;

// Docs for 遊樂場（DEC-043）— personal site identity, not a product brand (DEC-004).
export default defineConfig({
  site,
  trailingSlash: "always",
  server: { port: 4322 },
  integrations: [
    starlight({
      title: "我是山姆鍋 · 遊樂場文件",
      description:
        "「我是山姆鍋」的遊樂場用法與工程契約。Playgrounds 是程式識別名，不是品牌。",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "山姆鍋",
      },
      defaultLocale: "root",
      locales: {
        root: {
          label: "繁體中文",
          lang: "zh-TW",
        },
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/sampot/playgrounds",
        },
      ],
      head: [
        {
          tag: "meta",
          attrs: {
            name: "author",
            content: "我是山姆鍋",
          },
        },
        {
          tag: "meta",
          attrs: { property: "og:image", content: ogImageUrl },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:width", content: "1200" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:height", content: "630" },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:image", content: ogImageUrl },
        },
      ],
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "指南",
          items: [
            { label: "開場與場網", slug: "guides/opening-a-field" },
            { label: "沙盒與 .sam", slug: "guides/sandboxes-and-sam" },
            { label: "從網址開啟", slug: "guides/open-from-url" },
            { label: "密鑰庫", slug: "guides/secret-store" },
          ],
        },
        {
          label: "概念",
          items: [
            { label: "SAM", slug: "concepts/sam" },
            { label: "畫布與遊樂場介面", slug: "concepts/canvas" },
            { label: "場與 origin", slug: "concepts/field-origin" },
          ],
        },
        {
          label: "Host API",
          items: [
            { label: "概覽", slug: "host-api" },
            { label: "runCmd 邊界", slug: "host-api/run-cmd" },
          ],
        },
        {
          label: "決策與用語",
          items: [
            { label: "決策索引", slug: "decisions" },
            { label: "用語", slug: "glossary" },
          ],
        },
      ],
    }),
  ],
});
