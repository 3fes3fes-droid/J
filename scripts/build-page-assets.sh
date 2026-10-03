#!/usr/bin/env bash
set -euo pipefail

source_root="${1:-}"
if [[ -z "${source_root}" || ! -d "${source_root}" ]]; then
  echo "Usage: scripts/build-page-assets.sh <comic-pages-directory>" >&2
  exit 64
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_root="${project_root}/public/media/pages"
cover_root="${project_root}/public/media/covers"
mkdir -p "${output_root}" "${cover_root}"

export output_root
find "${source_root}" -mindepth 2 -maxdepth 2 -type f -name '*.png' -print0 \
  | xargs -0 -P "${IMAGE_JOBS:-8}" -n 1 bash -c '
      source_file="$1"
      volume="$(basename "$(dirname "${source_file}")")"
      stem="$(basename "${source_file}" .png)"
      destination="${output_root}/${volume}/${stem}.webp"
      mkdir -p "$(dirname "${destination}")"
      [[ -s "${destination}" ]] || convert "${source_file}" -strip -resize "420x500>" -quality 36 "${destination}"
    ' _

for volume in $(seq -w 0 30); do
  source_file="${source_root}/${volume}/${volume}-001.png"
  destination="${cover_root}/${volume}.webp"
  [[ -s "${destination}" ]] || convert "${source_file}" -fuzz 4% -trim +repage -strip -quality 82 "${destination}"
done

page_count="$(find "${output_root}" -type f -name '*.webp' | wc -l)"
cover_count="$(find "${cover_root}" -type f -name '*.webp' | wc -l)"
printf 'pages=%s covers=%s\n' "${page_count}" "${cover_count}"
