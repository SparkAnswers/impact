// Extends the scaffolded config (see .config/README.md). Adds: copy nested panel assets (img/) into dist.
import CopyWebpackPlugin from 'copy-webpack-plugin';
import type { Configuration } from 'webpack';
import grafanaConfig, { type Env } from './.config/webpack/webpack.config';

const config = async (env: Env): Promise<Configuration> => {
  const base = await grafanaConfig(env);
  return {
    ...base,
    plugins: [
      ...(base.plugins ?? []),
      new CopyWebpackPlugin({
        patterns: [{ from: 'panels/*/img/**', to: '[path][name][ext]', noErrorOnMissing: true }],
      }),
    ],
  };
};

export default config;
