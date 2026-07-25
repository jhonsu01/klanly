/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El backend usa driver Node (bcryptjs, neon serverless) -> runtime nodejs por ruta.
  experimental: {
    serverComponentsExternalPackages: ["@neondatabase/serverless", "bcryptjs", "nodemailer"],
  },
};

export default nextConfig;
