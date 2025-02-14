set -e

cd $(dirname $0)

if [[ ! -d node_modules ]]; then
  npm i --omit=dev --include=optional || (
    (
      npm i --omit=dev --omit=optional ||
      (echo Error installing modules && exit 1)
    ) && echo Error installing optional modules, but regular modules worked
  )
fi

node . $*
