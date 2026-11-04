#!/bin/sh
# CUSTOM(brand): nightly offsite backup for /opt/xseek-new-api.
#
# Runs the existing backup.sh, encrypts the newest dump + config archive to
# the age public key in ops/age-recipient.txt, and uploads only the
# ciphertext to the R2 bucket. The private key never touches the server, so
# a leaked bucket or a compromised server cannot read old backups.
#
# Expects rclone remote "r2" (configured in /root/.config/rclone/rclone.conf)
# and the recipient file next to this script.
set -eu
umask 077

APP_DIR=/opt/xseek-new-api
# Overridable so the pipeline can be tested against a local directory and a
# throwaway key without touching R2 or the real recipient.
RECIPIENT="${RECIPIENT:-$APP_DIR/ops/age-recipient.txt}"
REMOTE="${REMOTE:-r2:bozzii/newapi}"
KEEP_LOCAL_DAYS=7

cd "$APP_DIR"
sh ./backup.sh

dump=$(ls -t backups/newapi-*.dump | head -1)
stamp=${dump#backups/newapi-}
stamp=${stamp%.dump}
config="backups/config-${stamp}.tar.gz"
test -s "$dump"
test -s "$config"

for f in "$dump" "$config"; do
  age -R "$RECIPIENT" -o "$f.age" "$f"
  rclone copyto --s3-no-check-bucket "$f.age" "$REMOTE/$(basename "$f").age"
  rm -f "$f.age"
done

# Uploaded copies are the long-term archive; keep a week locally for fast restores.
find backups -name 'newapi-*.dump' -mtime +"$KEEP_LOCAL_DAYS" -delete
find backups -name 'config-*.tar.gz' -mtime +"$KEEP_LOCAL_DAYS" -delete

printf 'Offsite backup uploaded: %s\n' "$stamp"
