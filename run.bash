set -e

cd $(dirname $0)

if [[ ! -d node_modules ]]; then
  npm i --omit=dev --include=optional
  #npm i --omit=dev --omit=optional
fi

node . $*
