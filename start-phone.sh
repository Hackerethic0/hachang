#!/bin/sh
cd "$(dirname "$0")"
HOST=0.0.0.0 exec node --disable-warning=ExperimentalWarning server-lite.js
