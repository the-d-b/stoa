# Build stage
# Go >=1.26 required: Life360's Cloudflare bot protection blocks the TLS
# ClientHello crypto/tls produces on 1.23 (403) but allows 1.26 (200) —
# confirmed by running identical client code under each version. Don't
# downgrade this without re-testing Life360 connectivity.
FROM golang:1.26-alpine AS builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=1 GOOS=linux go build -o stoa ./cmd/stoa
RUN CGO_ENABLED=1 GOOS=linux go build -o stoa-cli ./cmd/stoa-cli

# Runtime stage
FROM alpine:3.19

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/stoa .
COPY --from=builder /app/stoa-cli .

RUN mkdir -p /data/db /usr/local/share/ca-certificates

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["./stoa"]
