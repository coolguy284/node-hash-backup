set -e

cd $(dirname $0)

if [[ ! -d node_modules ]]; then
  npm i --omit dev
fi

node . $*
