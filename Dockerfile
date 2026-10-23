FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV HOST=0.0.0.0 PORT=4173 WINTICKET_DATA_DIR=/app/data
EXPOSE 4173
VOLUME ["/app/data"]
CMD ["node", "server.mjs"]
