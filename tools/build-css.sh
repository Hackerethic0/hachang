#!/bin/sh
cd "$(dirname "$0")/.." && npx --yes tailwindcss@3.4.17 -c tailwind.config.js -i tools/tw-input.css -o public/vendor/app.css --minify
