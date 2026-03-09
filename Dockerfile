FROM golang:1.25-bookworm AS builder
WORKDIR /app
COPY app/backend/go.mod app/backend/go.sum ./
RUN go mod download
COPY app/backend/ .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /zpush-server .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /zpush-server /zpush-server
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/zpush-server"]
