FROM golang:1.25-bookworm AS builder
WORKDIR /app
COPY app/backend/go.mod app/backend/go.sum ./
RUN go mod download
COPY app/backend/ .
RUN CGO_ENABLED=0 go build -o /zpush-server .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /zpush-server /zpush-server
EXPOSE 8080
CMD ["/zpush-server"]
