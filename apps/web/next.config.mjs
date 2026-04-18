/** @type {import('next').NextConfig} */

const nextConfig = {
  // Allow images from external domains as sources are added
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com', // Google profile pictures
      },
    ],
  },
};

export default nextConfig;
