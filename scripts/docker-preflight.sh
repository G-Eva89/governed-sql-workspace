#!/usr/bin/env bash
# shellcheck disable=SC2034
# Sourced by dev scripts — not executed directly.

ensure_docker_access() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  echo "Cannot access the Docker daemon." >&2
  echo "" >&2

  if [[ -S /var/run/docker.sock ]] && [[ ! -r /var/run/docker.sock || ! -w /var/run/docker.sock ]]; then
    echo "Your user does not have permission to use /var/run/docker.sock." >&2
    echo "" >&2
    echo "Fix (WSL/Linux):" >&2
    echo "  sudo usermod -aG docker \"\$USER\"" >&2
    echo "  newgrp docker    # or close this terminal and open a new one" >&2
    echo "" >&2
    echo "Also ensure Docker Desktop → Settings → Resources → WSL Integration" >&2
    echo "is enabled for this distro." >&2
  else
    echo "Docker does not appear to be running." >&2
    echo "Start Docker Desktop, then retry." >&2
  fi

  exit 1
}
