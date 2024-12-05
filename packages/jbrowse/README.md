# vite with @jbrowse/react-app

This is a demo of using the @jbrowse/react-app NPM package with vite (see
https://vitejs.dev/)

Vite is a build system that is very fast and becoming more popular, using
esbuild and rollup instead of webpack

This particular demo includes several polyfills that are needed for JBrowse
including the Buffer polyfill

## Demo of `@jbrowse/react-app` with vite

See this app running at https://jbrowse.org/demos/app-vite/.

## Usage

Run `yarn` and then `yarn dev` to start a development instance

Run `yarn build` which produces a `build` directory that can be deployed to a
static web server
