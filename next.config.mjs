/** @type {import('next').NextConfig} */
const nextConfig = {
  // dev:demo가 기본 dev 서버와 동시에 돌 수 있도록 빌드 폴더를 분리한다.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
