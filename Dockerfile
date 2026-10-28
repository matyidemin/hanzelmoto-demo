FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json config.mjs store.mjs server.mjs jobs.mjs data-ops.mjs ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/hanzelmoto.sqlite
EXPOSE 3000
CMD ["node", "server.mjs"]
