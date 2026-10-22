#!/bin/sh
parent_pid=$1
bundle=$2
work=$3
cache=$4
stage="$work/BetterBar.app"
previous="$work/previous.app"

# Do not touch the executable while the app is running. Give a blocked exit a
# bounded wait, then leave the original bundle in place.
attempts=0
while kill -0 "$parent_pid" 2>/dev/null; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
        printf 'BetterBar did not exit; the original app was left in place.\n'
        printf 'failed\n' > "$cache/signature-repair-result"
        /bin/rm -rf "$work"
        exit 1
    fi
    /bin/sleep 1
done

fail() {
    printf 'Signature repair failed; restoring the previous app.\n'
    if [ -d "$previous" ]; then
        /bin/rm -rf "$bundle"
        /bin/mv "$previous" "$bundle" || exit 1
    fi
    printf 'failed\n' > "$cache/signature-repair-result"
    /usr/bin/touch "$cache/signature-repair-reopen"
    /usr/bin/open -n "$bundle"
    /bin/rm -rf "$work"
    exit 1
}

# Both bundles are on the same filesystem, so each move is atomic.
/bin/mv "$bundle" "$previous" || fail
/bin/mv "$stage" "$bundle" || fail
/usr/bin/codesign --verify --deep --strict "$bundle" || fail
printf 'success\n' > "$cache/signature-repair-result"
/usr/bin/touch "$cache/signature-repair-reopen"
/usr/bin/open -n "$bundle" || fail
/bin/rm -rf "$work"
