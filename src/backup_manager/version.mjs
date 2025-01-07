import packageData from '../../package.json' with { type: 'json' };

const version = packageData.version;

export function getProgramVersion() {
  return version;
}
