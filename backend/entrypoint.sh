#!/bin/sh
# Run update-ca-certificates if any custom certs are present in the mounted volume
if ls /usr/local/share/ca-certificates/*.crt 2>/dev/null | grep -q .; then
    echo "Updating CA certificates..."
    update-ca-certificates 2>/dev/null || true
fi

exec "$@"
