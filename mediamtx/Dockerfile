# Wraps the scratch-based mediamtx image with a shell + envsubst so we can
# inject secrets from environment variables at container startup.
FROM bluenviron/mediamtx:latest AS mediamtx
FROM alpine:3.19

# Install envsubst (part of gettext package)
RUN apk add --no-cache gettext

# Copy mediamtx binary from the official image
COPY --from=mediamtx /mediamtx /mediamtx

EXPOSE 8554 8888 8889 9997

ENTRYPOINT ["/bin/sh", "-c"]
CMD ["envsubst < /mediamtx.yml.template > /mediamtx.yml && exec /mediamtx /mediamtx.yml"]
