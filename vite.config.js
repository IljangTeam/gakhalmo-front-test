import { defineConfig, loadEnv } from 'vite';

// CORS 우회용 dev proxy. localStorage에 저장된 target 값은 런타임에서만 유효하므로
// dev 서버 proxy 타겟은 환경 변수 TEMP_FRONT_API_BASE 또는 기본값(dev) 을 쓴다.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.TEMP_FRONT_API_BASE || 'https://api.dev.gakhalmo.klr.kr';

  return {
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
