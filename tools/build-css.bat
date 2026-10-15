@echo off
cd /d "%~dp0.."
echo Rebuild public\vendor\app.css (needed only after you add NEW Tailwind classes in public\index.html)
echo Requires Node.js + internet once (downloads tailwindcss 3.4).
call npx --yes tailwindcss@3.4.17 -c tailwind.config.js -i tools\tw-input.css -o public\vendor\app.css --minify
pause
