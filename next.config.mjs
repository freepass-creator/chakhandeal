/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    outputFileTracingIncludes: {
      "/api/v1/contract/*/guest": [
        "./node_modules/@sparticuz/chromium/bin/**/*",
        "./node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
      ],
    },
  },
};

export default nextConfig;
