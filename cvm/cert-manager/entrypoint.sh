#!/bin/sh
set -e

echo "Starting Nginx and Certificate Manager..."
echo "Domain: ${DOMAIN}"
echo "Dev Mode: ${DEV_MODE}"

# Derive EKM HMAC key from TEE so the operator never sees it.
echo "Deriving EKM HMAC key from TEE (dstack)..."
if EKM_SHARED_SECRET_DERIVED=$(uv run python3 -c "
from dstack_sdk import DstackClient
c = DstackClient()
print(c.get_key('ekm/hmac-key/v1').decode_key().hex())
"); then
  EKM_SHARED_SECRET="${EKM_SHARED_SECRET_DERIVED}"
  export EKM_SHARED_SECRET
  echo "EKM HMAC key derived from TEE successfully."
elif [ -n "${EKM_SHARED_SECRET}" ]; then
  echo "dstack key derivation failed, falling back to EKM_SHARED_SECRET from environment."
else
  echo "dstack key derivation failed and EKM_SHARED_SECRET is not set." >&2
  exit 1
fi

# Start supervisor to manage both nginx and cert manager
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
