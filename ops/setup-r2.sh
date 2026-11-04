#!/bin/sh
# CUSTOM(brand): one-time setup of the rclone "r2" remote used by
# backup-offsite.sh. Run it yourself in an SSH session on the server; it
# prompts for the R2 keys without echoing them, so they never appear in the
# terminal, shell history, or any chat transcript.
set -eu
umask 077

ENDPOINT=https://0ccebe9ff1749230e30e42cbfd06115d.r2.cloudflarestorage.com
CONF=/root/.config/rclone/rclone.conf

printf 'R2 Access Key ID: '
stty -echo; read -r key_id; stty echo; echo
printf 'R2 Secret Access Key: '
stty -echo; read -r secret; stty echo; echo
test -n "$key_id" && test -n "$secret"

mkdir -p "$(dirname "$CONF")"
cat > "$CONF" <<EOF
[r2]
type = s3
provider = Cloudflare
access_key_id = $key_id
secret_access_key = $secret
endpoint = $ENDPOINT
acl = private
no_check_bucket = true
EOF
chmod 600 "$CONF"

# Prove the keys work by writing and reading back one small object.
echo "ok $(date -u +%FT%TZ)" > /tmp/r2-check.txt
rclone copyto /tmp/r2-check.txt r2:bozzii/newapi/_setup-check.txt
rclone cat r2:bozzii/newapi/_setup-check.txt
rm -f /tmp/r2-check.txt
echo "R2 remote ready."
