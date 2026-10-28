FROM golang:1.26.10-bookworm AS builder
WORKDIR /app
COPY app/backend/go.mod app/backend/go.sum ./
RUN go mod download
COPY app/backend/ .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /zcrypt-server .

FROM debian:bookworm-slim AS geoip
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN set -eu; mkdir /geo; \
    for m in "$(date -u +%Y-%m)" "$(date -u -d "$(date -u +%Y-%m-15) -1 month" +%Y-%m)"; do \
      if curl -fsSL --retry 3 "https://download.db-ip.com/free/dbip-city-lite-$m.mmdb.gz" | gunzip > /geo/dbip-city-lite.mmdb; then exit 0; fi; \
    done; \
    echo "could not download the DB-IP city database" >&2; exit 1

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /zcrypt-server /zcrypt-server
COPY --from=geoip /geo/dbip-city-lite.mmdb /geo/dbip-city-lite.mmdb
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/zcrypt-server"]
