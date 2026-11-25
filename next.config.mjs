/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  webpack: (config) => {
    if (process.env.CF_BUILD === '1') {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        sharp: false,
      };
    }
    return config;
  },
};

export default nextConfig;

